import { redirect } from "next/navigation";
import { listConfigs } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ConfigCard } from "@/components/ConfigCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Key, Plus, ArrowRight } from "@/components/ui/Icon";
import { btnPrimary } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Scoped to the viewer: admins see everything, everyone else sees the
  // providers they own.
  const configs = await listConfigs(user);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Providers</h1>
          <p className="text-[#8b8b9e] text-sm mt-1">
            Each provider proxies one target API and rotates through its key pool automatically.
          </p>
        </div>
        <a href="/configs/new" className={`${btnPrimary} gap-1.5 shrink-0`}>
          <Plus className="w-4 h-4" />
          New provider
        </a>
      </div>

      {configs.length > 0 && (
        <details className="group bg-[#111118] border border-[#2a2a38] rounded-xl px-4 py-3">
          <summary className="text-sm font-medium text-[#c8c8d8] cursor-pointer select-none flex items-center justify-between min-h-[44px]">
            How does KeyProxy work?
            <span className="text-[#8b8b9e] text-xs group-open:hidden">Show</span>
            <span className="text-[#8b8b9e] text-xs hidden group-open:inline">Hide</span>
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-left">
            <Steps />
          </div>
        </details>
      )}

      {configs.length === 0 ? (
        <EmptyState
          icon={<Key className="w-10 h-10" />}
          title="No providers yet"
          body="A provider is one upstream API plus the pool of keys KeyProxy rotates through."
          action={
            <a href="/configs/new" className={`${btnPrimary} gap-1.5`}>
              Create your first provider
              <ArrowRight className="w-4 h-4" />
            </a>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
            <Steps />
          </div>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {configs.map((config) => (
            <ConfigCard key={config.id} config={config} />
          ))}
        </div>
      )}
    </div>
  );
}

function Steps() {
  return (
    <>
      <Step n={1} title="Create a provider">
        Point KeyProxy at the API you want to call, e.g.{" "}
        <code className="text-[#00C4B4]">https://api.openai.com</code>.
      </Step>
      <Step n={2} title="Add API keys">
        Paste in a pool of keys for that API — one per line. KeyProxy stores them server-side.
      </Step>
      <Step n={3} title="Call the proxy">
        Use the generated master key + proxy URL from your app. KeyProxy rotates keys
        automatically when one hits a rate limit.
      </Step>
    </>
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
