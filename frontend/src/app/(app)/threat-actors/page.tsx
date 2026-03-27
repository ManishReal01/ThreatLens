"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { fetchApi } from "@/lib/api.client";
import { Search, ChevronLeft, ChevronRight, Users, Globe, Target, Loader2, Grid3X3 } from "lucide-react";
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
interface PaginatedResponse {
  items: ThreatActor[];
  total: number;
  page: number;
  pages: number;
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton h-32 rounded-lg" />
      ))}
    </div>
  );
}

/* ─── Actor card ─────────────────────────────────────────────────────────── */
function ActorCard({ actor }: { actor: ThreatActor }) {
  const iocColor =
    actor.linked_ioc_count >= 100 ? "#ef4444" :
    actor.linked_ioc_count >= 20  ? "#f97316" :
    actor.linked_ioc_count >= 5   ? "#f59e0b" :
    actor.linked_ioc_count > 0    ? "#22d3ee" : "#475569";

  return (
    <Link href={`/threat-actors/${actor.id}`} className="block group">
      <div
        className="rounded-lg p-3 space-y-2.5 h-full transition-all duration-200 cursor-pointer"
        style={{
          background: "rgba(10,16,32,0.7)",
          border: "1px solid rgba(34,211,238,0.1)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.border = "1px solid rgba(34,211,238,0.35)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(34,211,238,0.05), inset 0 0 20px rgba(34,211,238,0.02)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.border = "1px solid rgba(34,211,238,0.1)";
          (e.currentTarget as HTMLElement).style.boxShadow = "";
        }}
      >
        {/* Top row: MITRE ID + IOC badge */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="font-mono text-[9px] px-1.5 py-0.5 rounded font-bold"
            style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", color: "#22d3ee" }}
          >
            {actor.mitre_id}
          </span>
          {actor.linked_ioc_count > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold"
              style={{
                background: `${iocColor}12`,
                border: `1px solid ${iocColor}35`,
                color: iocColor,
              }}
            >
              <Target className="w-2 h-2 flex-shrink-0" />
              {actor.linked_ioc_count}
            </span>
          )}
        </div>

        {/* Name */}
        <div>
          <div
            className="text-[12px] font-bold leading-tight transition-colors group-hover:text-cyan-300"
            style={{ color: "#e2e8f0" }}
          >
            {actor.name}
          </div>
          {actor.country && (
            <div className="flex items-center gap-1 mt-1">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider"
                style={{ background: "rgba(71,85,105,0.15)", border: "1px solid rgba(71,85,105,0.3)", color: "#64748b" }}
              >
                <Globe className="w-2 h-2 flex-shrink-0" />
                {actor.country}
              </span>
            </div>
          )}
        </div>

        {/* Aliases */}
        {actor.aliases.length > 0 && (
          <div className="text-[8px] font-mono truncate" style={{ color: "#334155" }}>
            {actor.aliases.slice(0, 3).join(" · ")}{actor.aliases.length > 3 && ` +${actor.aliases.length - 3}`}
          </div>
        )}

        {/* Motivations */}
        {actor.motivations.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {actor.motivations.slice(0, 2).map((m) => (
              <span
                key={m}
                className="text-[7px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold"
                style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)", color: "#c084fc" }}
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
function ThreatActorsContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const pathname     = usePathname();

  const [query,   setQuery]   = useState(searchParams.get("q") || "");
  const [data,    setData]    = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const page = parseInt(searchParams.get("page") || "1", 10);
  const q    = searchParams.get("q") || "";

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("page",      String(page));
      params.set("page_size", "25");
      const result = await fetchApi(`/api/threat-actors?${params.toString()}`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load threat actors");
    } finally { setLoading(false); }
  }, [q, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const search = () => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const goPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-400">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-widest font-mono text-slate-200">Threat Actors</h1>
          <p className="text-[9px] mt-0.5 text-slate-600 uppercase tracking-wider">
            MITRE ATT&CK adversary groups
            {data && <span className="ml-1 text-slate-700">· {data.total.toLocaleString()} groups</span>}
          </p>
        </div>
        <Link
          href="/threat-actors/matrix"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[9px] font-mono uppercase tracking-wider font-bold transition-all"
          style={{ background: "rgba(20,184,166,0.08)", border: "1px solid rgba(20,184,166,0.2)", color: "#2dd4bf" }}
        >
          <Grid3X3 className="w-3 h-3" />
          ATT&CK Matrix
        </Link>
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search by name or alias…"
            className="w-full pl-8 pr-4 py-2 text-[11px] font-mono rounded-lg outline-none transition-all placeholder:text-slate-800"
            style={{
              background: "rgba(7,13,24,0.8)",
              border: "1px solid rgba(34,211,238,0.12)",
              color: "#e2e8f0",
            }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(34,211,238,0.4)")}
            onBlur={(e)  => (e.target.style.borderColor = "rgba(34,211,238,0.12)")}
          />
        </div>
        <button
          onClick={search}
          className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
          style={{ background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee" }}
        >
          Search
        </button>
        {q && (
          <button
            onClick={() => { setQuery(""); router.push(pathname); }}
            className="px-3 py-2 rounded-lg text-[10px] font-mono transition-all"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 rounded text-[10px] font-mono" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* ── Card grid ───────────────────────────────────────────────────── */}
      {loading ? (
        <CardSkeleton />
      ) : data && data.items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {data.items.map((actor) => (
            <ActorCard key={actor.id} actor={actor} />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Users className="w-8 h-8 text-slate-800" />
          <p className="text-[10px] uppercase tracking-wider text-slate-600">
            No threat actors found{q && ` matching "${q}"`}
          </p>
          <p className="text-[9px] text-slate-800">MITRE ATT&CK data loads on startup — check the feeds page if this persists.</p>
        </div>
      ) : null}

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[9px] font-mono text-slate-700">Page {data.page} of {data.pages}</span>
          <div className="flex gap-1.5">
            <button
              disabled={data.page <= 1}
              onClick={() => goPage(data.page - 1)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[9px] font-mono uppercase tracking-wider disabled:opacity-30 transition-all"
              style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.12)", color: "#94a3b8" }}
            >
              <ChevronLeft className="w-3 h-3" /> Prev
            </button>
            <button
              disabled={data.page >= data.pages}
              onClick={() => goPage(data.page + 1)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[9px] font-mono uppercase tracking-wider disabled:opacity-30 transition-all"
              style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.12)", color: "#94a3b8" }}
            >
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ThreatActorsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
      </div>
    }>
      <ThreatActorsContent />
    </Suspense>
  );
}
