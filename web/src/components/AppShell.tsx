import { NavLink, Outlet } from "react-router-dom";
import { Activity, Home, RefreshCw, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn, formatCountdown } from "@/lib/utils";

interface AppShellProps {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  msUntilMidnight: number;
  onRefresh: () => void;
  refreshing?: boolean;
}

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  enabled,
  onEnabledChange,
  msUntilMidnight,
  onRefresh,
  refreshing,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="p-4">
          <div className="text-lg font-semibold tracking-tight">TennReserve</div>
          <div className="text-xs text-muted-foreground">McCarren Park · Facility 11</div>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Auto-book</span>
            <Switch checked={enabled} onCheckedChange={onEnabledChange} />
          </div>
          <Badge variant={enabled ? "success" : "secondary"}>{enabled ? "Active" : "Paused"}</Badge>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <span className="font-semibold">TennReserve</span>
            <Switch checked={enabled} onCheckedChange={onEnabledChange} />
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            New day in {formatCountdown(msUntilMidnight)}
          </Badge>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
