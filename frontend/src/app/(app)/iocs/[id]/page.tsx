"use client";

import { useEffect, useState, use } from "react";
import { fetchApi } from "@/lib/api.client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Network, ShieldAlert, Tag, MessageSquare, CheckCircle2, Clock, X, Edit, Trash, Save, Bookmark, BookmarkCheck } from "lucide-react";
import { useRouter } from "next/navigation";

const MOCK_DETAIL = {
  id: "ioc-1",
  value: "185.15.247.140",
  type: "ipv4",
  severity: "critical",
  score: 98,
  first_seen: new Date(Date.now() - 30 * 86400000).toISOString(),
  last_seen: new Date().toISOString(),
  score_breakdown: {
    base_confidence: 85,
    source_count_multiplier: 1.1,
    recency_factor: 1.05,
  },
  observations: [
    { id: 1, feed: "AbuseIPDB", date: new Date().toISOString(), confidence: 100, raw: { isp: "DigitalOcean" } },
    { id: 2, feed: "AlienVault OTX", date: new Date(Date.now() - 86400000).toISOString(), confidence: 90, raw: { tags: ["malware"] } },
  ],
  analyst_tags: ["c2-server", "apt29"],
  analyst_notes: [
    { id: 1, text: "Observed communicating with compromised internal host.", date: new Date().toISOString() }
  ],
  is_watched: false
};

const PREDEFINED_TAGS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "false-positive", label: "False Positive" },
  { value: "watching", label: "Watching" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" }
];

