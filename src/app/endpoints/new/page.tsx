import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { NewEndpointForm } from "./NewEndpointForm";

export const dynamic = "force-dynamic";

/**
 * Server guard around a client form. Same reason as /configs/new: every page
 * resolves the viewer from the database so revocation is immediate.
 */
export default async function NewEndpointPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <NewEndpointForm />;
}
