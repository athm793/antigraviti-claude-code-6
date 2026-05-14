import { notFound } from "next/navigation";
import { getConfig, listKeys, getKeyStats } from "@/lib/db";
import { KeysTable } from "@/components/KeysTable";
import { AddKeysForm } from "@/components/AddKeysForm";
import { CurlExample } from "@/components/CurlExample";
import { StatsBar } from "@/components/StatsBar";
import { MasterKeyDisplay } from "@/components/MasterKeyDisplay";
import { EditConfigForm } from "@/components/EditConfigForm";

export const dynamic = "force-dynamic";

export default async function ConfigDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [config, keys, stats] = await Promise.all([
    getConfig(id),
    listKeys(id),
    getKeyStats(id),
  ]);

  if (!config) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-4">
        <a href="/" className="text-[#8b8b9e] hover:text-white text-sm transition-colors mt-1 shrink-0">
          ← Back
        </a>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">{config.name}</h1>
          <p className="text-[#8b8b9e] text-sm mt-0.5 font-mono truncate">
            {config.target_base_url}
          </p>
        </div>
      </div>

      <EditConfigForm config={config} />

      <MasterKeyDisplay masterKey={config.master_key} />

      <Section title="Key Pool">
        <StatsBar stats={stats} configId={config.id} />
      </Section>

      <Section title="Add Keys">
        <AddKeysForm configId={config.id} />
      </Section>

      <Section title={`Keys (${keys.length})`}>
        <KeysTable keys={keys} configId={config.id} />
      </Section>

      <Section title="cURL Usage">
        <CurlExample configId={config.id} masterKey={config.master_key} />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}
