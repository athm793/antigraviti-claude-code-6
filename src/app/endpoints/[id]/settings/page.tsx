import { notFound } from "next/navigation";
import { authorizeEndpoint } from "@/lib/auth";
import { listEndpointKeys } from "@/lib/endpointsDb";
import { EndpointSettingsForm } from "@/components/EndpointSettingsForm";
import { EndpointKeysManager } from "@/components/EndpointKeysManager";
import { EndpointDangerZone } from "@/components/EndpointDangerZone";

export const dynamic = "force-dynamic";

export default async function SettingsTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) notFound();

  const keys = await listEndpointKeys(id);

  return (
    <div className="flex flex-col gap-6">
      <EndpointSettingsForm endpoint={auth.endpoint} />
      <EndpointKeysManager endpointId={id} keys={keys} />
      <EndpointDangerZone endpoint={auth.endpoint} />
    </div>
  );
}
