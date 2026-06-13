import { redirect } from "next/navigation";
import { countUsers } from "@/lib/usersDb";
import { SetupForm } from "@/components/SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const existing = await countUsers();
  if (existing > 0) {
    redirect("/login");
  }

  return (
    <div className="max-w-md mx-auto flex flex-col gap-8">
      <div>
        <div className="w-10 h-10 rounded-lg bg-[#00C4B4] flex items-center justify-center text-black font-bold text-lg mb-4">
          K
        </div>
        <h1 className="text-2xl font-bold text-white">Welcome to KeyProxy</h1>
        <p className="text-[#8b8b9e] text-sm mt-2 leading-relaxed">
          This is a one-time setup step. Create the first account — it will
          automatically become an <strong className="text-white">admin</strong>,
          which means it can manage proxy configs and invite/manage other
          users. You only see this screen because no accounts exist yet.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 text-left">
        <Step n={1} title="Create your admin account">
          Pick an email and a strong password. This logs you in and creates the
          first user for this KeyProxy instance.
        </Step>
        <Step n={2} title="Set up a proxy config">
          After logging in, create a config pointing at the API you want to
          rotate keys for (e.g. OpenAI, Anthropic, Serper).
        </Step>
        <Step n={3} title="Invite teammates (optional)">
          From <strong className="text-white">Manage Users</strong> in the
          header, admins can create additional accounts for teammates.
        </Step>
      </div>

      <SetupForm />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-4 flex flex-col gap-1.5">
      <div className="w-6 h-6 rounded-full bg-[#00C4B4]/15 text-[#00C4B4] text-xs font-bold flex items-center justify-center">
        {n}
      </div>
      <div className="text-white text-sm font-semibold">{title}</div>
      <p className="text-[#8b8b9e] text-xs leading-relaxed">{children}</p>
    </div>
  );
}
