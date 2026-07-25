import { notFound, redirect } from "next/navigation";
import { listKeyViews, getKeyStats, getAuditLog } from "@/lib/db";
import { authorizeConfig } from "@/lib/auth";
import { KeysTable } from "@/components/KeysTable";
import { AddKeysForm } from "@/components/AddKeysForm";
import { CurlExample } from "@/components/CurlExample";
import { StatsBar } from "@/components/StatsBar";
import { MasterKeyDisplay } from "@/components/MasterKeyDisplay";
import { EditConfigForm } from "@/components/EditConfigForm";
import { TestConnectionButton } from "@/components/TestConnectionButton";
import { AuditLog } from "@/components/AuditLog";
import { ArrowLeft } from "@/components/ui/Icon";
import { backLinkCls, cardCls } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function ConfigDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const auth = await authorizeConfig(id);
  if (!auth.ok) {
    if (auth.status === 401) redirect(`/login?next=/configs/${id}`);
    notFound();
  }
  const config = auth.config;

  const [keys, stats, auditEntries] = await Promise.all([
    listKeyViews(id),
    getKeyStats(id),
    getAuditLog(id),
  ]);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8">
      <div className="flex items-start gap-4">
        <a href="/" className={backLinkCls}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </a>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">{config.name}</h1>
          <p className="text-[#8b8b9e] text-sm mt-0.5 font-mono truncate">
            {config.target_base_url}
          </p>
        </div>
      </div>

      <EditConfigForm config={config} />

      <div className="flex flex-col gap-2">
        <MasterKeyDisplay configId={config.id} masterKey={config.master_key} />
        <p className="text-[#8b8b9e] text-xs px-1">
          This master key is what your client app sends to KeyProxy — it&apos;s separate
          from the real API keys below, which never leave the server. Anyone with this
          master key can use your key pool, so treat it like a password.
        </p>
      </div>

      <Section title="Key pool">
        <StatsBar stats={stats} configId={config.id} />
        <p className="text-[#8b8b9e] text-xs">
          <span className="text-[#00C4B4]">Active</span> keys are used for new requests.{" "}
          <span className="text-red-400">Exhausted</span> keys hit a rate limit and won&apos;t
          be retried.{" "}
          <span className="text-amber-400">Cooldown</span> keys hit a rate limit but will
          automatically go active again after the cooldown period.
        </p>
        <TestConnectionButton configId={config.id} />
      </Section>

      <Section title="Add keys">
        <AddKeysForm configId={config.id} />
      </Section>

      <Section title={`Keys (${keys.length})`}>
        <KeysTable keys={keys} configId={config.id} />
      </Section>

      <Section title="cURL usage">
        <CurlExample configId={config.id} masterKey={config.master_key} />
        <p className="text-[#8b8b9e] text-xs">
          Point your app at this URL instead of the real API — KeyProxy swaps in the
          next available key and rotates automatically if one gets rate-limited.
        </p>
      </Section>

      <Section title="Activity">
        <AuditLog entries={auditEntries} />
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
    <div className={cardCls}>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}
