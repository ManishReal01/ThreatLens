"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { fetchApi } from "@/lib/api.client";
import { Search, Users, Globe, Target, Loader2, Grid3X3, X, Zap } from "lucide-react";
import Link from "next/link";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface ThreatActor {
  id: string;
  mitre_id: string;
  name: string;
  aliases: string[];
  country: string | null;
  motivations: string[];
  linked_ioc_count: number;
}

/* ─── Motivation color map ───────────────────────────────────────────────── */
const MOTIV_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "financial-gain":  { bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.35)",  text: "#4ade80" },
  "espionage":       { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.35)", text: "#60a5fa" },
  "cyber-espionage": { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.35)", text: "#60a5fa" },
  "destructive":     { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.35)",  text: "#f87171" },
  "hacktivism":      { bg: "rgba(251,146,60,0.1)",  border: "rgba(251,146,60,0.35)", text: "#fb923c" },
  "nation-state":    { bg: "rgba(34,211,238,0.08)", border: "rgba(34,211,238,0.28)", text: "#22d3ee" },
  "ideology":        { bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.25)", text: "#fb923c" },
};
function motivColor(m: string) {
  return MOTIV_COLORS[m.toLowerCase().replace(/\s+/g, "-")] ?? {
    bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.22)", text: "#c084fc",
  };
}

/* ─── Actor card ─────────────────────────────────────────────────────────── */
function ActorCard({ actor }: { actor: ThreatActor }) {
  const iocColor =
    actor.linked_ioc_count >= 100 ? "#ef4444" :
    actor.linked_ioc_count >= 20  ? "#f97316" :
    actor.linked_ioc_count >= 5   ? "#f59e0b" :
    actor.linked_ioc_count > 0    ? "#22d3ee" : null;

  return (
    <Link href={`/threat-actors/${actor.id}`} className="block group">
      <div
        className="rounded-xl p-4 h-full flex flex-col gap-3 transition-all duration-200"
        style={{
          background: "rgba(8,14,28,0.95)",
          border: "1px solid rgba(34,211,238,0.08)",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.border = "1px solid rgba(34,211,238,0.42)";
          el.style.boxShadow = "0 8px 28px rgba(34,211,238,0.07), 0 2px 8px rgba(0,0,0,0.4)";
          el.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.border = "1px solid rgba(34,211,238,0.08)";
          el.style.boxShadow = "";
          el.style.transform = "";
        }}
      >
        {/* Top: MITRE ID + IOC badge */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="font-mono text-[10px] px-2 py-0.5 rounded-md font-bold tracking-wider"
            style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.18)", color: "#22d3ee" }}
          >
            {actor.mitre_id}
          </span>
          {iocColor && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold"
              style={{
                background: `${iocColor}14`,
                border: `1px solid ${iocColor}42`,
                color: iocColor,
              }}
            >
              <Target className="w-2.5 h-2.5" />
              {actor.linked_ioc_count}
            </span>
          )}
        </div>

        {/* Name + aliases */}
        <div className="flex-1 min-w-0">
          <h3
            className="text-[13px] font-bold leading-tight transition-colors group-hover:text-cyan-300"
            style={{ fontFamily: "var(--font-heading)", color: "#e2e8f0" }}
          >
            {actor.name}
          </h3>
          {actor.aliases.length > 0 && (
            <p className="text-[9px] font-mono mt-1 truncate" style={{ color: "#2d3f5a" }}>
              {actor.aliases.slice(0, 3).join(" · ")}
              {actor.aliases.length > 3 && ` +${actor.aliases.length - 3}`}
            </p>
          )}
        </div>

        {/* Footer: country + motivations */}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {actor.country && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-mono font-semibold uppercase tracking-wider flex-shrink-0"
              style={{ background: "rgba(51,65,85,0.35)", border: "1px solid rgba(51,65,85,0.6)", color: "#64748b" }}
            >
              <Globe className="w-2 h-2" />
              {actor.country}
            </span>
          )}
          {actor.motivations.slice(0, 2).map((m) => {
            const c = motivColor(m);
            return (
              <span
                key={m}
                className="text-[7px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold"
                style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
              >
                {m.replace(/-/g, " ")}
              </span>
            );
          })}
        </div>
      </div>
    </Link>
  );
}

/* ─── Filter pill ────────────────────────────────────────────────────────── */
function FilterPill({
  label, active, color, onClick,
}: {
  label: string; active: boolean;
  color?: { bg: string; border: string; text: string };
  onClick: () => void;
}) {
  const defaultColor = { bg: "rgba(34,211,238,0.05)", border: "rgba(34,211,238,0.12)", text: "#475569" };
  const activeColor  = color ?? { bg: "rgba(34,211,238,0.14)", border: "rgba(34,211,238,0.4)", text: "#22d3ee" };
  const style = active ? activeColor : defaultColor;

  return (
    <button
      onClick={onClick}
      className="text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold transition-all duration-150"
      style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.text }}
    >
      {label}
    </button>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────────── */
