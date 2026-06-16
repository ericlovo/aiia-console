// AiiaWordmark — the AIIA brand mark.
//
// Custom SVG letterforms, drawn as stroke-only outlines on a single grid.
// All four letters share the same stroke weight and baseline; the A and I
// are constructed from the same architectural vocabulary (straight cuts,
// 90° corners, no curves) so they read as a unified family.
//
// Workshop / Instrument aesthetic: looks like schematic wires drawn on an
// instrument panel rather than a typed wordmark. Scales cleanly because it
// is geometry, not a font.

type Props = {
  /** Rendered height in pixels. Width derives from the 4:1 viewBox. */
  height?: number;
  /** Stroke width override (defaults to 6 on the 160×80 viewBox). */
  strokeWidth?: number;
  /** Optional copper accent dot — useful for active states. */
  accent?: boolean;
  className?: string;
  /** Accessible label; defaults to "AIIA". */
  title?: string;
};

export function AiiaWordmark({
  height = 20,
  strokeWidth = 6,
  accent = false,
  className,
  title = "AIIA",
}: Props) {
  const width = height * 2;
  return (
    <svg
      viewBox="0 0 160 80"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>

      {/* A1 — open polyline forming the outer triangle silhouette + crossbar */}
      <polyline points="0,80 14,0 26,0 40,80" />
      <line x1="6" y1="50" x2="34" y2="50" />

      {/* I1 — rectangle outline (stroke-only, no fill) */}
      <rect x="58" y="0" width="12" height="80" />

      {/* I2 — same rectangle outline */}
      <rect x="88" y="0" width="12" height="80" />

      {/* A2 — mirror of A1 */}
      <polyline points="118,80 132,0 144,0 158,80" />
      <line x1="124" y1="50" x2="152" y2="50" />

      {/* Optional copper registration mark — bottom right of the wordmark */}
      {accent && (
        <rect
          x="152"
          y="74"
          width="6"
          height="6"
          fill="currentColor"
          stroke="none"
          style={{ color: "var(--color-cinnabar-400)" }}
        />
      )}
    </svg>
  );
}
