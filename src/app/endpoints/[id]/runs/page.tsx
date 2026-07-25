import { notFound } from "next/navigation";
import { authorizeEndpoint } from "@/lib/auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { Clock } from "@/components/ui/Icon";
import { hintCls } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function RunsTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) notFound();

  return (
    <EmptyState
      icon={<Clock className="w-10 h-10" />}
      title="No runs yet"
      body="Every call to this endpoint will be recorded here, with which provider answered and how long it took."
    >
      <p className={`${hintCls} max-w-md mx-auto`}>
        Logs start once the endpoint has steps and receives its first request.
      </p>
    </EmptyState>
  );
}
