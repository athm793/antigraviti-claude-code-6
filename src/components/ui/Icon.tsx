import type { SVGProps } from "react";

/**
 * Inline SVG icon set, Lucide-derived geometry.
 *
 * Replaces the emoji and unicode glyphs the app used before (🔑 ⚠️ 🔍 ✕ ← →).
 * Emoji render differently on every platform, can't inherit colour, and read
 * as decoration rather than UI — these inherit `currentColor` and scale with
 * the surrounding text.
 *
 * Server-safe: no hooks, no client boundary.
 */

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Svg({ className = "w-4 h-4", children, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function ChevronDown(props: IconProps) {
  return <Svg {...props}><path d="m6 9 6 6 6-6" /></Svg>;
}

export function ChevronUp(props: IconProps) {
  return <Svg {...props}><path d="m18 15-6-6-6 6" /></Svg>;
}

export function ChevronRight(props: IconProps) {
  return <Svg {...props}><path d="m9 18 6-6-6-6" /></Svg>;
}

export function Check(props: IconProps) {
  return <Svg {...props}><path d="M20 6 9 17l-5-5" /></Svg>;
}

export function X(props: IconProps) {
  return <Svg {...props}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
}

export function Plus(props: IconProps) {
  return <Svg {...props}><path d="M12 5v14M5 12h14" /></Svg>;
}

export function ArrowLeft(props: IconProps) {
  return <Svg {...props}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>;
}

export function ArrowRight(props: IconProps) {
  return <Svg {...props}><path d="M5 12h14M12 5l7 7-7 7" /></Svg>;
}

export function GripVertical(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </Svg>
  );
}

export function Trash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function Copy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" />
    </Svg>
  );
}

export function Play(props: IconProps) {
  return <Svg {...props}><path d="M6 3.5v17l14-8.5-14-8.5Z" /></Svg>;
}

export function Split(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 3h5v5M8 3H3v5M21 3l-7.5 7.5M3 3l7.5 7.5M12 12v9" />
    </Svg>
  );
}

export function Key(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3M17 6l2.5 2.5M14.5 8.5 17 11" />
    </Svg>
  );
}

export function Search(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function AlertTriangle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </Svg>
  );
}

export function Info(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </Svg>
  );
}

export function Clock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function Zap(props: IconProps) {
  return <Svg {...props}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></Svg>;
}

export function Database(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </Svg>
  );
}

export function FileJson(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M10 12.5c-.8 0-1 .5-1 1.2v.6c0 .7-.2 1.2-1 1.2.8 0 1 .5 1 1.2v.6c0 .7.2 1.2 1 1.2" />
      <path d="M14 12.5c.8 0 1 .5 1 1.2v.6c0 .7.2 1.2 1 1.2-.8 0-1 .5-1 1.2v.6c0 .7-.2 1.2-1 1.2" />
    </Svg>
  );
}

export function Download(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </Svg>
  );
}

export function Upload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5M12 3v12" />
    </Svg>
  );
}

export function RefreshCw(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.9-4.7M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.9 4.7" />
      <path d="M21 3v5h-5M3 21v-5h5" />
    </Svg>
  );
}

export function ExternalLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 3h6v6M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Svg>
  );
}

export function Filter(props: IconProps) {
  return <Svg {...props}><path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z" /></Svg>;
}

export function Eye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function EyeOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.7M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
    </Svg>
  );
}

/** Spinner for in-flight controls — the app previously used a literal "…". */
export function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={`${className} motion-safe:animate-spin`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2} opacity={0.25} />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}
