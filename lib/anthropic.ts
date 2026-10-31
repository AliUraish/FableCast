// Raw Anthropic Messages API client with structured output through one forced tool.
// Parse with Zod; on failure retry once with the validation error attached; the caller falls back after that.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "./env";
import { HttpError, errMsg, guarded, retry, withTimeout } from "./resilience";
import { addClaudeTokens } from "./limits";

const URL = "https://api.anthropic.com/v1/messages";

export interface StructuredResult<T> {
  value: T;
  tokens: number;
  model: string;
}

interface ToolUseBlock { type: "tool_use"; name: string; input: unknown }
interface MessagesResponse {
  model: string;
  content: ({ type: string } & Partial<ToolUseBlock> & { text?: string })[];
  usage?: { input_tokens: number; output_tokens: number };
}

/**
 * Anthropic validates tool schemas as JSON Schema 2020-12, where the draft-07 tuple form
 * `"items": [a, b]` is invalid. Turn tuples into fixed-length arrays (`items: a` or `anyOf`);
 * Zod still checks the exact tuple shape when the answer comes back.
 */
export function to202012(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(to202012);
  if (!node || typeof node !== "object") return node;
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) if (k !== "$schema" && k !== "additionalItems") o[k] = to202012(v);
  if (Array.isArray(o.items)) {
    const parts = o.items as unknown[];
    const same = parts.every((p) => JSON.stringify(p) === JSON.stringify(parts[0]));
    o.items = same ? parts[0] : { anyOf: parts };
    o.minItems ??= parts.length;
    o.maxItems ??= parts.length;
  }
  return o;
}

function toolSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return to202012(zodToJsonSchema(schema, { $refStrategy: "none", target: "jsonSchema7" })) as Record<string, unknown>;
}

async function callOnce(
  model: string, system: string, messages: { role: "user" | "assistant"; content: string }[],
  toolName: string, inputSchema: Record<string, unknown>, maxTokens: number, timeoutMs: number,
): Promise<{ input: unknown; tokens: number; model: string }> {
  const key = env().anthropicKey;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return guarded("claude", () =>
    retry(() =>
      withTimeout(timeoutMs, async (signal) => {
        const res = await fetch(URL, {
          method: "POST",
          signal,
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          // Current models reject forced tool_choice ("tool"/"any"), so: auto + a firm instruction to call
          // the tool. Zod validates the input and structured() retries once if it is missing or wrong.
          // Thinking tokens count toward max_tokens, so keep effort low and leave plenty of room.
          body: JSON.stringify({
            model,
            max_tokens: Math.max(maxTokens, 16000),
            system: `${system}\n\nRespond ONLY by calling the \`${toolName}\` tool, exactly once, with the complete JSON. Do not write any other text.`,
            messages,
            tools: [{ name: toolName, description: `Return the ${toolName} as structured JSON.`, input_schema: inputSchema }],
            tool_choice: { type: "auto" },
            output_config: { effort: "low" },
          }),
        });
        if (!res.ok) throw new HttpError(res.status, `Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const data = (await res.json()) as MessagesResponse;
        const block = data.content.find((b) => b.type === "tool_use" && b.name === toolName);
        if (!block) throw new Error("Claude returned no tool_use block");
        const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
        addClaudeTokens(tokens);
        return { input: block.input, tokens, model: data.model };
      }),
    ),
  );
}

/**
 * Ask Claude for JSON matching `schema`. Retries once with the Zod error attached.
 * `check` can add semantic validation (returns an error string, or null when fine).
 */
export async function structured<S extends z.ZodTypeAny>(opts: {
  model: string;
  system: string;
  prompt: string;
  toolName: string;
  schema: S;
  maxTokens?: number;
  timeoutMs?: number;
  check?: (v: z.infer<S>) => string | null;
}): Promise<StructuredResult<z.infer<S>>> {
  const inputSchema = toolSchema(opts.schema);
  const messages: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: opts.prompt }];
  let tokens = 0;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await callOnce(opts.model, opts.system, messages, opts.toolName, inputSchema, opts.maxTokens ?? 4096, opts.timeoutMs ?? 40_000);
    tokens += r.tokens;
    const parsed = opts.schema.safeParse(r.input);
    if (parsed.success) {
      const problem = opts.check?.(parsed.data) ?? null;
      if (!problem) return { value: parsed.data, tokens, model: r.model };
      lastErr = problem;
    } else {
      lastErr = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    }
    messages.push(
      { role: "assistant", content: `(previous ${opts.toolName} output)\n${JSON.stringify(r.input).slice(0, 6000)}` },
      { role: "user", content: `That output was rejected:\n${lastErr}\nReturn a corrected ${opts.toolName} that fixes every problem.` },
    );
  }
  throw new Error(`Claude output invalid after retry: ${errMsg(lastErr)}`);
}
