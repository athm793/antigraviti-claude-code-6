import type { AuditLogEntry } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

const ACTION_LABELS: Record<string, string> = {
  keys_added: "Keys added",
  key_deleted: "Key deleted",
  keys_reset: "Keys reset",
  config_updated: "Config updated",
  master_key_rotated: "Master key rotated",
};

export function AuditLog({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-[#8b8b9e] text-sm">
        No activity recorded yet — changes to this config&apos;s key pool will show up here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex items-baseline justify-between gap-4 bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-2.5"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm text-[#c8c8d8]">
              {ACTION_LABELS[entry.action] ?? entry.action}
            </span>
            {entry.detail && (
              <span className="text-xs text-[#8b8b9e] truncate">{entry.detail}</span>
            )}
          </div>
          <time dateTime={entry.created_at} className="text-xs text-[#8b8b9e] shrink-0">
            {formatDateTime(entry.created_at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
