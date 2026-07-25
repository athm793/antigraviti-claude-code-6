import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { NewConfigForm } from "./NewConfigForm";

export const dynamic = "force-dynamic";

/**
 * Server guard around a client form. The form itself holds no data, but every
 * page resolving the viewer from the database is what makes deleting a user
 * take effect immediately instead of when their token expires — middleware
 * only checks the signature.
 */
export default async function NewConfigPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <NewConfigForm />;
}
