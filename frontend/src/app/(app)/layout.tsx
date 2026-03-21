"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Search, Bookmark, ShieldHalf, Radio, ChevronRight, Users, Layers } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { href: "/",                    label: "Overview",       icon: LayoutDashboard, desc: "System status" },
    { href: "/search",              label: "IOC Search",     icon: Search,           desc: "Find indicators" },
    { href: "/threat-actors",       label: "Threat Actors",  icon: Users,            desc: "MITRE ATT&CK" },
    { href: "/bulk-lookup",         label: "Bulk Lookup",    icon: Layers,           desc: "Batch IOC search" },
    { href: "/workspace/watchlist", label: "Watchlist",      icon: Bookmark,         desc: "Monitored IOCs" },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col border-r border-slate-800 bg-gradient-to-b from-slate-950 to-slate-900"
      >
        {/* Brand */}
        <div
          className="h-14 flex items-center gap-2.5 px-4 border-b flex-shrink-0 relative overflow-hidden"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <div className="absolute inset-0 bg-grid-ops opacity-60 pointer-events-none" />
          <div
            className="relative z-10 w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.25)" }}
          >
            <ShieldHalf className="w-4 h-4" style={{ color: "var(--primary)" }} />
          </div>
          <div className="relative z-10 min-w-0">
            <div
              className="text-xs font-bold tracking-[0.15em] uppercase font-heading truncate"
              style={{ color: "var(--foreground)" }}
            >
              ThreatLens
            </div>
            <div className="text-[9px] tracking-[0.1em] uppercase" style={{ color: "var(--muted-foreground)" }}>
              SOC Platform
            </div>
          </div>
        </div>

        {/* System status tag */}
        <div
          className="mx-3 mt-3 mb-1 flex items-center gap-2 px-2 py-1.5 rounded text-[10px] uppercase tracking-wider"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", color: "#4ade80" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] status-pulse flex-shrink-0" />
          <span className="font-medium">Systems Online</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <div
            className="text-[9px] uppercase tracking-[0.15em] font-semibold px-2 py-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 px-2.5 py-2 rounded-md transition-all duration-150 relative"
                style={
                  active
                    ? {
                        background: "rgba(56,189,248,0.10)",
                        borderLeft: "2px solid var(--primary)",
                      }
                    : {
                        borderLeft: "2px solid transparent",
                      }
                }
              >
                <Icon
                  className="w-4 h-4 flex-shrink-0 transition-colors"
                  style={{ color: active ? "var(--primary)" : "var(--muted-foreground)" }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm font-medium leading-none mb-0.5 transition-colors"
                    style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)" }}
                  >
                    {item.label}
                  </div>
                  <div className="text-[10px] leading-none" style={{ color: "var(--muted-foreground)", opacity: 0.7 }}>
                    {item.desc}
                  </div>
                </div>
                {active && (
                  <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: "var(--primary)" }} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: feed indicator + user */}
        <div className="p-3 space-y-2 flex-shrink-0 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
          <div
            className="flex items-center gap-2 px-2 py-1.5 rounded text-[10px]"
            style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
          >
            <Radio className="w-3 h-3 flex-shrink-0" style={{ color: "var(--primary)" }} />
            <span className="flex-1 truncate" style={{ color: "var(--muted-foreground)" }}>
              3 feeds active
            </span>
          </div>

          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded"
            style={{ background: "var(--accent)", border: "1px solid var(--border)" }}>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 font-heading"
              style={{ background: "rgba(56,189,248,0.15)", color: "var(--primary)", border: "1px solid rgba(56,189,248,0.25)" }}
            >
              A
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate" style={{ color: "var(--foreground)" }}>
                Analyst
              </div>
              <div className="text-[9px] truncate" style={{ color: "var(--muted-foreground)" }}>
                local
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top header bar */}
        <header
          className="h-14 flex items-center justify-between px-6 flex-shrink-0 border-b"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            {navItems.map((item) => {
              if (!isActive(item.href)) return null;
              const Icon = item.icon;
              return (
                <div key={item.href} className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: "var(--primary)" }} />
                  <span className="text-sm font-medium font-heading" style={{ color: "var(--foreground)" }}>
                    {item.label}
                  </span>
                  <span
                    className="hidden sm:block text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
                  >
                    {item.desc}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div
              className="hidden sm:flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] status-pulse" />
              Live
            </div>
            <div className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
              {new Date().toISOString().slice(0, 10)}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
