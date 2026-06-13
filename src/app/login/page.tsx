import { redirect } from "next/navigation";
import { countUsers } from "@/lib/usersDb";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const existing = await countUsers();
  if (existing === 0) {
    redirect("/setup");
  }

  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-8 mt-8">
      <div className="text-center">
        <div className="w-10 h-10 rounded-lg bg-[#00C4B4] flex items-center justify-center text-black font-bold text-lg mx-auto mb-4">
          K
        </div>
        <h1 className="text-2xl font-bold text-white">Sign in to KeyProxy</h1>
        <p className="text-[#8b8b9e] text-sm mt-2">
          Use the email and password your admin set up for you.
        </p>
      </div>

      <LoginForm />
    </div>
  );
}
