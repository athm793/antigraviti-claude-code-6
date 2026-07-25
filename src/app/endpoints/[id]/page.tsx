import { notFound } from "next/navigation";
import { authorizeEndpoint } from "@/lib/auth";
import { getActiveDefinition } from "@/lib/endpointsDb";
import { listConfigs } from "@/lib/db";
import { EndpointBuilder } from "@/components/builder/EndpointBuilder";

export const dynamic = "force-dynamic";

export default async function BuildTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) notFound();

  const [{ definition }, providers] = await Promise.all([
    getActiveDefinition(auth.endpoint),
    listConfigs(auth.user),
  ]);

  return (
    <EndpointBuilder
      endpoint={auth.endpoint}
      providers={providers}
      initialDefinition={definition}
    />
  );
}
