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
      <aside className="w-44 flex-shrink-0 flex flex-col border-r border-slate-800/80 bg-slate-950">
        {/* Brand */}
        <div className="h-12 flex items-center gap-2 px-3 border-b border-slate-800/80 flex-shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-ops opacity-40 pointer-events-none" />
          <div
            className="relative z-10 w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)" }}
          >
            <ShieldHalf className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="relative z-10 min-w-0">
            <div className="text-[11px] font-bold tracking-[0.12em] uppercase font-heading truncate text-white">
              ThreatLens
            </div>
            <div className="text-[8px] tracking-[0.08em] uppercase text-slate-500">
              SOC Platform
            </div>
          </div>
        </div>

        {/* System status */}
        <div className="mx-2 mt-2 mb-1 flex items-center gap-1.5 px-2 py-1 rounded text-[9px] uppercase tracking-wider bg-emerald-950/40 border border-emerald-800/30 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-pulse flex-shrink-0" />
          <span className="font-medium">Systems Online</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 pt-2 space-y-0.5 overflow-y-auto">
          <div className="text-[8px] uppercase tracking-[0.15em] font-semibold px-2 py-1.5 text-slate-600">
            Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-2.5 px-2 py-1.5 rounded transition-all duration-150 relative"
                style={
                  active
                    ? { background: "rgba(34,211,238,0.08)", borderLeft: "2px solid #22d3ee" }
                    : { borderLeft: "2px solid transparent" }
                }
              >
                <Icon
                  className="w-3.5 h-3.5 flex-shrink-0 transition-colors"
                  style={{ color: active ? "#22d3ee" : "#64748b" }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[11px] font-medium leading-none transition-colors"
                    style={{ color: active ? "#e2e8f0" : "#64748b" }}
                  >
                    {item.label}
                  </div>
                </div>
                {active && <ChevronRight className="w-2.5 h-2.5 flex-shrink-0 text-cyan-400" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: feed indicator + user */}
        <div className="px-2 pb-2 pt-2 space-y-1.5 flex-shrink-0 border-t border-slate-800/60">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] bg-slate-900 border border-slate-800">
            <Radio className="w-2.5 h-2.5 flex-shrink-0 text-cyan-500" />
            <span className="flex-1 truncate text-slate-500">3 feeds active</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-pulse" />
          </div>
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-900 border border-slate-800">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 font-heading text-cyan-400 bg-cyan-950/60 border border-cyan-800/40">
              A
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium truncate text-slate-300">Analyst</div>
              <div className="text-[8px] truncate text-slate-600">local</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top header bar */}
        <header
          className="h-12 flex items-center justify-between px-5 flex-shrink-0 border-b border-slate-800/80"
          style={{ background: "var(--card)" }}
        >
          <div className="flex items-center gap-2">
            {navItems.map((item) => {
              if (!isActive(item.href)) return null;
              const Icon = item.icon;
              return (
                <div key={item.href} className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-sm font-semibold font-heading text-slate-200">{item.label}</span>
                  <span className="hidden sm:block text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider bg-slate-800 text-slate-500 border border-slate-700/50">
                    {item.desc}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-[9px] uppercase tracking-wider px-2 py-1 rounded bg-slate-800/80 text-emerald-400 border border-emerald-900/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-pulse" />
              Live
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              {new Date().toISOString().slice(0, 10)}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
