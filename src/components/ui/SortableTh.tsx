import { ChevronDown, ChevronUp } from "./Icon";

export type SortDir = "asc" | "desc";

/**
 * Sortable column header.
 *
 * Sentence case, not ALL CAPS — only the first word is capitalised, and the
 * caller passes the label already written that way. Sorting is a link, so the
 * order lives in the URL and is shareable, bookmarkable, and survives a reload.
 */
export function SortableTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  hrefFor,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  currentDir: SortDir;
  hrefFor: (sortKey: string, dir: SortDir) => string;
  align?: "left" | "right";
  className?: string;
}) {
  const active = currentSort === sortKey;
  // Clicking the active column flips direction; a new column starts ascending.
  const nextDir: SortDir = active && currentDir === "asc" ? "desc" : "asc";

  return (
    <th
      scope="col"
      aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
      className={`pb-3 pr-4 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <a
        href={hrefFor(sortKey, nextDir)}
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? "text-[#c8c8d8]" : "hover:text-[#c8c8d8]"
        }`}
      >
        {label}
        {/* Reserved width so the caret appearing doesn't nudge the header. */}
        <span className="w-3.5 inline-flex justify-center">
          {active &&
            (currentDir === "asc" ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            ))}
        </span>
      </a>
    </th>
  );
}
