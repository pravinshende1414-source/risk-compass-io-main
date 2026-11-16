import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Header } from "@/components/app/Header";
import { SidebarNav } from "@/components/app/Sidebar";
import { supabase } from "@/integrations/supabase/client";
import { getActiveUser } from "@/lib/user-database";

export const Route = createFileRoute("/_shell")({
  ssr: false,
  beforeLoad: async () => {
    const local = getActiveUser();
    if (local) return { user: local };

    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) return { user: data.user };
    } catch {
      // fallback
    }
    throw redirect({ to: "/login" });
  },
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <div className="bg-background min-h-screen">
      <aside className="border-sidebar-border fixed inset-y-0 left-0 z-40 hidden w-64 border-r lg:block">
        <SidebarNav />
      </aside>
      <div className="lg:pl-64">
        <Header />
        <main className="animate-in fade-in slide-in-from-bottom-2 mx-auto w-full max-w-7xl px-4 py-6 duration-500 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
