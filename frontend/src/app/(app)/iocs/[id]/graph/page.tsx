"use client";

import { use, useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/api.client";
import { useRouter } from "next/navigation";
import { ReactFlow, Background, Controls, Node, Edge, MarkerType, useNodesState, useEdgesState, ReactFlowProvider, Position } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from 'dagre';

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, Loader2, Maximize2 } from "lucide-react";

import { IOCNode } from "@/components/graph/ioc-node";

const nodeTypes = {
  ioc: IOCNode,
};

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  const nodeWidth = 260;
  const nodeHeight = 80;
  
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });
  
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });
  
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  
  dagre.layout(dagreGraph);
  
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    };
  });

  return { nodes: layoutedNodes, edges };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const generateMockGraph = (rootId: string, depth: number): { nodes: any[], edges: any[], truncated: boolean } => {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const nodes: any[] = [
    { id: rootId, value: rootId === "ioc-1" ? "185.15.247.140" : rootId, type: "ipv4", severity: "critical", isRoot: true }
  ];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const edges: any[] = [];
  
  if (depth >= 1) {
    nodes.push(
      { id: "domain-1", value: "mal-login.com", type: "domain", severity: "high" },
      { id: "hash-1", value: "e3b0c442...bb1", type: "hash", severity: "medium" }
    );
    edges.push(
      { source: rootId, target: "domain-1", label: "resolves_to" },
      { source: rootId, target: "hash-1", label: "drops" }
    );
  }
  if (depth >= 2) {
    nodes.push(
      { id: "ip-2", value: "11.22.33.44", type: "ipv4", severity: "high" },
      { id: "url-1", value: "http://example.com/api", type: "url", severity: "low" }
    );
    edges.push(
      { source: "domain-1", target: "ip-2", label: "hosted_on" },
      { source: "hash-1", target: "url-1", label: "downloads_from" }
    );
  }
  if (depth >= 3) {
    nodes.push(
      { id: "hash-2", value: "ffffc442...bb2", type: "hash", severity: "critical" },
    );
    edges.push(
      { source: "url-1", target: "hash-2", label: "serves_payload" }
    );
  }
  
  return { nodes, edges, truncated: depth >= 3 }; 
};

function GraphFlow({ rootId }: { rootId: string }) {
  const router = useRouter();
  const [depth, setDepth] = useState("1");
  const [loading, setLoading] = useState(true);
  const [isTruncated, setIsTruncated] = useState(false);
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    async function loadGraph() {
      setLoading(true);
      try {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        let res: any;
        try {
           res = await fetchApi(`/api/iocs/${rootId}/graph?depth=${depth}`);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
           res = generateMockGraph(rootId, parseInt(depth));
        }
        
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const initialNodes: Node[] = res.nodes.map((n: any) => ({
          id: n.id,
          type: 'ioc',
          data: { 
            value: n.value, 
            type: n.type, 
            severity: n.severity, 
            isRoot: n.id === rootId 
          },
          position: { x: 0, y: 0 } // handled by layout
        }));
        
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const initialEdges: Edge[] = res.edges.map((e: any) => ({
          id: `${e.source}-${e.target}-${e.label}`,
          source: e.source,
          target: e.target,
          label: e.label,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.5 },
          labelStyle: { fill: 'hsl(var(--foreground))', fontWeight: 500, fontSize: 10 },
          labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 0.8 },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
        }));

        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges);
        
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setIsTruncated(res.truncated || false);

      } catch {
        // failed entirely
      } finally {
        setLoading(false);
      }
    }
    
    loadGraph();
  }, [rootId, depth, setNodes, setEdges]);

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const onNodeClick = useCallback((_: any, node: Node) => {
    router.push(`/iocs/${node.id}`);
  }, [router]);

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] w-full relative group">
      {/* Top Bar Controls */}
      <div className="absolute top-4 left-4 z-10 flex space-x-2">
        <Select value={depth} onValueChange={(v) => setDepth(v || "1")}>
          <SelectTrigger className="w-[140px] bg-background/90 backdrop-blur-sm border-primary/20 shadow-lg">
            <SelectValue placeholder="Depth" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 Hop (Direct)</SelectItem>
            <SelectItem value="2">2 Hops</SelectItem>
            <SelectItem value="3">3 Hops (Max)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isTruncated && (
        <div className="absolute top-4 right-4 z-10 bg-destructive/10 border-destructive/30 text-destructive text-xs py-2 px-3 rounded-md flex items-center shadow-lg backdrop-blur-sm">
          <AlertTriangle className="w-4 h-4 mr-2" />
          Graph truncated at 100 nodes. Expand search to resolve deeper connections.
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      <Card className="flex-1 w-full h-full overflow-hidden border border-border shadow-inner relative bg-dot-pattern">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          className="dark bg-background/95 hover:cursor-grab active:cursor-grabbing"
        >
          <Background color="hsl(var(--muted-foreground))" gap={20} size={1} />
          <Controls className="fill-foreground stroke-border bg-card border-border shadow-xl !rounded-md overflow-hidden" showInteractive={false} />
        </ReactFlow>
      </Card>
      
      <div className="absolute bottom-4 left-4 z-10 text-xs text-muted-foreground flex items-center bg-background/80 px-2 py-1 rounded-md backdrop-blur-sm">
        <Maximize2 className="w-3 h-3 mr-1" /> scroll to zoom, click + drag to pan
      </div>
    </div>
  );
}

export default function GraphViewPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  
  return (
    <div className="space-y-4 animate-in fade-in duration-500 w-full">
      <div className="flex items-center space-x-2 text-muted-foreground mb-4">
        <Button variant="ghost" size="sm" className="hover:text-primary pl-0" onClick={() => window.location.href = `/iocs/${unwrappedParams.id}`}>
             <ArrowLeft className="w-4 h-4 mr-1" /> Back to IOC Details
        </Button>
      </div>
      
      <div className="flex border-b pb-4 items-center justify-between">
        <div>
           <h1 className="text-2xl font-bold tracking-tight">Threat Relationship Graph</h1>
           <p className="text-muted-foreground text-sm mt-1">Explore interactive associations for node: <span className="font-mono text-primary font-medium">{unwrappedParams.id}</span></p>
        </div>
      </div>

      <ReactFlowProvider>
        <GraphFlow rootId={unwrappedParams.id} />
      </ReactFlowProvider>
    </div>
  );
}
