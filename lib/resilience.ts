// Timeouts, retries with backoff + jitter, a per-provider circuit breaker and a tiny concurrency pool.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error(`timeout after ${ms} ms`)), ms);
  try {
    return await run(ctl.signal);
  } finally {
    clearTimeout(timer);
  }
}

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export async function retry<T>(fn: (attempt: number) => Promise<T>, opts: { retries?: number; baseMs?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseMs ?? 400;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      last = err;
      const status = err instanceof HttpError ? err.status : 0;
      // Client errors other than rate limits are not worth retrying.
      if (status && !RETRYABLE.has(status)) break;
      if (attempt < retries) {
        const wait = base * 2 ** attempt * (0.7 + Math.random() * 0.6);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw last;
}

// ---------- circuit breaker ----------
const breakers = new Map<string, { fails: number; openUntil: number }>();

export function breakerOpen(provider: string): boolean {
  const b = breakers.get(provider);
  return !!b && b.openUntil > Date.now();
}

export function recordSuccess(provider: string) {
  breakers.set(provider, { fails: 0, openUntil: 0 });
}

export function recordFailure(provider: string) {
  const b = breakers.get(provider) ?? { fails: 0, openUntil: 0 };
  b.fails += 1;
  if (b.fails >= 3) {
    b.openUntil = Date.now() + 60_000;
    b.fails = 0;
  }
  breakers.set(provider, b);
}

/** Run `fn` under the breaker: skipped (throws) while open; failures and successes are recorded. */
export async function guarded<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  if (breakerOpen(provider)) throw new Error(`${provider} circuit open`);
  try {
    const v = await fn();
    recordSuccess(provider);
    return v;
  } catch (err) {
    recordFailure(provider);
    throw err;
  }
}

/** Map with bounded concurrency, preserving order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
