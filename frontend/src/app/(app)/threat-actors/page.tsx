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

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 rounded" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <Sk className="h-4 w-24" />
          <Sk className="h-4 w-40 flex-1" />
          <Sk className="h-4 w-28" />
          <Sk className="h-4 w-20" />
          <Sk className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/* ─── Country flag / pill ────────────────────────────────────────────────── */
function CountryPill({ country }: { country: string | null }) {
  if (!country) return <span style={{ color: "var(--muted-foreground)" }} className="text-xs">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider"
      style={{ background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.2)", color: "var(--muted-foreground)" }}
    >
      <Globe className="w-2.5 h-2.5" />
      {country}
    </span>
  );
}

/* ─── IOC count badge ────────────────────────────────────────────────────── */
function IocCountBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
      style={{
        background: count > 10 ? "rgba(239,68,68,0.1)" : "rgba(56,189,248,0.1)",
        border: count > 10 ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(56,189,248,0.25)",
        color: count > 10 ? "#f87171" : "var(--primary)",
      }}
    >
      <Target className="w-2.5 h-2.5" />
      {count}
    </span>
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
          <h1 className="text-lg font-bold font-heading" style={{ color: "var(--foreground)" }}>
            Threat Actors
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            MITRE ATT&CK adversary groups and their linked indicators
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <div
              className="text-xs px-3 py-1.5 rounded font-mono"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
            >
              {data.total.toLocaleString()} groups
            </div>
          )}
          <Link
            href="/threat-actors/matrix"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
            style={{
              background: "rgba(20,184,166,0.08)",
              border: "1px solid rgba(20,184,166,0.25)",
              color: "#2dd4bf",
            }}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            ATT&CK Matrix
          </Link>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--muted-foreground)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search by name or alias…"
            className="w-full pl-9 pr-4 py-2 text-sm rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
          />
        </div>
        <button
          onClick={search}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{ background: "var(--primary)", color: "#000" }}
        >
          Search
        </button>
        {q && (
          <button
            onClick={() => { setQuery(""); router.push(pathname); }}
            className="px-3 py-2 rounded-md text-sm transition-colors"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* Table header */}
      <div
        className="hidden md:grid grid-cols-[120px_1fr_180px_160px_80px] gap-4 px-4 py-2 rounded border border-slate-700/50 text-[9px] uppercase tracking-[0.1em] font-semibold"
        style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
      >
        <span>MITRE ID</span>
        <span>Name / Aliases</span>
        <span>Country</span>
        <span>Motivation</span>
        <span className="text-right">IOCs</span>
      </div>

      {/* Content */}
      {loading ? (
        <TableSkeleton />
      ) : data && data.items.length > 0 ? (
        <div className="space-y-1">
          {data.items.map((actor) => (
            <Link
              key={actor.id}
              href={`/threat-actors/${actor.id}`}
              className="group block"
            >
              <div
                className="grid grid-cols-1 md:grid-cols-[120px_1fr_180px_160px_80px] gap-2 md:gap-4 px-4 py-3 rounded border border-slate-700/50 transition-all duration-150 cursor-pointer"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(56,189,248,0.3)";
                  (e.currentTarget as HTMLDivElement).style.background = "rgba(56,189,248,0.03)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLDivElement).style.background = "var(--card)";
                }}
              >
                {/* MITRE ID */}
                <div className="flex items-center">
                  <span
                    className="font-mono text-xs px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(56,189,248,0.08)", color: "var(--primary)", border: "1px solid rgba(56,189,248,0.2)" }}
                  >
                    {actor.mitre_id}
                  </span>
                </div>

                {/* Name + aliases */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                    {actor.name}
                  </span>
                  {actor.aliases.length > 0 && (
                    <span className="text-[10px] truncate" style={{ color: "var(--muted-foreground)" }}>
                      {actor.aliases.slice(0, 4).join(" · ")}
                      {actor.aliases.length > 4 && ` +${actor.aliases.length - 4}`}
                    </span>
                  )}
                </div>

                {/* Country */}
                <div className="flex items-center">
                  <CountryPill country={actor.country} />
                </div>

                {/* Motivations */}
                <div className="flex items-center flex-wrap gap-1">
                  {actor.motivations.length > 0 ? (
                    actor.motivations.slice(0, 2).map((m) => (
                      <span
                        key={m}
                        className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                        style={{ background: "rgba(168,85,247,0.08)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }}
                      >
                        {m}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "var(--muted-foreground)" }} className="text-xs">—</span>
                  )}
                </div>

                {/* IOC count */}
                <div className="flex items-center justify-end">
                  <IocCountBadge count={actor.linked_ioc_count} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--muted-foreground)" }}>
          <Users className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No threat actors found{q && ` matching "${q}"`}</p>
          <p className="text-xs mt-1 opacity-60">MITRE ATT&CK data loads on startup — check the feeds page if this persists.</p>
        </div>
      ) : null}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Page {data.page} of {data.pages}
          </span>
          <div className="flex gap-1">
            <button
              disabled={data.page <= 1}
              onClick={() => goPage(data.page - 1)}
              className="p-1.5 rounded disabled:opacity-30 transition-colors"
              style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
            >
              <ChevronLeft className="w-3.5 h-3.5" style={{ color: "var(--foreground)" }} />
            </button>
            <button
              disabled={data.page >= data.pages}
              onClick={() => goPage(data.page + 1)}
              className="p-1.5 rounded disabled:opacity-30 transition-colors"
              style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
            >
              <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--foreground)" }} />
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
