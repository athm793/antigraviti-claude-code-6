import type { ReactNode } from "react";

/** Codifies the dashed-border empty block the dashboard already used. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="text-center py-16 border border-dashed border-[#2a2a38] rounded-xl px-6">
      <div className="text-[#4a4a58] flex justify-center mb-4">{icon}</div>
      <p className="text-white font-semibold">{title}</p>
      {body && <p className="text-[#8b8b9e] text-sm mt-1">{body}</p>}
      {children && <div className="mt-8">{children}</div>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
