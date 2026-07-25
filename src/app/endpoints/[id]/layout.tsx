import { notFound, redirect } from "next/navigation";
import { authorizeEndpoint } from "@/lib/auth";
import { getActiveDefinition } from "@/lib/endpointsDb";
import { Tabs } from "@/components/ui/Tabs";
import { ArrowLeft } from "@/components/ui/Icon";
import { EndpointUrlBar } from "@/components/EndpointUrlBar";
import { badgeBase, badgeTones, backLinkCls } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * Shell shared by every endpoint tab.
 *
 * Tabs are real routes rather than a ?tab= param so each gets its own
 * loading.tsx and only the panel below swaps — the title, URL bar and tab row
 * never move while a tab loads.
 */
export default async function EndpointLayout({
  children,
  params,
}: LayoutProps<"/endpoints/[id]">) {
  const { id } = await params;

  const auth = await authorizeEndpoint(id);
  if (!auth.ok) {
    if (auth.status === 401) redirect(`/login?next=/endpoints/${id}`);
    notFound();
  }

  const endpoint = auth.endpoint;
  const { definition } = await getActiveDefinition(endpoint);
  const stepCount = definition.steps?.length ?? 0;

  const status =
    stepCount === 0
      ? { tone: badgeTones.neutral, label: "Draft" }
      : !endpoint.enabled
        ? { tone: badgeTones.warning, label: "Paused" }
        : { tone: badgeTones.brand, label: "Live" };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <a href="/endpoints" className={backLinkCls}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </a>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white truncate">{endpoint.name}</h1>
            <span className={`${badgeBase} ${status.tone} min-w-[4.5rem] justify-center`}>
              {status.label}
            </span>
          </div>
          {endpoint.description && (
            <p className="text-[#8b8b9e] text-sm mt-1">{endpoint.description}</p>
          )}
        </div>
      </div>

      <EndpointUrlBar slug={endpoint.slug} stepCount={stepCount} updatedAt={endpoint.updated_at} />

      <Tabs
        items={[
          { href: `/endpoints/${id}`, label: "Build" },
          { href: `/endpoints/${id}/runs`, label: "Runs" },
          { href: `/endpoints/${id}/settings`, label: "Settings" },
        ]}
      />

      {children}
    </div>
  );
}