function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.1)" }}
      >
        <Users className="w-6 h-6" style={{ color: "#1e293b" }} />
      </div>
      <div className="text-center space-y-1">
        <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "#334155" }}>
          {hasFilters ? "No threat actors match these filters" : "No threat actors found"}
        </p>
        <p className="text-[10px]" style={{ color: "#1e293b" }}>
          {hasFilters
            ? "Try removing some filters"
            : "MITRE ATT&CK data loads on startup — check the feeds page"}
        </p>
      </div>
      {hasFilters && (
        <button
          onClick={onClear}
          className="text-[10px] font-mono px-3 py-1.5 rounded-lg transition-all"
          style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.18)", color: "#22d3ee" }}
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

/* ─── Main content ───────────────────────────────────────────────────────── */
function ThreatActorsContent() {
  const [allActors, setAllActors] = useState<ThreatActor[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [query, setQuery]         = useState("");
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [motivFilter,   setMotivFilter]   = useState<string | null>(null);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        // Backend caps page_size at 100 — fetch all pages
        const first = await fetchApi("/api/threat-actors?page_size=100&page=1");
        const items: ThreatActor[] = first?.items ?? [];
        const totalPages: number   = first?.pages ?? 1;
        if (totalPages > 1) {
          const rest = await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              fetchApi(`/api/threat-actors?page_size=100&page=${i + 2}`)
                .then((r) => (r?.items ?? []) as ThreatActor[])
                .catch(() => [] as ThreatActor[])
            )
          );
          items.push(...rest.flat());
        }
        setAllActors(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load threat actors");
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  const { countries, motivations } = useMemo(() => {
    const cs = new Set<string>();
    const ms = new Set<string>();
    for (const a of allActors) {
      if (a.country) cs.add(a.country);
      for (const m of a.motivations) ms.add(m);
    }
    return { countries: Array.from(cs).sort(), motivations: Array.from(ms).sort() };
  }, [allActors]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return allActors.filter((a) => {
      if (q) {
        const match =
          a.name.toLowerCase().includes(q) ||
          a.mitre_id.toLowerCase().includes(q) ||
          a.aliases.some((x) => x.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (countryFilter && a.country !== countryFilter) return false;
      if (motivFilter   && !a.motivations.includes(motivFilter)) return false;
      return true;
    });
  }, [allActors, query, countryFilter, motivFilter]);

  const hasFilters = !!(query || countryFilter || motivFilter);
  const clearAll   = () => { setQuery(""); setCountryFilter(null); setMotivFilter(null); };

  return (
    <div className="space-y-4 animate-in fade-in duration-400">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-widest font-mono" style={{ color: "#e2e8f0" }}>
            Threat Actors
          </h1>
          <p className="text-[9px] mt-0.5 uppercase tracking-wider font-mono" style={{ color: "#2d3f5a" }}>
            MITRE ATT&amp;CK adversary groups
            {!loading && (
              <span style={{ color: "#334155" }}>
                {" · "}{allActors.length.toLocaleString()} groups
                {hasFilters && filtered.length !== allActors.length && ` · ${filtered.length} shown`}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/threat-actors/matrix"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all"
          style={{ background: "rgba(20,184,166,0.08)", border: "1px solid rgba(20,184,166,0.2)", color: "#2dd4bf" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(20,184,166,0.14)";
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(20,184,166,0.4)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(20,184,166,0.08)";
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(20,184,166,0.2)";
          }}
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          ATT&amp;CK Matrix
        </Link>
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "#2d3f5a" }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, alias, or MITRE ID…"
          className="w-full pl-10 pr-10 py-2.5 text-[11px] font-mono rounded-xl outline-none transition-all placeholder:text-slate-800"
          style={{
            background: "rgba(7,13,24,0.85)",
            border: "1px solid rgba(34,211,238,0.1)",
            color: "#e2e8f0",
          }}
          onFocus={(e) => (e.target.style.borderColor = "rgba(34,211,238,0.35)")}
          onBlur={(e)  => (e.target.style.borderColor = "rgba(34,211,238,0.1)")}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-colors hover:text-cyan-400"
            style={{ color: "#334155" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Filter pills ────────────────────────────────────────────────── */}
      {!loading && (countries.length > 0 || motivations.length > 0) && (
        <div className="space-y-2">
          {/* Country pills */}
          {countries.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[8px] uppercase tracking-widest font-mono mr-0.5" style={{ color: "#1e293b" }}>
                Country
              </span>
              {countries.slice(0, 14).map((c) => (
                <FilterPill
                  key={c}
                  label={c}
                  active={countryFilter === c}
                  onClick={() => setCountryFilter(countryFilter === c ? null : c)}
                />
              ))}
            </div>
          )}

          {/* Motivation pills */}
          {motivations.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[8px] uppercase tracking-widest font-mono mr-0.5" style={{ color: "#1e293b" }}>
                Motivation
              </span>
              {motivations.map((m) => (
                <FilterPill
                  key={m}
                  label={m.replace(/-/g, " ")}
                  active={motivFilter === m}
                  color={motivColor(m)}
                  onClick={() => setMotivFilter(motivFilter === m ? null : m)}
                />
              ))}
              {hasFilters && (
                <button
                  onClick={clearAll}
                  className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider transition-all"
                  style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                >
                  <X className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-3 rounded-lg text-[11px] font-mono" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* ── Cards / States ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#22d3ee" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#1e293b" }}>
              Loading threat actors…
            </span>
          </div>
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((actor) => (
            <ActorCard key={actor.id} actor={actor} />
          ))}
        </div>
      ) : (
        <EmptyState hasFilters={hasFilters} onClear={clearAll} />
      )}

      {/* ── Stats footer (when loaded) ───────────────────────────────────── */}
      {!loading && allActors.length > 0 && (
        <div className="flex items-center gap-4 pt-2 border-t" style={{ borderColor: "rgba(34,211,238,0.06)" }}>
          <div className="flex items-center gap-1.5">
            <Users className="w-3 h-3" style={{ color: "#334155" }} />
            <span className="text-[9px] font-mono" style={{ color: "#334155" }}>
              {allActors.length} total actors
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3" style={{ color: "#334155" }} />
            <span className="text-[9px] font-mono" style={{ color: "#334155" }}>
              {allActors.filter((a) => a.linked_ioc_count > 0).length} with linked IOCs
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ThreatActorsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#22d3ee" }} />
      </div>
    }>
      <ThreatActorsContent />
    </Suspense>
  );
}
