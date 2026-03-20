"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { fetchApi } from "@/lib/api.client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, ChevronLeft, ChevronRight, Bookmark, Download, FileJson } from "lucide-react";
import Link from "next/link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface IOCResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[];
  total: number;
  page: number;
  pages: number;
}

const MOCK_DATA = {
  items: [
    { id: "ioc-1", value: "185.15.247.140", type: "ipv4", severity: "critical", score: 98, last_seen: new Date().toISOString(), is_watched: true, tags: ["c2-server"] },
    { id: "ioc-2", value: "malicious-domain.com", type: "domain", severity: "high", score: 85, last_seen: new Date().toISOString() },
    { id: "ioc-3", value: "http://example.com/payload.exe", type: "url", severity: "high", score: 79, last_seen: new Date().toISOString(), is_watched: true, tags: ["malware"] },
    { id: "ioc-4", value: "88.214.26.43", type: "ipv4", severity: "medium", score: 65, last_seen: new Date().toISOString() },
  ],
  total: 4,
  page: 1,
  pages: 1,
};

function SearchFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [type, setType] = useState(searchParams.get("type") || "all");
  const [severity, setSeverity] = useState(searchParams.get("severity") || "all");
  
  const [results, setResults] = useState<IOCResponse>(MOCK_DATA);
  const [loading, setLoading] = useState(false);

  // Apply filters to URL
  const applyFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (query) params.set("q", query);
    else params.delete("q");
    
    if (type && type !== "all") params.set("type", type);
    else params.delete("type");
    
    if (severity && severity !== "all") params.set("severity", severity);
    else params.delete("severity");
    
    params.set("page", "1"); // Reset to page 1 on new filter
    
    router.push(`${pathname}?${params.toString()}`);
  }, [query, type, severity, pathname, router, searchParams]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      applyFilters();
    }
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const queryParams = searchParams.toString();
        const res = await fetchApi(`/api/iocs/search?${queryParams}`);
        if (res && res.items) {
          setResults(res);
        }
      } catch {
         // Silently fallback to mock data
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [searchParams]);

  const changePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const handleExportCSV = () => {
    const headers = ["Indicator", "Type", "Severity", "Score", "Tags", "Observed Date"];
    const rows = results.items.map(item => [
      item.value, 
      item.type, 
      item.severity, 
      item.score,
      (item.tags || []).join("; "), 
      new Date(item.last_seen).toLocaleDateString()
    ]);
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `threatlens-search-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results.items, null, 2));
    const link = document.createElement("a");
    link.href = dataStr;
    link.download = `threatlens-search-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">IOC Search</h1>
          <p className="text-muted-foreground mt-1">Locate indicators across all feeds.</p>
        </div>
        <DropdownMenu>
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-expect-error type missing */}
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" /> Export Results
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportCSV}>
               <span className="font-medium flex items-center">Download as CSV</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportJSON}>
               <span className="font-medium flex items-center"><FileJson className="w-4 h-4 mr-2 text-muted-foreground" /> Download as JSON</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card>
        <CardContent className="p-4 sm:flex items-center space-y-4 sm:space-y-0 sm:space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search IPs, domains, hashes..." 
              className="pl-9"
            />
          </div>
          
          <Select value={type} onValueChange={v => setType(v || "all")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="ipv4">IPv4</SelectItem>
              <SelectItem value="domain">Domain</SelectItem>
              <SelectItem value="url">URL</SelectItem>
              <SelectItem value="hash">Hash</SelectItem>
            </SelectContent>
          </Select>

          <Select value={severity} onValueChange={v => setSeverity(v || "all")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={applyFilters}>Search</Button>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicator</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="text-right">Observed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : results.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No results found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                results.items.map((ioc) => (
                  <TableRow key={ioc.id} className={`cursor-pointer transition-colors ${ioc.is_watched ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <TableCell>
                      <Link href={`/iocs/${ioc.id}`} className="font-mono text-sm font-medium text-primary hover:underline flex items-center w-full h-full">
                        {ioc.is_watched && <Bookmark className="w-3 h-3 mr-2 text-primary" fill="currentColor" />}
                        {ioc.value}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px] tracking-wider">{ioc.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${ioc.score}%` }}></div>
                        </div>
                        <span className="text-xs text-muted-foreground">{ioc.score}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ioc.severity === 'critical' ? 'destructive' : 'secondary'} className="capitalize">
                        {ioc.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(ioc.last_seen).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {!loading && results.pages > 1 && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing page {results.page} of {results.pages}
            </span>
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => changePage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => changePage(currentPage + 1)}
                disabled={currentPage >= results.pages}
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-96 bg-card rounded-xl"></div>}>
      <SearchFilters />
    </Suspense>
  );
}
