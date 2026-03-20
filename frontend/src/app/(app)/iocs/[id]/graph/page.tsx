"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/api.client";
import { useRouter } from "next/navigation";
import {
  ReactFlow, Background, Controls, Node, Edge,
  MarkerType, useNodesState, useEdgesState,
  ReactFlowProvider, Position, BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";

import { IOCNode } from "@/components/graph/ioc-node";
import { AlertTriangle, ArrowLeft, Loader2, Maximize2, Network } from "lucide-react";

const nodeTypes = { ioc: IOCNode };

/* ─── Layout engine ─────────────────────────────────────────────────────── */
function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });
  const nw = 260, nh = 80;
  nodes.forEach((n) => g.setNode(n.id, { width: nw, height: nh }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      return { ...n, position: { x: pos.x - nw / 2, y: pos.y - nh / 2 }, targetPosition: Position.Left, sourcePosition: Position.Right };
    }),
    edges,
  };
}

/* ─── Graph canvas ──────────────────────────────────────────────────────── */
function GraphCanvas({ rootId }: { rootId: string }) {
  const router = useRouter();
  const [depth, setDepth] = useState("1");
  const [loading, setLoading] = useState(true);
  const [isTruncated, setIsTruncated] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const [isEmpty, setIsEmpty] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    async function loadGraph() {
      setLoading(true);
      try {
        const res = await fetchApi(`/api/iocs/${rootId}/graph?depth=${depth}`);

        if (!res.nodes || res.nodes.length === 0) {
          setIsEmpty(true);
          setNodes([]);
          setEdges([]);
          return;
        }

        setIsEmpty(false);
        setNodeCount(res.nodes.length);

        const initialNodes: Node[] = res.nodes.map((n: { id: string; value: string; type: string; severity: number }) => ({
          id: String(n.id),
          type: "ioc",
          data: { value: n.value, type: n.type, severity: n.severity, isRoot: String(n.id) === rootId },
          position: { x: 0, y: 0 },
        }));

        const initialEdges: Edge[] = res.edges.map((e: { id: string; source: string; target: string; relationship: string; confidence: number | null }) => ({
          id: String(e.id),
          source: String(e.source),
          target: String(e.target),
          label: e.relationship,
          type: "smoothstep",
          animated: true,
          style: { stroke: "rgba(56,189,248,0.6)", strokeWidth: 1.5 },
          labelStyle: { fill: "#94a3b8", fontWeight: 500, fontSize: 9 },
          labelBgStyle: { fill: "var(--background)", fillOpacity: 0.9 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(56,189,248,0.6)" },
        }));

        const { nodes: ln, edges: le } = getLayoutedElements(initialNodes, initialEdges);
        setNodes(ln);
        setEdges(le);
        setIsTruncated(res.truncated ?? false);
      } catch {
        setIsEmpty(true);
      } finally {
        setLoading(false);
      }
    }
    loadGraph();
  }, [rootId, depth, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    router.push(`/iocs/${node.id}`);
  }, [router]);

  return (
    <div className="relative flex-1 w-full" style={{ height: "calc(100vh - 12rem)" }}>
      {/* Depth selector */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div
          className="flex items-center gap-0 rounded-lg border overflow-hidden text-xs"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          {[
            { v: "1", label: "1 Hop" },
            { v: "2", label: "2 Hops" },
            { v: "3", label: "3 Hops" },
          ].map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setDepth(v)}
              className="px-3 py-1.5 transition-colors"
              style={{
                background: depth === v ? "rgba(56,189,248,0.15)" : "transparent",
                color: depth === v ? "var(--primary)" : "var(--muted-foreground)",
                borderRight: v !== "3" ? `1px solid var(--border)` : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {nodeCount > 0 && (
          <div
            className="text-[10px] px-2 py-1 rounded"
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
          >
            {nodeCount} nodes
          </div>
        )}
      </div>

      {/* Truncated warning */}
      {isTruncated && (
        <div
          className="absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-2 rounded text-xs"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Graph truncated at 100 nodes
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: "rgba(7,13,24,0.6)", backdropFilter: "blur(4px)" }}
        >
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: "var(--primary)" }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && isEmpty && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
          style={{ color: "var(--muted-foreground)" }}
        >
          <Network className="w-12 h-12 opacity-20" />
          <div className="text-sm font-heading">No relationships found</div>
          <div className="text-xs">This IOC has no mapped connections in the database.</div>
        </div>
      )}

      {/* React Flow */}
      <div
        className="w-full h-full rounded-lg border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
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
          className="hover:cursor-grab active:cursor-grabbing"
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="rgba(56,189,248,0.07)"
            gap={20}
            size={1}
          />
          <Controls
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              overflow: "hidden",
            }}
            showInteractive={false}
          />
        </ReactFlow>
      </div>

      {/* Hint */}
      <div
        className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded"
        style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
      >
        <Maximize2 className="w-2.5 h-2.5" />
        Scroll to zoom · drag to pan · click node to open
      </div>
    </div>
  );
}

/* ─── Page wrapper ──────────────────────────────────────────────────────── */
// Next.js 14: params is a plain object (not a Promise)
export default function GraphViewPage({ params }: { params: { id: string } }) {
  const { id } = params;

  return (
    <div className="flex flex-col h-full space-y-4 animate-in fade-in duration-400">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: "var(--muted-foreground)" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hover:underline" style={{ color: "var(--primary)" }}>Back to IOC</span>
          </button>
        </div>
        <div>
          <h1 className="text-lg font-bold font-heading" style={{ color: "var(--foreground)" }}>
            Threat Relationship Graph
          </h1>
          <p className="text-[10px] text-right" style={{ color: "var(--muted-foreground)" }}>
            Root: <span className="font-mono" style={{ color: "var(--primary)" }}>{id}</span>
          </p>
        </div>
      </div>

      <ReactFlowProvider>
        <GraphCanvas rootId={id} />
      </ReactFlowProvider>
    </div>
  );
}
