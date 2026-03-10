"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Wallet,
  History,
  BarChart3,
  Activity,
  PlusCircle,
  HeartPulse,
  FileText,
  Layers,
  Settings,
  FlaskConical,
  Menu,
} from "lucide-react";
import { ConnectionBadge } from "./connection-status";
import { cn } from "@/lib/utils";
import { useState } from "react";

const mobileNav = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Positions", href: "/positions", icon: Wallet },
  { label: "Trades", href: "/trades", icon: History },
  { label: "Performance", href: "/performance", icon: BarChart3 },
  { label: "Signals", href: "/signals", icon: Activity },
  { label: "Manual Trade", href: "/manual-trade", icon: PlusCircle },
  { label: "Health", href: "/health", icon: HeartPulse },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Strategies", href: "/strategies", icon: Layers },
  { label: "Config", href: "/config", icon: Settings },
  { label: "Backtest", href: "/backtest", icon: FlaskConical },
];

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/positions": "Positions",
  "/trades": "Trade History",
  "/performance": "Performance",
  "/signals": "Signals",
  "/manual-trade": "Manual Trade",
  "/health": "System Health",
  "/reports": "Reports",
  "/strategies": "Strategies",
  "/config": "Config",
  "/backtest": "Backtest",
};

export function Topbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = titles[pathname] ?? "Dashboard";

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            className="md:hidden p-1.5 rounded-md hover:bg-accent"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold">{title}</h1>
        </div>
        <ConnectionBadge />
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <nav className="absolute left-0 top-0 bottom-0 w-56 bg-sidebar border-r border-border p-4 space-y-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">
                  OC
                </span>
              </div>
              <span className="font-semibold text-sm">OpenClaw Trader</span>
            </div>
            {mobileNav.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
