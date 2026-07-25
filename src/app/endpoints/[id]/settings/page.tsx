import { notFound } from "next/navigation";
import { authorizeEndpoint } from "@/lib/auth";
import { listEndpointKeys } from "@/lib/endpointsDb";
import { EndpointSettingsForm } from "@/components/EndpointSettingsForm";
import { EndpointKeysManager } from "@/components/EndpointKeysManager";
import { EndpointDangerZone } from "@/components/EndpointDangerZone";
import { CachePanel } from "@/components/CachePanel";
import { VersionHistory } from "@/components/VersionHistory";
import { listVersions } from "@/lib/endpointsDb";
import { countCache } from "@/lib/runCache";

export const dynamic = "force-dynamic";

export default async function SettingsTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) notFound();

  const [keys, cached, versions] = await Promise.all([
    listEndpointKeys(id),
    countCache(id),
    listVersions(id, 20),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <EndpointSettingsForm endpoint={auth.endpoint} />
      <CachePanel
        endpointId={id}
        enabled={auth.endpoint.cache_enabled}
        cached={cached}
      />
      <VersionHistory
        endpointId={id}
        revision={auth.endpoint.revision}
        activeVersionId={auth.endpoint.active_version_id}
        versions={versions.map((v) => ({
          id: v.id,
          version_no: v.version_no,
          note: v.note,
          created_at: v.created_at,
          step_count: v.definition.steps?.length ?? 0,
        }))}
      />
      <EndpointKeysManager endpointId={id} keys={keys} />
      <EndpointDangerZone endpoint={auth.endpoint} />
    </div>
  );
}
