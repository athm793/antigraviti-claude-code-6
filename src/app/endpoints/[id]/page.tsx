import { notFound } from "next/navigation";
import { authorizeEndpoint } from "@/lib/auth";
import { getActiveDefinition } from "@/lib/endpointsDb";
import { EmptyState } from "@/components/ui/EmptyState";
import { Split } from "@/components/ui/Icon";
import { cardCls, hintCls } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function BuildTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) notFound();

  const { definition } = await getActiveDefinition(auth.endpoint);
  const steps = definition.steps ?? [];

  if (steps.length === 0) {
    return (
      <EmptyState
        icon={<Split className="w-10 h-10" />}
        title="No steps yet"
        body="A step calls one provider. Add a few and set the rules for when each should run."
      >
        <p className={`${hintCls} max-w-md mx-auto`}>
          The step builder lands next. Until then the endpoint exists, has a key, and its
          settings are editable — it just has nothing to run.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className={cardCls}>
      <h2 className="text-base font-semibold text-white">Steps</h2>
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="flex items-center gap-3 bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-3 min-h-[56px]"
          >
            <span className="w-6 h-6 rounded-full bg-[#00C4B4]/15 text-[#00C4B4] text-xs font-bold flex items-center justify-center shrink-0">
              {index + 1}
            </span>
            <span className="text-white text-sm font-medium truncate">{step.name}</span>
            <span className="text-[#8b8b9e] text-xs font-mono truncate">
              {step.request?.method} {step.request?.path}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
