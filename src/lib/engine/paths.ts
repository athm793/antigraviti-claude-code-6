/**
 * Path resolution, shared by templates, conditions and output mapping.
 *
 * One walker for all three so path semantics are identical everywhere — one
 * implementation, one set of behaviours to reason about.
 */

/**
 * Never traversable. Reading these mostly just leaks, but the same segment
 * list guards the *write* side (output mapping), where assigning through
 * `__proto__` would mutate Object.prototype for the whole warm serverless
 * instance — contaminating requests from other callers, not just this one.
 */
export const BLOCKED_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/** Guards against a pathological path in a saved definition. */
export const MAX_PATH_DEPTH = 12;

export type PathSegment =
  | { kind: "key"; value: string }
  | { kind: "index"; value: number };

export type Resolution =
  | { found: true; value: unknown }
  | { found: false };

export const NOT_FOUND: Resolution = { found: false };

/**
 * Parses `a.b[0].c` and `a["with.dot"]` into segments.
 * Returns null for anything malformed, so a bad path fails at save time
 * rather than silently resolving to nothing at run time.
 */
export function parsePath(path: string): PathSegment[] | null {
  const segments: PathSegment[] = [];
  let i = 0;
  const n = path.length;

  while (i < n) {
    if (path[i] === ".") {
      i++;
      continue;
    }

    if (path[i] === "[") {
      const close = path.indexOf("]", i);
      if (close === -1) return null;
      const inner = path.slice(i + 1, close).trim();

      if (
        (inner.startsWith('"') && inner.endsWith('"')) ||
        (inner.startsWith("'") && inner.endsWith("'"))
      ) {
        segments.push({ kind: "key", value: inner.slice(1, -1) });
      } else if (/^-?\d+$/.test(inner)) {
        segments.push({ kind: "index", value: Number(inner) });
      } else {
        return null;
      }

      i = close + 1;
      continue;
    }

    let j = i;
    while (j < n && path[j] !== "." && path[j] !== "[") j++;
    const key = path.slice(i, j);
    if (!key) return null;
    segments.push({ kind: "key", value: key });
    i = j;
  }

  if (segments.length === 0) return null;
  if (segments.length > MAX_PATH_DEPTH) return null;
  return segments;
}

/**
 * Walks a value by segments.
 *
 * Distinguishes "not found" from "found, and the value is null" — the
 * difference matters: a provider returning `{"email": null}` has answered and
 * said it has nothing, which is not the same as never being asked.
 */
export function resolveSegments(root: unknown, segments: PathSegment[]): Resolution {
  let current: unknown = root;

  for (const segment of segments) {
    if (current === null || current === undefined) return NOT_FOUND;

    if (segment.kind === "index") {
      if (!Array.isArray(current)) return NOT_FOUND;
      // Negative indexes count from the end, so `[-1]` is "the last one".
      const index = segment.value < 0 ? current.length + segment.value : segment.value;
      if (index < 0 || index >= current.length) return NOT_FOUND;
      current = current[index];
      continue;
    }

    if (typeof current !== "object") return NOT_FOUND;
    if (BLOCKED_SEGMENTS.has(segment.value)) return NOT_FOUND;
    if (!Object.prototype.hasOwnProperty.call(current, segment.value)) return NOT_FOUND;
    current = (current as Record<string, unknown>)[segment.value];
  }

  return { found: true, value: current };
}

export function resolvePath(root: unknown, path: string): Resolution {
  const segments = parsePath(path);
  if (!segments) return NOT_FOUND;
  return resolveSegments(root, segments);
}

/** Objects built from untrusted data get a null prototype. */
export function emptyRecord(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}
