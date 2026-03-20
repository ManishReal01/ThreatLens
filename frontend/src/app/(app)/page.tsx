"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, Activity, RefreshCw, ServerCrash, Bookmark } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { fetchApi } from "@/lib/api.client";
import { createClient } from "@/lib/supabase/client";

// Mock Data Fallbacks
const MOCK_FEEDS = [
  { id: 1, name: "AbuseIPDB", last_run: new Date().toISOString(), status: "success", iocs_added: 1245 },
  { id: 2, name: "URLhaus", last_run: new Date(Date.now() - 3600000).toISOString(), status: "success", iocs_added: 834 },
  { id: 3, name: "AlienVault OTX", last_run: new Date(Date.now() - 7200000).toISOString(), status: "error", iocs_added: 0 },
];

const MOCK_IOCS = [
  { id: "ioc-1", value: "185.15.247.140", type: "ipv4", severity: "critical", score: 98, last_seen: new Date().toISOString(), is_watched: true },
  { id: "ioc-2", value: "malicious-domain.com", type: "domain", severity: "high", score: 85, last_seen: new Date().toISOString() },
  { id: "ioc-3", value: "http://example.com/payload.exe", type: "url", severity: "high", score: 79, last_seen: new Date().toISOString(), is_watched: true },
  { id: "ioc-4", value: "88.214.26.43", type: "ipv4", severity: "medium", score: 65, last_seen: new Date().toISOString() },
  { id: "ioc-5", value: "e3b0c442...bb1", type: "hash", severity: "low", score: 30, last_seen: new Date().toISOString() },
];

const MOCK_TYPE_DATA = [
  { name: "IPv4", count: 4500 },
  { name: "Domain", count: 2100 },
  { name: "URL", count: 1800 },
  { name: "Hash", count: 850 },
];

const MOCK_SEVERITY_DATA = [
  { name: "Critical", count: 120, color: "var(--destructive)" },
  { name: "High", count: 850, color: "var(--chart-1)" },
  { name: "Medium", count: 3200, color: "var(--chart-2)" },
  { name: "Low", count: 4900, color: "var(--chart-3)" },
];

export default function DashboardPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // Data states
  const [feeds, setFeeds] = useState(MOCK_FEEDS);
  const [iocs, setIocs] = useState(MOCK_IOCS);
  
  useEffect(() => {
    async function init() {
      // Check admin status mock/actual
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // Example: simple check if admin based on email
      if (user?.email === "admin@threatlens.com") {
        setIsAdmin(true);
      }
      
      try {
        // Attempt to fetch real data
        const summary = await fetchApi("/api/dashboard/summary");
        if (summary) {
          setFeeds(summary.feeds || MOCK_FEEDS);
          setIocs(summary.recent_iocs || MOCK_IOCS);
        }
      } catch (error) {
        console.warn("Backend unavailable, using mock data.", error);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetchApi("/api/feeds/sync", { method: "POST" });
    } catch {
      // Ignore error for visual feedback in dev
    }
    setTimeout(() => setSyncing(false), 2000);
  };

  const formatShortDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  };

  if (loading) {
    return <div className="animate-pulse space-y-6">
      <div className="h-48 bg-card rounded-xl"></div>
      <div className="h-96 bg-card rounded-xl"></div>
    </div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Overview</h1>
          <p className="text-muted-foreground mt-1">Real-time telemetry and ingest pipeline status.</p>
        </div>
        {isAdmin && (
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Trigger Sync
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {feeds.map(feed => (
          <Card key={feed.id} className={`${feed.status === 'error' ? 'border-destructive/50 bg-destructive/5' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{feed.name}</CardTitle>
              {feed.status === 'success' ? (
                <Activity className="w-4 h-4 text-green-500" />
              ) : (
                <ServerCrash className="w-4 h-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {feed.status === 'success' ? `+${feed.iocs_added}` : 'Failed'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Last run: {formatShortDate(feed.last_run)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Threat Types Distribution</CardTitle>
            <CardDescription>Breakdown by IOC category</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_TYPE_DATA} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Severity Breakdown</CardTitle>
            <CardDescription>Current database index by threat lever</CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={MOCK_SEVERITY_DATA} innerRadius={80} outerRadius={110} paddingAngle={2} dataKey="count">
                  {MOCK_SEVERITY_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent High-Severity IOCs</CardTitle>
            <CardDescription>Critical threats ingested in the last 48 hours</CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="hidden sm:flex">
            View All <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardHeader>
        <CardContent>
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
              {iocs.map((ioc) => (
                <TableRow key={ioc.id} className={`cursor-pointer transition-colors ${ioc.is_watched ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'}`} onClick={() => window.location.href = `/iocs/${ioc.id}`}>
                  <TableCell className="font-mono text-sm font-medium flex items-center h-full">
                    {ioc.is_watched && <Bookmark className="w-3 h-3 mr-2 text-primary" fill="currentColor" />}
                    {ioc.value}
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
                    {formatShortDate(ioc.last_seen)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
