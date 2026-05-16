import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { AgentChat } from "@/components/agent-chat";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar user={user} />
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      <AgentChat />
    </div>
  );
}
