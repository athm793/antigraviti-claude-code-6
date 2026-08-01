/**
 * The KeyProxy mark.
 *
 * One key in silhouette, cut with three bits — the pool, told in the part of a
 * key that actually differs between keys. The middle bit is cooldown amber,
 * the same amber a resting key gets everywhere else in the dashboard, so the
 * mark carries the product's one idea rather than being decoration.
 *
 * Kept byte-identical to the marketing site's copy (keyproxy-site
 * `src/components/Logo.tsx`) so the two surfaces cannot drift apart. If the
 * geometry changes here, change it there in the same pass.
 *
 * The body inherits `currentColor`. The amber is deliberately fixed: it means
 * cooldown across the whole product and would be a lie in any other hue.
 */

const AMBER = "#F5B301";

/** Ring, shank and three bits on a 48x30 grid. Shared by both orientations. */
function marks(resting: boolean) {
  return (
    <>
      <circle cx="11" cy="15" r="7.6" stroke="currentColor" strokeWidth="5.4" />
      <rect x="17" y="12.3" width="28" height="5.4" rx="2.7" fill="currentColor" />
      {/* Bits at three heights so they read as three keys, not a comb. */}
      <rect x="25.6" y="17.7" width="5" height="6.4" rx="2.4" fill="currentColor" />
      <rect
        x="33.2"
        y="17.7"
        width="5"
        height="8.6"
        rx="2.4"
        fill={resting ? AMBER : "currentColor"}
      />
      <rect x="40.8" y="17.7" width="4.2" height="5.2" rx="2.1" fill="currentColor" />
    </>
  );
}

export function KeyBunch({
  size = 34,
  resting = true,
  className,
  title,
}: {
  /** Width. Height follows the mark's 48:30 ratio. */
  size?: number;
  /** Amber middle bit. Off gives a single-colour mark for one-colour use. */
  resting?: boolean;
  className?: string;
  /** Provide only when the mark stands alone; omit when a wordmark follows. */
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.625)}
      viewBox="0 0 48 30"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {marks(resting)}
    </svg>
  );
}

/** The same key, turned 45 degrees to fill a square. */
export function KeyBunchTile({
  size = 32,
  resting = true,
  className,
  title,
}: {
  size?: number;
  resting?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g transform="rotate(-45 24 24) translate(0 9)">{marks(resting)}</g>
    </svg>
  );
}

/** The mark plus the name, for the app header. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <KeyBunch size={32} className="text-[#00C4B4]" />
      <span className="font-semibold text-white tracking-[-0.01em]">
        Key<span className="text-[#00C4B4]">Proxy</span>
      </span>
    </span>
  );
}
