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
          className="bg-[#00C4B4] hover:bg-[#00a89a] text-black font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
        >
          + New Config
        </a>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-[#2a2a38] rounded-xl">
          <div className="text-4xl mb-4">🔑</div>
          <p className="text-[#8b8b9e] mb-6">No proxy configs yet.</p>
          <a
            href="/configs/new"
            className="bg-[#00C4B4] hover:bg-[#00a89a] text-black font-semibold text-sm px-6 py-3 rounded-lg transition-colors"
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
