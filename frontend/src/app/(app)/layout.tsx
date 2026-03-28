"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Search, Bookmark, ShieldHalf,
  Radio, ChevronRight, Users, Layers, Network,
} from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [clock, setClock] = useState({ time: "", date: "" });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setClock({
        time: now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        date: now.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase(),
      });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const navItems = [
    { href: "/",                    label: "Overview",       icon: LayoutDashboard, desc: "System status" },
    { href: "/search",              label: "IOC Search",     icon: Search,           desc: "Find indicators" },
    { href: "/threat-actors",       label: "Threat Actors",  icon: Users,            desc: "MITRE ATT&CK" },
    { href: "/campaigns",           label: "Campaigns",      icon: Network,          desc: "Correlation clusters" },
    { href: "/bulk-lookup",         label: "Bulk Lookup",    icon: Layers,           desc: "Batch IOC search" },
    { href: "/workspace/watchlist", label: "Watchlist",      icon: Bookmark,         desc: "Monitored IOCs" },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* ─── Global styles (no globals.css modification) ─────────────────── */}
      <style>{`
        @keyframes scanline-sweep {
          0%   { top: -4px; opacity: 0.6; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes status-pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.8); }
          70%  { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
        @keyframes live-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
        .status-pulse {
          animation: status-pulse-ring 2s ease-out infinite;
        }
        .nav-link { position: relative; }
        .nav-link:hover .nav-icon { filter: drop-shadow(0 0 5px rgba(34,211,238,0.7)); color: #67e8f9 !important; }
        .nav-link:hover .nav-label { color: #cbd5e1 !important; }
        .nav-link:hover { background: rgba(34,211,238,0.05) !important; }
        .panel-card { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .panel-card:hover { border-color: rgba(34,211,238,0.18) !important; box-shadow: 0 0 16px rgba(34,211,238,0.05); }
        .soc-scroll::-webkit-scrollbar { width: 4px; }
        .soc-scroll::-webkit-scrollbar-track { background: transparent; }
        .soc-scroll::-webkit-scrollbar-thumb { background: rgba(34,211,238,0.25); border-radius: 2px; }
        .soc-scroll::-webkit-scrollbar-thumb:hover { background: rgba(34,211,238,0.5); }
        .soc-scroll { scrollbar-width: thin; scrollbar-color: rgba(34,211,238,0.25) transparent; }
      `}</style>

      {/* ─── Cyan top-edge accent ─────────────────────────────────────────── */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(to right, transparent 0%, #00d4ff 20%, #22d3ee 50%, #00d4ff 80%, transparent 100%)", zIndex: 9999, pointerEvents: "none" }} />

      <div className="flex min-h-screen bg-background" style={{ paddingTop: "2px" }}>
        {/* ─── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="w-44 flex-shrink-0 flex flex-col border-r" style={{ background: "#060b16", borderColor: "rgba(34,211,238,0.1)" }}>

          {/* Brand */}
          <div className="h-12 flex items-center gap-2 px-3 flex-shrink-0 relative overflow-hidden" style={{ borderBottom: "1px solid rgba(34,211,238,0.1)" }}>
            <div className="absolute inset-0 bg-grid-ops opacity-50 pointer-events-none" style={{ backgroundSize: "20px 20px" }} />
            <div
              className="relative z-10 w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.35)", boxShadow: "0 0 12px rgba(34,211,238,0.12)" }}
            >
              <ShieldHalf className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="relative z-10 min-w-0">
              <div className="text-[11px] font-bold tracking-[0.14em] uppercase font-heading truncate" style={{ color: "#e2e8f0", textShadow: "0 0 12px rgba(34,211,238,0.4)" }}>
                ThreatLens
              </div>
              <div className="text-[8px] tracking-[0.1em] uppercase text-slate-500">
                SOC Platform
              </div>
            </div>
          </div>

          {/* Systems status */}
          <div className="mx-2 mt-2 mb-1 flex items-center gap-1.5 px-2 py-1 rounded text-[9px] uppercase tracking-wider" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", color: "#6ee7b7" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-pulse flex-shrink-0" />
            <span className="font-medium">Systems Online</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 pt-2 space-y-0.5 overflow-y-auto">
            <div className="text-[8px] uppercase tracking-[0.18em] font-semibold px-2 py-1.5 text-slate-700">
              Navigation
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.desc}
                  className="nav-link group flex items-center gap-2.5 px-2 py-1.5 rounded transition-all duration-150"
                  style={
                    active
                      ? { background: "rgba(34,211,238,0.08)", borderLeft: "2px solid #22d3ee", boxShadow: "inset 0 0 12px rgba(34,211,238,0.04)" }
                      : { borderLeft: "2px solid transparent" }
                  }
                >
                  <Icon
                    className="nav-icon w-3.5 h-3.5 flex-shrink-0 transition-all duration-150"
                    style={{ color: active ? "#22d3ee" : "#475569" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className="nav-label text-[11px] font-medium leading-none transition-colors duration-150"
                      style={{ color: active ? "#e2e8f0" : "#475569" }}
                    >
                      {item.label}
                    </div>
                  </div>
                  {active && <ChevronRight className="w-2.5 h-2.5 flex-shrink-0 text-cyan-400" />}
                </Link>
              );
            })}
          </nav>

          {/* Bottom */}
          <div className="px-2 pb-2 pt-2 space-y-1.5 flex-shrink-0" style={{ borderTop: "1px solid rgba(34,211,238,0.07)" }}>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px]" style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.1)" }}>
              <Radio className="w-2.5 h-2.5 flex-shrink-0 text-cyan-600" />
              <span className="flex-1 truncate text-slate-600">Feeds active</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-pulse" />
            </div>
            <div className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: "rgba(34,211,238,0.03)", border: "1px solid rgba(34,211,238,0.08)" }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 font-heading text-cyan-400" style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)" }}>
                A
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium truncate text-slate-400">Analyst</div>
                <div className="text-[8px] truncate text-slate-700">SOC · Local</div>
              </div>
            </div>
            <div className="px-2 pt-1 flex items-center justify-between">
              <span className="text-[7px] uppercase tracking-wider text-slate-800">ThreatLens</span>
              <span className="text-[7px] font-mono text-slate-800">v1.0.0</span>
            </div>
          </div>
        </aside>

        {/* ─── Main ─────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">

          {/* Top header */}
          <header className="h-12 flex items-center justify-between px-5 flex-shrink-0 relative overflow-hidden" style={{ background: "rgba(6,11,22,0.95)", borderBottom: "1px solid rgba(34,211,238,0.1)" }}>
            {/* Scan-line bg grid */}
            <div className="absolute inset-0 bg-grid-ops opacity-30 pointer-events-none" style={{ backgroundSize: "32px 32px" }} />
            {/* Animated scan sweep */}
            <div
              className="absolute left-0 right-0 pointer-events-none"
              style={{
                height: "2px",
                background: "linear-gradient(to right, transparent, rgba(34,211,238,0.06), transparent)",
                animation: "scanline-sweep 5s linear infinite",
              }}
            />

            {/* Left: page label */}
            <div className="relative z-10 flex items-center gap-2">
              {navItems.map((item) => {
                if (!isActive(item.href)) return null;
                const Icon = item.icon;
                return (
                  <div key={item.href} className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-cyan-400" style={{ filter: "drop-shadow(0 0 4px rgba(34,211,238,0.5))" }} />
                    <span className="text-sm font-semibold font-heading" style={{ color: "#e2e8f0" }}>{item.label}</span>
                    <span className="hidden sm:block text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: "rgba(34,211,238,0.06)", color: "rgba(34,211,238,0.5)", border: "1px solid rgba(34,211,238,0.12)" }}>
                      {item.desc}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Right: LIVE + clock */}
            <div className="relative z-10 flex items-center gap-3">
              {/* LIVE indicator */}
              <div className="hidden sm:flex items-center gap-1.5 text-[9px] uppercase tracking-wider px-2.5 py-1 rounded" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: "#4ade80" }}>
                <span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"
                  style={{ animation: "status-pulse-ring 2s ease-out infinite", boxShadow: "0 0 6px rgba(34,197,94,0.9)" }}
                />
                <span style={{ animation: "live-blink 3s ease-in-out infinite" }}>Live</span>
              </div>

              {/* Clock */}
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-[11px] font-mono font-bold tabular-nums leading-none" style={{ color: "#22d3ee", textShadow: "0 0 8px rgba(34,211,238,0.4)" }}>
                    {clock.time || "00:00:00"}
                  </div>
                  <div className="text-[8px] font-mono text-slate-700 mt-0.5 leading-none tabular-nums">
                    {clock.date || "---"}
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-5">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
