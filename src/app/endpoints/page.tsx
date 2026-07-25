import { redirect } from "next/navigation";
import { listEndpoints } from "@/lib/endpointsDb";
import { getCurrentUser } from "@/lib/auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { Split, Plus, ArrowRight } from "@/components/ui/Icon";
import { EndpointsTable } from "@/components/EndpointsTable";
import { btnPrimary } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function EndpointsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/endpoints");

  const { sort = "updated", dir = "desc", page = "1" } = await searchParams;
  const endpoints = await listEndpoints(user);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Endpoints</h1>
          <p className="text-[#8b8b9e] text-sm mt-1">
            One URL that tries several APIs in order and returns a single result.
          </p>
        </div>
        <a href="/endpoints/new" className={`${btnPrimary} gap-1.5 shrink-0`}>
          <Plus className="w-4 h-4" />
          New endpoint
        </a>
      </div>

      {endpoints.length === 0 ? (
        <EmptyState
          icon={<Split className="w-10 h-10" />}
          title="No endpoints yet"
          body="Chain several providers behind one URL, with rules deciding which one answers."
          action={
            <a href="/endpoints/new" className={`${btnPrimary} gap-1.5`}>
              Create your first endpoint
              <ArrowRight className="w-4 h-4" />
            </a>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
            <Step n={1} title="Pick your providers">
              Each step calls one provider you&apos;ve already set up, using its key pool.
            </Step>
            <Step n={2} title="Set the fallback rules">
              &ldquo;If this one returns no email, try the next.&rdquo; You decide what counts as an answer.
            </Step>
            <Step n={3} title="Call one URL">
              Your tool gets one consistent response, whichever provider answered.
            </Step>
          </div>
        </EmptyState>
      ) : (
        <EndpointsTable
          endpoints={endpoints}
          sort={sort}
          dir={dir === "asc" ? "asc" : "desc"}
          page={Number(page) || 1}
        />
      )}
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-4 flex flex-col gap-1.5">
      <div className="w-6 h-6 rounded-full bg-[#00C4B4]/15 text-[#00C4B4] text-xs font-bold flex items-center justify-center">
        {n}
      </div>
      <div className="text-white text-sm font-semibold">{title}</div>
      <p className="text-[#8b8b9e] text-xs leading-relaxed">{children}</p>
    </div>
  );
}
