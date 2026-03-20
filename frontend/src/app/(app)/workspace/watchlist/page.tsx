"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bookmark, Loader2, Download, FileJson, BookmarkMinus } from "lucide-react";
import Link from "next/link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const MOCK_WATCHLIST = [
  { id: "ioc-1", value: "185.15.247.140", type: "ipv4", severity: "critical", score: 98, last_seen: new Date().toISOString(), tags: ["c2-server", "apt29"], is_watched: true },
  { id: "ioc-3", value: "http://example.com/payload.exe", type: "url", severity: "high", score: 79, last_seen: new Date().toISOString(), tags: ["malware"], is_watched: true },
];

export default function WatchlistPage() {
  const [data, setData] = useState(MOCK_WATCHLIST);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function init() {
      try {
        const res = await fetchApi("/api/workspace/watchlist");
        if (res && res.items) setData(res.items);
      } catch {
        // Fallback
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleExportCSV = () => {
    const headers = ["Indicator", "Type", "Severity", "Tags", "Observed Date"];
    const rows = data.map(item => [
      item.value, 
      item.type, 
      item.severity, 
      (item.tags || []).join("; "), 
      new Date(item.last_seen).toLocaleDateString()
    ]);
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `threatlens-watchlist-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const link = document.createElement("a");
    link.href = dataStr;
    link.download = `threatlens-watchlist-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
  };

  const removeFromWatchlist = async (e: React.MouseEvent, iocId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetchApi(`/api/workspace/watchlist/${iocId}`, { method: 'DELETE' });
      setData(data.filter(item => item.id !== iocId));
    } catch {
      setData(data.filter(item => item.id !== iocId));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center"><Bookmark className="w-8 h-8 mr-3 text-primary" fill="currentColor" /> Analyst Watchlist</h1>
          <p className="text-muted-foreground mt-1">Personal indicators actively monitored.</p>
        </div>
        
        <DropdownMenu>
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-expect-error type missing */}
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" /> Export
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicator</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Workspace Tags</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    Your watchlist is empty. Bookmark IOCs from their detail pages.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((ioc) => (
                  <TableRow key={ioc.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <Link href={`/iocs/${ioc.id}`} className="font-mono text-sm font-medium text-primary hover:underline flex items-center w-full h-full">
                         {ioc.value}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px] tracking-wider">{ioc.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ioc.severity === 'critical' ? 'destructive' : 'secondary'} className="capitalize">
                        {ioc.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(ioc.tags || []).slice(0, 3).map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="px-1.5 text-[10px]">{tag}</Badge>
                        ))}
                        {(ioc.tags || []).length > 3 && <Badge variant="secondary" className="px-1.5 text-[10px]">+{ioc.tags.length - 3}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => removeFromWatchlist(e, ioc.id)}>
                          <BookmarkMinus className="w-4 h-4" />
                       </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
