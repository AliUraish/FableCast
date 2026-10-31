// Tiny pixel-grid icons drawn with currentColor squares (no colour of their own).
const ICONS: Record<string, string[]> = {
  play: ["1000000", "1110000", "1111100", "1111111", "1111100", "1110000", "1000000"],
  pause: ["1100011", "1100011", "1100011", "1100011", "1100011", "1100011", "1100011"],
  restart: ["0011100", "0100010", "1000001", "1010001", "1110001", "0000010", "0011100"],
  arrow: ["0001000", "0000100", "0000010", "1111111", "0000010", "0000100", "0001000"],
  back: ["0001000", "0010000", "0100000", "1111111", "0100000", "0010000", "0001000"],
  smile: ["001111100", "010000010", "101000101", "100000001", "100000001", "101000101", "100111001", "010000010", "001111100"],
  book: ["000000000", "011000110", "100101001", "101101101", "100101001", "101101101", "100101001", "111111111", "000010000"],
  sound: ["0001000", "0011010", "1111001", "1111001", "1111001", "0011010", "0001000"],
  mute: ["0001000", "0011000", "1111101", "1111010", "1111101", "0011000", "0001000"],
};

export function PixelIcon({ name, size = 14 }: { name: keyof typeof ICONS | string; size?: number }) {
  const rows = ICONS[name] ?? ICONS.play;
  const n = rows.length;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} aria-hidden shapeRendering="crispEdges" style={{ display: "block" }}>
      {rows.flatMap((r, y) =>
        r.split("").map((c, x) => (c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)),
      )}
    </svg>
  );
}
