// "BEDTIME STORIES" in Geist Pixel, each letter bouncing in turn (stepped, so it stays pixel-crisp).
// Screen readers get the plain text once; reduced motion turns the bounce off (globals.css).
export function BounceTitle({ text = "BEDTIME STORIES" }: { text?: string }) {
  let i = 0;
  return (
    <p className="bounce-title" aria-label={text}>
      {text.split(" ").map((word, w) => (
        <span key={w} className="bounce-word" aria-hidden="true">
          {[...word].map((ch) => (
            <span key={i} className="bounce-ch" style={{ "--i": i++ } as React.CSSProperties}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}
