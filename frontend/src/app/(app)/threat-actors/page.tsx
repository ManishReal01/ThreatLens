"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { fetchApi } from "@/lib/api.client";
import {
  Search, ChevronLeft, ChevronRight, Users, Globe, Target, Loader2, Grid3X3,
} from "lucide-react";
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
function Sk({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-800 p-4 space-y-3 bg-slate-900/40">
          <div className="flex items-center justify-between">
            <Sk className="h-4 w-20" />
            <Sk className="h-5 w-10 rounded-full" />
          </div>
          <Sk className="h-5 w-36" />
          <Sk className="h-3 w-28" />
          <div className="flex gap-1.5">
            <Sk className="h-4 w-16 rounded-full" />
            <Sk className="h-4 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
function ThreatActorsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const page = parseInt(searchParams.get("page") || "1", 10);
  const q = searchParams.get("q") || "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("page", String(page));
      params.set("page_size", "25");
      const result = await fetchApi(`/api/threat-actors?${params.toString()}`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load threat actors");
    } finally {
      setLoading(false);
    }
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            Threat Actors
          </h1>
          <p className="text-xs mt-0.5 text-slate-500">MITRE ATT&CK adversary groups and their linked indicators</p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <div className="text-xs px-2.5 py-1 rounded-md font-mono bg-slate-800 text-slate-400 border border-slate-700">
              {data.total.toLocaleString()} groups
            </div>
          )}
          <Link
            href="/threat-actors/matrix"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all bg-teal-950/40 border border-teal-800/40 text-teal-400 hover:bg-teal-900/40"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            ATT&CK Matrix
          </Link>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search by name or alias…"
            className="w-full pl-9 pr-4 py-2 text-sm rounded-md bg-slate-900 border border-slate-700 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-700"
          />
        </div>
        <button onClick={search} className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-cyan-600 hover:bg-cyan-500 text-white">
          Search
        </button>
        {q && (
          <button
            onClick={() => { setQuery(""); router.push(pathname); }}
            className="px-3 py-2 rounded-md text-sm transition-colors bg-slate-800 border border-slate-700 text-slate-400"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-md text-sm bg-red-950/20 border border-red-800/40 text-red-400">{error}</div>
      )}

      {/* Card grid */}
      {loading ? (
        <CardSkeleton />
      ) : data && data.items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {data.items.map((actor) => (
            <Link
              key={actor.id}
              href={`/threat-actors/${actor.id}`}
              className="group block"
            >
              <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 p-4 space-y-3 transition-all duration-200 hover:border-cyan-700/40 hover:bg-slate-800/40 cursor-pointer">
                {/* Top: MITRE ID + IOC count */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/50 text-cyan-300 ring-1 ring-cyan-500/20">
                    {actor.mitre_id}
                  </span>
                  {actor.linked_ioc_count > 0 ? (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ring-1 ${actor.linked_ioc_count > 10 ? "bg-red-950/40 text-red-400 ring-red-500/30" : "bg-cyan-950/40 text-cyan-400 ring-cyan-500/20"}`}>
                      <Target className="w-2.5 h-2.5" />
                      {actor.linked_ioc_count}
                    </span>
                  ) : null}
                </div>

                {/* Name */}
                <div>
                  <div className="text-sm font-semibold text-slate-100 truncate group-hover:text-cyan-200 transition-colors">
                    {actor.name}
                  </div>
                  {actor.country && (
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500">
                      <Globe className="w-2.5 h-2.5" />
                      {actor.country}
                    </div>
                  )}
                </div>

                {/* Aliases */}
                {actor.aliases.length > 0 && (
                  <div className="text-[9px] text-slate-600 truncate">
                    {actor.aliases.slice(0, 3).join(" · ")}
                    {actor.aliases.length > 3 && ` +${actor.aliases.length - 3}`}
                  </div>
                )}

                {/* Motivations */}
                {actor.motivations.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {actor.motivations.slice(0, 2).map((m) => (
                      <span key={m} className="text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-wider bg-purple-950/40 text-purple-400 ring-1 ring-purple-500/20">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Users className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No threat actors found{q && ` matching "${q}"`}</p>
          <p className="text-xs mt-1 opacity-60">MITRE ATT&CK data loads on startup — check the feeds page if this persists.</p>
        </div>
      ) : null}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">Page {data.page} of {data.pages}</span>
          <div className="flex gap-1">
            <button
              disabled={data.page <= 1}
              onClick={() => goPage(data.page - 1)}
              className="p-1.5 rounded-md disabled:opacity-30 transition-colors bg-slate-800 border border-slate-700"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-300" />
            </button>
            <button
              disabled={data.page >= data.pages}
              onClick={() => goPage(data.page + 1)}
              className="p-1.5 rounded-md disabled:opacity-30 transition-colors bg-slate-800 border border-slate-700"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
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
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    }>
      <ThreatActorsContent />
    </Suspense>
  );
}
