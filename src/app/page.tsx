import { listConfigs } from "@/lib/db";
import { ConfigCard } from "@/components/ConfigCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const configs = await listConfigs();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Proxy Configs</h1>
          <p className="text-[#8b8b9e] text-sm mt-1">
            Each config proxies one target API and rotates through its key pool automatically.
          </p>
        </div>
        <a
          href="/configs/new"
          className="bg-[#00C4B4] hover:bg-[#00a89a] text-black font-semibold text-sm px-5 rounded-lg transition-colors min-h-[44px] inline-flex items-center"
        >
          + New Config
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
            <Step n={1} title="Create a config">
              Point KeyProxy at the API you want to call, e.g. <code className="text-[#00C4B4]">https://api.openai.com</code>.
            </Step>
            <Step n={2} title="Add API keys">
              Paste in a pool of keys for that API — one per line. KeyProxy stores them server-side.
            </Step>
            <Step n={3} title="Call the proxy">
              Use the generated master key + proxy URL from your app. KeyProxy rotates keys automatically when one hits a rate limit.
            </Step>
          </div>
        </details>
      )}

      {configs.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[#2a2a38] rounded-xl px-6">
          <div className="text-4xl mb-4">🔑</div>
          <p className="text-[#8b8b9e] mb-8">No proxy configs yet.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8 text-left">
            <Step n={1} title="Create a config">
              Point KeyProxy at the API you want to call, e.g. <code className="text-[#00C4B4]">https://api.openai.com</code>.
            </Step>
            <Step n={2} title="Add API keys">
              Paste in a pool of keys for that API — one per line. KeyProxy stores them server-side.
            </Step>
            <Step n={3} title="Call the proxy">
              Use the generated master key + proxy URL from your app. KeyProxy rotates keys automatically when one hits a rate limit.
            </Step>
          </div>

          <a
            href="/configs/new"
            className="bg-[#00C4B4] hover:bg-[#00a89a] text-black font-semibold text-sm px-6 py-3 rounded-lg transition-colors inline-flex items-center min-h-[44px]"
          >
            Create your first config
          </a>
        </div>
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
