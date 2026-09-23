"use client";

import {
  CheckCircle,
  Flag,
  FloppyDisk,
  GitFork,
  LockSimple,
  PencilSimple,
  Plus,
  RocketLaunch,
  SlidersHorizontal,
  Trash,
  TreeStructure,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addEdge,
  Background,
  Controls,
  type Connection,
  type Edge,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect, useState } from "react";
import "@xyflow/react/dist/style.css";
import { api } from "@/lib/api";
import type { Department, WorkflowEdge, WorkflowNode } from "@/lib/types";

interface WorkflowSummary {
  id: string;
  key: string;
  name: string;
  versions: Array<{
    id: string;
    version: number;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  }>;
}

interface WorkflowVersion {
  id: string;
  version: number;
  status: string;
  workflow: { id: string; name: string };
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface BuilderData extends Record<string, unknown> {
  key: string;
  label: string;
  nodeType: "start" | "field" | "decision" | "end";
  fieldType: string | null;
  departmentKey: string | null;
  required: boolean;
  configuration: Record<string, unknown>;
}

function layoutVertically(nodes: Node<BuilderData>[], edges: Edge[]): Node<BuilderData>[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
  }
  const depth = new Map<string, number>();
  const queue = nodes
    .filter((node) => node.data.nodeType === "start")
    .map((node) => node.id);
  if (!queue.length && nodes[0]) queue.push(nodes[0].id);
  for (const id of queue) depth.set(id, 0);
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head]!;
    for (const target of adjacency.get(id) ?? []) {
      if (!depth.has(target)) {
        depth.set(target, depth.get(id)! + 1);
        queue.push(target);
      }
    }
  }
  let orphanDepth = (depth.size ? Math.max(...depth.values()) : -1) + 1;
  const columnByDepth = new Map<number, number>();
  return nodes.map((node) => {
    const level = depth.get(node.id) ?? orphanDepth++;
    const column = columnByDepth.get(level) ?? 0;
    columnByDepth.set(level, column + 1);
    return { ...node, position: { x: column * 280, y: level * 130 } };
  });
}

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const [versionId, setVersionId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<BuilderData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api<WorkflowSummary[]>("/workflows"),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Department[]>("/departments"),
  });
  const version = useQuery({
    queryKey: ["workflow-version", versionId],
    queryFn: () => api<WorkflowVersion>(`/workflows/versions/${versionId}`),
    enabled: Boolean(versionId),
  });

  useEffect(() => {
    if (!version.data) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const loadedNodes = version.data.nodes.map((node) => ({
      id: node.id,
      position: { x: node.positionX, y: node.positionY },
      data: {
        key: node.key,
        label: node.label,
        nodeType: node.type.toLowerCase() as BuilderData["nodeType"],
        fieldType: node.fieldType?.toLowerCase() ?? null,
        departmentKey: node.department?.key ?? null,
        required: node.isRequired,
        configuration: node.configuration,
      },
      type: "default",
    }));
    const loadedEdges = version.data.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      label: edge.label ?? (edge.type === "FORWARD" ? undefined : edge.type),
      data: { edgeType: edge.type.toLowerCase(), condition: edge.condition },
    }));
    const isFlat =
      loadedNodes.length > 1 &&
      new Set(loadedNodes.map((node) => node.position.y)).size === 1;
    setNodes(isFlat ? layoutVertically(loadedNodes, loadedEdges) : loadedNodes);
    setEdges(loadedEdges);
  }, [setEdges, setNodes, version.data]);

  const isDraft = version.data?.status === "DRAFT";
  const handleNodesChange: typeof onNodesChange = (changes) => {
    if (changes.some((change) => ["add", "position", "remove"].includes(change.type))) {
      setDirty(true);
    }
    onNodesChange(changes);
  };
  const handleEdgesChange: typeof onEdgesChange = (changes) => {
    if (changes.some((change) => ["add", "remove"].includes(change.type))) {
      setDirty(true);
    }
    onEdgesChange(changes);
  };
  const updateNodes: typeof setNodes = (updater) => {
    setDirty(true);
    setNodes(updater);
  };
  const updateEdges: typeof setEdges = (updater) => {
    setDirty(true);
    setEdges(updater);
  };

  const createDraft = useMutation({
    mutationFn: (workflowId: string) =>
      api<WorkflowVersion>(`/workflows/${workflowId}/drafts`, { method: "POST" }),
    onSuccess: async (draft) => {
      setVersionId(draft.id);
      setDirty(false);
      setSavedAt(0);
      setSelectedNodeId("");
      setSelectedEdgeId("");
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
  const save = useMutation({
    mutationFn: () => {
      const keyById = new Map(nodes.map((node) => [node.id, node.data.key]));
      return api(`/workflows/versions/${versionId}`, {
        method: "PUT",
        body: JSON.stringify({
          nodes: nodes.map((node) => ({
            key: node.data.key,
            label: node.data.label,
            type: node.data.nodeType,
            fieldType: node.data.fieldType,
            departmentKey: node.data.departmentKey,
            required: node.data.required,
            positionX: node.position.x,
            positionY: node.position.y,
            configuration: node.data.configuration,
          })),
          edges: edges.map((edge) => ({
            sourceKey: keyById.get(edge.source) ?? edge.source,
            targetKey: keyById.get(edge.target) ?? edge.target,
            type: String(edge.data?.edgeType ?? "forward"),
            label: typeof edge.label === "string" ? edge.label : null,
            condition: edge.data?.condition ?? null,
          })),
        }),
      });
    },
    onSuccess: async () => {
      setDirty(false);
      setSavedAt(Date.now());
      setSelectedNodeId("");
      setSelectedEdgeId("");
      await queryClient.invalidateQueries({ queryKey: ["workflow-version", versionId] });
    },
  });
  const publish = useMutation({
    mutationFn: () => api(`/workflows/versions/${versionId}/publish`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      await queryClient.invalidateQueries({ queryKey: ["workflow-version", versionId] });
    },
  });
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const addNode = (nodeType: BuilderData["nodeType"]) => {
    const id = crypto.randomUUID();
    updateNodes((items) => [
      ...items,
      {
        id,
        position: { x: 100 + items.length * 40, y: 120 + items.length * 20 },
        data: {
          key: `node_${id.replaceAll("-", "")}`,
          label: nodeType === "field" ? "New field" : `New ${nodeType}`,
          nodeType,
          fieldType: nodeType === "field" ? "text" : null,
          departmentKey: null,
          required: false,
          configuration: {},
        },
      },
    ]);
    setSelectedNodeId(id);
    setSelectedEdgeId("");
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Versioned process configuration</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary-strong">Workflow builder</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-11 rounded-xl border border-border bg-white px-3"
            onChange={(event) => {
              setVersionId(event.target.value);
              setDirty(false);
              setSavedAt(0);
              setSelectedNodeId("");
              setSelectedEdgeId("");
            }}
            value={versionId}
          >
            <option value="">Select version</option>
            {workflows.data?.flatMap((workflow) =>
              workflow.versions.map((item) => (
                <option key={item.id} value={item.id}>
                  {workflow.name} · v{item.version} · {item.status}
                </option>
              )),
            )}
          </select>
          {workflows.data?.map((workflow) => (
            <button
              className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-4 text-sm font-semibold transition hover:bg-background"
              key={workflow.id}
              onClick={() => createDraft.mutate(workflow.id)}
              type="button"
            >
              <PencilSimple size={15} />
              Edit {workflow.name}
            </button>
          ))}
          <button className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-sm font-semibold transition enabled:hover:bg-background disabled:opacity-50" disabled={!isDraft} onClick={() => addNode("field")} type="button"><Plus size={15} />Add field</button>
          <button className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-sm font-semibold transition enabled:hover:bg-background disabled:opacity-50" disabled={!isDraft} onClick={() => addNode("decision")} type="button"><GitFork size={15} />Add decision</button>
          <button className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-sm font-semibold transition enabled:hover:bg-background disabled:opacity-50" disabled={!isDraft} onClick={() => addNode("end")} type="button"><Flag size={15} />Add end</button>
          <button
            className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold disabled:opacity-50"
            disabled={!isDraft}
            onClick={() => updateNodes((items) => layoutVertically(items, edges))}
            type="button"
          >
            <TreeStructure size={16} />
            Auto arrange
          </button>
          {isDraft && dirty ? (
            <span className="flex items-center gap-1 self-center text-xs font-semibold text-amber-600">
              <WarningCircle size={14} />
              Unsaved changes
            </span>
          ) : null}
          {isDraft && !dirty && savedAt ? (
            <span className="flex items-center gap-1 self-center text-xs font-semibold text-emerald-700">
              <CheckCircle size={14} />
              All changes saved
            </span>
          ) : null}
          <button className="flex items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition enabled:hover:bg-primary-strong disabled:opacity-50" disabled={!isDraft} onClick={() => save.mutate()} type="button"><FloppyDisk size={15} />Save draft</button>
          <button className="flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-primary-strong transition enabled:hover:opacity-90 disabled:opacity-50" disabled={!isDraft} onClick={() => publish.mutate()} type="button"><RocketLaunch size={15} />Publish</button>
        </div>
      </div>

      {version.data && !isDraft ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="flex items-center gap-2">
            <LockSimple className="shrink-0" size={15} />
            This version is {version.data.status.toLowerCase()} and read-only. Create a draft to make changes.
          </span>
          <button
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={createDraft.isPending}
            onClick={() => createDraft.mutate(version.data.workflow.id)}
            type="button"
          >
            <PencilSimple size={13} />
            Create editable draft
          </button>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_300px]">
        <section className="h-[720px] overflow-hidden rounded-2xl border border-border bg-white">
          <ReactFlow
            deleteKeyCode={isDraft ? "Backspace" : null}
            edges={edges}
            fitView
            nodes={nodes}
            nodesConnectable={Boolean(isDraft)}
            nodesDraggable={Boolean(isDraft)}
            onConnect={(connection: Connection) => {
              if (!isDraft) return;
              updateEdges((items) =>
                addEdge(
                  {
                    ...connection,
                    id: crypto.randomUUID(),
                    data: { edgeType: "forward", condition: null },
                  },
                  items,
                ),
              );
            }}
            onEdgeClick={(_event, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId("");
            }}
            onEdgesChange={handleEdgesChange}
            onNodeClick={(_event, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId("");
            }}
            onNodesChange={handleNodesChange}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </section>
        <aside className="rounded-2xl border border-border bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold text-primary-strong">
            <SlidersHorizontal size={18} className="text-primary" />
            Selection inspector
          </h2>
          {selectedNode ? (
            <fieldset className="contents" disabled={!isDraft}>
              <div className="mt-5 grid gap-4 text-sm">
                <label className="grid gap-2 font-medium">Label<input className="h-10 rounded-lg border border-border px-3" value={selectedNode.data.label} onChange={(event) => updateNodes((items) => items.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, label: event.target.value } } : node))} /></label>
                <label className="grid gap-2 font-medium">Department<select className="h-10 rounded-lg border border-border px-3" value={selectedNode.data.departmentKey ?? ""} onChange={(event) => updateNodes((items) => items.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, departmentKey: event.target.value || null } } : node))}><option value="">System</option>{departments.data?.map((department) => <option key={department.id} value={department.key}>{department.name}</option>)}</select></label>
                <label className="grid gap-2 font-medium">Field type<select className="h-10 rounded-lg border border-border px-3" value={selectedNode.data.fieldType ?? ""} onChange={(event) => updateNodes((items) => items.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, fieldType: event.target.value || null } } : node))}><option value="">None</option>{["text", "date", "datetime", "decimal", "integer", "enum", "json", "remarks"].map((type) => <option key={type}>{type}</option>)}</select></label>
                {selectedNode.data.nodeType !== "start" ? (
                  <button className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700 transition hover:bg-red-50" onClick={() => { updateNodes((items) => items.filter((node) => node.id !== selectedNode.id)); updateEdges((items) => items.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)); setSelectedNodeId(""); }} type="button"><Trash size={14} />Delete node</button>
                ) : null}
              </div>
            </fieldset>
          ) : selectedEdge ? (
            <fieldset className="contents" disabled={!isDraft}>
              <div className="mt-5 grid gap-4 text-sm">
                <label className="grid gap-2 font-medium">Transition type<select className="h-10 rounded-lg border border-border px-3" value={String(selectedEdge.data?.edgeType ?? "forward")} onChange={(event) => updateEdges((items) => items.map((edge) => edge.id === selectedEdge.id ? { ...edge, label: event.target.value.toUpperCase(), data: { ...edge.data, edgeType: event.target.value } } : edge))}>{["forward", "return", "branch", "exception"].map((type) => <option key={type}>{type}</option>)}</select></label>
                <label className="grid gap-2 font-medium">Condition JSON<textarea className="min-h-24 rounded-lg border border-border p-3 font-mono text-xs" defaultValue={selectedEdge.data?.condition ? JSON.stringify(selectedEdge.data.condition, null, 2) : ""} key={selectedEdge.id} onBlur={(event) => { try { const condition = event.currentTarget.value.trim() ? JSON.parse(event.currentTarget.value) as Record<string, unknown> : null; updateEdges((items) => items.map((edge) => edge.id === selectedEdge.id ? { ...edge, data: { ...edge.data, condition } } : edge)); event.currentTarget.setCustomValidity(""); } catch { event.currentTarget.setCustomValidity("Condition must be valid JSON"); event.currentTarget.reportValidity(); } }} /></label>
                <button className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700 transition hover:bg-red-50" onClick={() => { updateEdges((items) => items.filter((edge) => edge.id !== selectedEdge.id)); setSelectedEdgeId(""); }} type="button"><Trash size={14} />Delete transition</button>
              </div>
            </fieldset>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted">Select a node or transition to configure it. Drag nodes to arrange the map and connect handles to add transitions.</p>
          )}
          {(save.error || publish.error) ? <p className="mt-5 text-sm text-red-700">{(save.error ?? publish.error)?.message}</p> : null}
        </aside>
      </div>
    </div>
  );
}
