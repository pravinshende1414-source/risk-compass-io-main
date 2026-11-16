import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Logo } from "./Logo";
import { navGroups, navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="bg-sidebar flex h-full flex-col">
      <div className="border-sidebar-border flex h-16 items-center border-b px-5">
        <Link to="/" onClick={onNavigate} aria-label="HealthRisk AI home">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {navGroups.map((group) => (
          <div key={group}>
            <p className="text-muted-foreground px-3 pb-2 text-[10px] font-semibold tracking-widest uppercase">
              {group}
            </p>
            <ul className="space-y-1">
              {navItems
                .filter((item) => item.group === group)
                .map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      className={cn(
                        "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                      )}
                      activeProps={{
                        className:
                          "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-soft",
                      }}
                    >
                      <item.icon className="size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-sidebar-border border-t p-4">
        <div className="bg-brand-gradient text-primary-foreground rounded-xl p-4">
          <Sparkles className="size-4" />
          <p className="mt-2 text-sm font-semibold">Research build</p>
          <p className="mt-1 text-xs opacity-90">
            Models are not connected yet — the workspace runs on synthetic scaffolding.
          </p>
        </div>
      </div>
    </div>
  );
}