export default function IOCDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [data, setData] = useState<any>(MOCK_DETAIL);
  const [loading, setLoading] = useState(true);
  
  const [newTag, setNewTag] = useState("");
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetchApi(`/api/iocs/${unwrappedParams.id}`);
        if (res) setData(res);
      } catch {
        // Fallback to mock
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [unwrappedParams.id]);

  const toggleWatchlist = async () => {
    const nextState = !data.is_watched;
    try {
      if (nextState) {
        await fetchApi(`/api/workspace/watchlist`, { method: 'POST', body: JSON.stringify({ ioc_id: unwrappedParams.id }) });
      } else {
        await fetchApi(`/api/workspace/watchlist/${unwrappedParams.id}`, { method: 'DELETE' });
      }
      setData({ ...data, is_watched: nextState });
    } catch {
      setData({ ...data, is_watched: nextState });
    }
  };

  const handleAddTag = async (tagStr: string) => {
    if (!tagStr) return;
    try {
      await fetchApi(`/api/iocs/${unwrappedParams.id}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tag: tagStr })
      });
      if (!data.analyst_tags.includes(tagStr)) {
        setData({...data, analyst_tags: [...data.analyst_tags, tagStr]});
      }
    } catch {
      if (!data.analyst_tags.includes(tagStr)) {
        setData({...data, analyst_tags: [...data.analyst_tags, tagStr]});
      }
    }
  };

  const handleRemoveTag = async (tagStr: string) => {
    try {
      await fetchApi(`/api/iocs/${unwrappedParams.id}/tags/${tagStr}`, { method: 'DELETE' });
      setData({...data, analyst_tags: data.analyst_tags.filter((t: string) => t !== tagStr)});
    } catch {
      setData({...data, analyst_tags: data.analyst_tags.filter((t: string) => t !== tagStr)});
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote) return;
    const noteObj = { id: Date.now(), text: newNote, date: new Date().toISOString() };
    try {
      await fetchApi(`/api/iocs/${unwrappedParams.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ text: newNote })
      });
      setData({...data, analyst_notes: [...data.analyst_notes, noteObj]});
    } catch {
      setData({...data, analyst_notes: [...data.analyst_notes, noteObj]});
    }
    setNewNote("");
  };

  const handleUpdateNote = async (id: number) => {
    if (!editNoteText) return;
    try {
      await fetchApi(`/api/iocs/${unwrappedParams.id}/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ text: editNoteText })
      });
      setData({
        ...data, 
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        analyst_notes: data.analyst_notes.map((n: any) => n.id === id ? { ...n, text: editNoteText } : n)
      });
    } catch {
      setData({
        ...data, 
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        analyst_notes: data.analyst_notes.map((n: any) => n.id === id ? { ...n, text: editNoteText } : n)
      });
    }
    setEditingNoteId(null);
  };

  const handleDeleteNote = async (id: number) => {
    try {
      await fetchApi(`/api/iocs/${unwrappedParams.id}/notes/${id}`, { method: 'DELETE' });
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      setData({...data, analyst_notes: data.analyst_notes.filter((n: any) => n.id !== id)});
    } catch {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      setData({...data, analyst_notes: data.analyst_notes.filter((n: any) => n.id !== id)});
    }
  };

  if (loading) return <div className="animate-pulse h-96 bg-card rounded-xl"></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-muted-foreground mb-2">
            <button onClick={() => router.back()} className="hover:text-primary transition-colors flex items-center pr-2">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </button>
          </div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold font-mono tracking-tight text-primary break-all">{data.value}</h1>
            <Badge variant="outline" className="uppercase">{data.type}</Badge>
          </div>
          <div className="flex items-center space-x-4 mt-3 text-sm text-muted-foreground">
            <div className="flex items-center"><Clock className="w-4 h-4 mr-1" /> First seen: {new Date(data.first_seen).toLocaleDateString()}</div>
            <div className="flex items-center"><Clock className="w-4 h-4 mr-1" /> Last seen: {new Date(data.last_seen).toLocaleDateString()}</div>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="text-right mr-2 hidden sm:block">
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Severity</div>
            <div className="flex items-center justify-end space-x-2">
              <span className={`text-3xl font-bold ${data.severity === 'critical' ? 'text-destructive' : 'text-primary'}`}>{data.score}</span>
              <Badge variant={data.severity === 'critical' ? 'destructive' : 'secondary'} className="capitalize">
                {data.severity}
              </Badge>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant={data.is_watched ? "secondary" : "outline"} size="lg" className="h-14 font-medium" onClick={toggleWatchlist}>
              {data.is_watched ? <BookmarkCheck className="w-5 h-5 mr-2 text-primary" /> : <Bookmark className="w-5 h-5 mr-2" />}
              {data.is_watched ? "Watched" : "Watch"}
            </Button>
            <Button size="lg" className="h-14" onClick={() => window.location.href = `/iocs/${unwrappedParams.id}/graph`}>
                <Network className="w-5 h-5 mr-2" />
                Graph
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Details & Breakdown */}
        <div className="space-y-6 lg:col-span-2">
          
          <Card>
            <CardHeader className="bg-muted/30 border-b">
              <CardTitle className="text-lg flex items-center"><ShieldAlert className="w-5 h-5 mr-2 text-primary" /> Multi-Source Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Base Feed Confidence</div>
                  <div className="text-2xl font-semibold">{data.score_breakdown.base_confidence}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Source Multiplier</div>
                  <div className="text-2xl font-semibold flex items-center">
                    x {data.score_breakdown.source_count_multiplier}
                    <span className="text-xs ml-2 text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">{data.observations.length} feeds</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Recency Factor</div>
                  <div className="text-2xl font-semibold flex items-center">
                    x {data.score_breakdown.recency_factor}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center"><CheckCircle2 className="w-5 h-5 mr-2 text-primary" /> Feed Observations ({data.observations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Date Observed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {data.observations.map((obs: any) => (
                    <TableRow key={obs.id}>
                      <TableCell className="font-medium">{obs.feed}</TableCell>
                      <TableCell>{obs.confidence}%</TableCell>
                      <TableCell>{new Date(obs.date).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

        </div>

        {/* Right Column: Analyst Workspace */}
        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5 shadow-md">
            <CardHeader className="pb-3 bg-card border-b border-primary/10 rounded-t-xl">
              <CardTitle className="text-lg flex items-center"><Tag className="w-4 h-4 mr-2" /> Analyst Tags</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {data.analyst_tags.length === 0 ? <span className="text-xs text-muted-foreground italic">No tags added.</span> : null}
                {data.analyst_tags.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="px-2 py-1 flex items-center shadow-sm">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="ml-1.5 text-muted-foreground hover:text-foreground outline-none">
                      <X className="w-3 h-3 hover:text-destructive transition-colors" />
                    </button>
                  </Badge>
                ))}
              </div>
              
              <div className="space-y-2 pt-2 border-t border-primary/10">
                <Select onValueChange={(v) => handleAddTag(v as string)}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder="Add predefined tag..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PREDEFINED_TAGS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <form onSubmit={(e) => { e.preventDefault(); handleAddTag(newTag); setNewTag(""); }} className="flex space-x-2">
                  <Input size={1} value={newTag} onChange={e=>setNewTag(e.target.value)} placeholder="Custom tag..." className="bg-background" />
                  <Button type="submit" variant="secondary" size="sm">Add</Button>
                </form>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5 shadow-md">
            <CardHeader className="pb-3 bg-card border-b border-primary/10 rounded-t-xl">
              <CardTitle className="text-lg flex items-center"><MessageSquare className="w-4 h-4 mr-2" /> Analyst Notes</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {data.analyst_notes.length === 0 ? <span className="text-xs text-muted-foreground italic">No notes added.</span> : null}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {data.analyst_notes.map((note: any) => (
                  <div key={note.id} className="bg-background border rounded-lg p-3 text-sm shadow-sm group">
                    {editingNoteId === note.id ? (
                      <div className="space-y-2">
                         <Input value={editNoteText} onChange={(e) => setEditNoteText(e.target.value)} autoFocus className="h-8 text-sm" />
                         <div className="flex space-x-2 justify-end">
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-green-500 hover:bg-green-500/10" onClick={() => handleUpdateNote(note.id)}>
                               <Save className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingNoteId(null)}>
                               <X className="w-3.5 h-3.5" />
                            </Button>
                         </div>
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap leading-relaxed">{note.text}</p>
                        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                          <span>{new Date(note.date).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</span>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1">
                            <button onClick={() => { setEditingNoteId(note.id); setEditNoteText(note.text); }} className="hover:text-primary"><Edit className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDeleteNote(note.id)} className="hover:text-destructive"><Trash className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddNote} className="space-y-2 pt-2 border-t border-primary/10">
                <Label htmlFor="note" className="text-xs text-muted-foreground">Add New Note</Label>
                <div className="flex flex-col space-y-2">
                  <Input id="note" value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Type your analysis here..." className="bg-background" autoComplete="off" />
                  <Button type="submit" variant="default" size="sm" className="w-full">Save Note</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
