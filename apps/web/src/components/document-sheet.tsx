"use client";

import {
  ArrowRight,
  ArrowSquareOut,
  ArrowUUpLeft,
  LockSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Tray,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useSocket } from "@/components/realtime";
import { api, ApiError } from "@/lib/api";
import {
  buildColumns,
  cellValue,
  columnLetter,
  departmentColors,
  editableText,
  formatCell,
  groupByDepartment,
  mergeCellValue,
  parseCell,
  presenceColor,
  sameValue,
  type SheetColumn,
} from "@/lib/sheet";
import type { AuthContext, DocumentListItem, WorkflowEdge, WorkflowNode } from "@/lib/types";

interface WorkflowVersionPayload {
  id: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

type FieldValue = DocumentListItem["fieldValues"][number];

interface SheetRow {
  doc: DocumentListItem;
  values: Map<string, FieldValue>;
}

interface Viewer {
  socketId: string;
  userId: string;
  fullName: string;
  documentId: string | null;
  columnKey: string | null;
  seenAt: number;
}

interface Selection {
  row: number;
  col: number;
}

const FIXED = [
  { key: "fixed:reference", label: "REFERENCE NO.", width: 130 },
  { key: "fixed:title", label: "PROJECT TITLE", width: 260 },
  { key: "fixed:current", label: "CURRENT STEP", width: 190 },
] as const;
const FIXED_COUNT = FIXED.length;
const ROW_NUMBER_WIDTH = 46;
const DEFAULT_WIDTH = 140;
const HEADER = { letters: 22, band: 24, label: 64, step: 22 };
const HEADER_HEIGHT = HEADER.letters + HEADER.band + HEADER.label + HEADER.step;
const GRID_LINE = "#e2e3e3";
const HEADER_BG = "#f8f9fa";
const SELECT_BLUE = "#1a73e8";
const LOCKED_BG = "#f8f9fa";
const CURRENT_BG = "#fff7d6";
const WIDTHS_STORAGE_KEY = "sao.documentSheet.widths";
const EMPTY_VIEWERS = new Map<string, Viewer[]>();

function firstName(name: string) {
  return name.split(/\s+/)[0] ?? name;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function loadedVersions(results: Array<{ data?: WorkflowVersionPayload }>) {
  return results.flatMap((result) => (result.data ? [result.data] : []));
}

function cellKey(documentId: string, nodeId: string) {
  return `${documentId}:${nodeId}`;
}

function loadWidths(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(WIDTHS_STORAGE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function CellEditor({
  column,
  initial,
  typed,
  onCommit,
  onCancel,
}: {
  column: SheetColumn;
  initial: string;
  typed: boolean;
  onCommit: (raw: string, direction: "down" | "right" | "left" | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const done = useRef(false);
  const finish = (direction: "down" | "right" | "left" | null, raw = draft) => {
    if (done.current) return;
    done.current = true;
    onCommit(raw, direction);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finish("down");
    } else if (event.key === "Tab") {
      event.preventDefault();
      finish(event.shiftKey ? "left" : "right");
    } else if (event.key === "Escape") {
      event.preventDefault();
      done.current = true;
      onCancel();
    }
  };
  const className =
    "absolute inset-0 z-20 h-full w-full min-w-full bg-white px-1.5 text-[13px] text-[#202124] outline-none ring-2 ring-[#1a73e8]";

  if (column.type === "ENUM" && column.options) {
    return (
      <select
        autoFocus
        className={className}
        onBlur={() => finish(null)}
        onChange={(event) => {
          setDraft(event.target.value);
          finish(null, event.target.value);
        }}
        onKeyDown={onKeyDown}
        value={draft}
      >
        <option value="">—</option>
        {column.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  const useDatePicker = column.type === "DATE" && !typed;
  return (
    <input
      autoFocus
      className={className}
      inputMode={column.type === "DECIMAL" || column.type === "INTEGER" ? "decimal" : undefined}
      onBlur={() => finish(null)}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={column.type === "DATE" ? "MM/DD/YYYY" : undefined}
      type={useDatePicker ? "date" : "text"}
      value={draft}
    />
  );
}

interface RowProps {
  row: SheetRow;
  index: number;
  columns: SheetColumn[];
  canEditColumn: boolean[];
  resolveNodeId: (versionId: string, nodeKey: string) => string | undefined;
  selectedCol: number;
  editor: ReactNode;
  editorCol: number;
  flashes: Map<string, number>;
  pending: Set<string>;
  viewers: Map<string, Viewer[]>;
  stickyLeft: number[];
  detailLink: boolean;
  onCellMouseDown: (row: number, col: number) => void;
  onCellDoubleClick: (row: number, col: number) => void;
}

function Presence({ viewers }: { viewers: Viewer[] | undefined }) {
  const viewer = viewers?.[0];
  if (!viewer) return null;
  const color = presenceColor(viewer.userId);
  return (
    <>
      <div className="pointer-events-none absolute -inset-px z-[2] border-2" style={{ borderColor: color }} />
      <span
        className="pointer-events-none absolute -top-[15px] right-0 z-[3] whitespace-nowrap rounded-t px-1 text-[10px] font-medium leading-[15px] text-white"
        style={{ background: color }}
      >
        {firstName(viewer.fullName)}
        {viewers!.length > 1 ? ` +${viewers!.length - 1}` : ""}
      </span>
    </>
  );
}

const SheetRowView = memo(function SheetRowView({
  row,
  index,
  columns,
  canEditColumn,
  resolveNodeId,
  selectedCol,
  editor,
  editorCol,
  flashes,
  pending,
  viewers,
  stickyLeft,
  detailLink,
  onCellMouseDown,
  onCellDoubleClick,
}: RowProps) {
  const { doc, values } = row;
  const isSelectedRow = selectedCol >= 0;
  const baseCell = "relative h-6 overflow-visible border-b border-r px-1.5 align-middle";
  const selection = (col: number) =>
    selectedCol === col ? (
      <>
        <div className="pointer-events-none absolute -inset-px z-[4] border-2" style={{ borderColor: SELECT_BLUE }} />
        <div
          className="pointer-events-none absolute -bottom-[4px] -right-[4px] z-[5] size-[7px] border border-white"
          style={{ background: SELECT_BLUE }}
        />
      </>
    ) : null;
  const flash = (key: string) => {
    const token = flashes.get(key);
    return token ? <div className="cell-flash pointer-events-none absolute inset-0" key={token} /> : null;
  };
  const statusTone =
    doc.status === "RETURNED"
      ? "bg-amber-100 text-amber-900"
      : doc.status === "COMPLETED"
        ? "bg-emerald-100 text-emerald-900"
        : "bg-sky-100 text-sky-900";

  return (
    <tr>
      <th
        className="sticky left-0 z-[6] border-b border-r text-center text-[11px] font-normal"
        onMouseDown={() => onCellMouseDown(index, Math.max(selectedCol, 0))}
        scope="row"
        style={{
          borderColor: GRID_LINE,
          background: isSelectedRow ? "#d3e3fd" : HEADER_BG,
          color: isSelectedRow ? "#0b57d0" : "#5f6368",
          fontWeight: isSelectedRow ? 600 : 400,
        }}
      >
        {index + 1}
      </th>
      <td
        className={`${baseCell} sticky z-[5] bg-white font-semibold`}
        data-cell={`${index}-0`}
        onDoubleClick={() => onCellDoubleClick(index, 0)}
        onMouseDown={() => onCellMouseDown(index, 0)}
        style={{ left: stickyLeft[0], borderColor: GRID_LINE }}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-[#0b57d0]">{doc.referenceNumber}</span>
          {detailLink ? (
            <Link
              aria-label={`Open ${doc.referenceNumber}`}
              className="shrink-0 text-[#5f6368] hover:text-[#0b57d0]"
              href={`/documents/${doc.id}`}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <ArrowSquareOut size={13} />
            </Link>
          ) : null}
        </div>
        {selection(0)}
      </td>
      <td
        className={`${baseCell} sticky z-[5] bg-white`}
        data-cell={`${index}-1`}
        onDoubleClick={() => onCellDoubleClick(index, 1)}
        onMouseDown={() => onCellMouseDown(index, 1)}
        style={{ left: stickyLeft[1], borderColor: GRID_LINE, boxShadow: "2px 0 0 0 #c4c7c5" }}
        title={doc.title}
      >
        <div className="truncate">{doc.title}</div>
        {selection(1)}
      </td>
      <td
        className={baseCell}
        data-cell={`${index}-2`}
        onDoubleClick={() => onCellDoubleClick(index, 2)}
        onMouseDown={() => onCellMouseDown(index, 2)}
        style={{ borderColor: GRID_LINE }}
      >
        <div className="flex items-center gap-1.5">
          <span className={`shrink-0 rounded px-1 text-[10px] font-semibold ${statusTone}`}>{doc.status}</span>
          <span className="truncate">{doc.currentNode?.label ?? "—"}</span>
        </div>
        {flash(`${doc.id}:current`)}
        {selection(2)}
        <Presence viewers={viewers.get(FIXED[2].key)} />
      </td>
      {columns.map((column, offset) => {
        const col = offset + FIXED_COUNT;
        const nodeId = resolveNodeId(doc.workflowVersionId, column.nodeKey);
        const field = values.get(column.nodeKey);
        const text = formatCell(column, cellValue(column, field?.value));
        const isCurrent = doc.currentNode?.key === column.nodeKey;
        const editable = canEditColumn[offset] && nodeId !== undefined;
        const key = nodeId ? cellKey(doc.id, nodeId) : "";
        const numeric = column.type === "DECIMAL" || column.type === "INTEGER";
        return (
          <td
            className={`${baseCell} ${numeric ? "text-right" : ""}`}
            data-cell={`${index}-${col}`}
            key={column.key}
            onDoubleClick={() => onCellDoubleClick(index, col)}
            onMouseDown={() => onCellMouseDown(index, col)}
            style={{
              borderColor: GRID_LINE,
              background: !nodeId
                ? "repeating-linear-gradient(45deg,#f1f3f4,#f1f3f4 4px,#fff 4px,#fff 8px)"
                : isCurrent
                  ? CURRENT_BG
                  : editable
                    ? "#ffffff"
                    : LOCKED_BG,
              color: editable ? "#202124" : "#3c4043",
            }}
            title={text || undefined}
          >
            <div className={`truncate ${pending.has(key) ? "opacity-50" : ""}`}>{text}</div>
            {isCurrent ? (
              <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: "#f9ab00" }} />
            ) : null}
            {flash(key)}
            {editorCol === col ? editor : null}
            {selection(col)}
            <Presence viewers={viewers.get(column.key)} />
          </td>
        );
      })}
    </tr>
  );
});

export function DocumentSheet({ documentId }: { documentId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const socket = useSocket();
  const gridRef = useRef<HTMLDivElement>(null);
  const mineRef = useRef(new Map<string, number>());

  const auth = useQuery({ queryKey: ["auth"], queryFn: () => api<AuthContext>("/auth/me") });
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: () => api<DocumentListItem[]>("/documents"),
  });
  const published = useQuery({
    queryKey: ["workflow", "published"],
    queryFn: () => api<WorkflowVersionPayload>("/workflows/published"),
  });
  const otherVersionIds = useMemo(
    () =>
      [...new Set(documents.data?.map((doc) => doc.workflowVersionId))].filter(
        (id) => id !== published.data?.id,
      ),
    [documents.data, published.data?.id],
  );
  const otherVersions = useQueries({
    queries: otherVersionIds.map((id) => ({
      queryKey: ["workflow", "version", id],
      queryFn: () => api<WorkflowVersionPayload>(`/workflows/versions/${id}`),
      staleTime: Infinity,
    })),
    combine: loadedVersions,
  });

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selection>({ row: 0, col: FIXED_COUNT });
  const [editing, setEditing] = useState<{
    documentId: string;
    col: number;
    initial: string;
    typed: boolean;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "error" | "info" } | null>(null);
  const [flashes, setFlashes] = useState(new Map<string, number>());
  const [pending, setPending] = useState(new Set<string>());
  const [presence, setPresence] = useState(new Map<string, Viewer>());
  const [widths, setWidths] = useState<Record<string, number>>(loadWidths);
  const [showCreate, setShowCreate] = useState(false);

  const user = auth.data?.user;
  const columns = useMemo(() => buildColumns(published.data?.nodes ?? []), [published.data]);
  const groups = useMemo(() => groupByDepartment(columns), [columns]);

  const { nodeKeyById, nodeIdByVersionKey, nodeById, edgesByVersion } = useMemo(() => {
    const keyById = new Map<string, string>();
    const idByVersionKey = new Map<string, string>();
    const byId = new Map<string, WorkflowNode>();
    const edges = new Map<string, WorkflowEdge[]>();
    for (const version of [published.data, ...otherVersions]) {
      if (!version) continue;
      for (const node of version.nodes) {
        keyById.set(node.id, node.key);
        idByVersionKey.set(`${version.id}:${node.key}`, node.id);
        byId.set(node.id, node);
      }
      edges.set(version.id, version.edges ?? []);
    }
    return {
      nodeKeyById: keyById,
      nodeIdByVersionKey: idByVersionKey,
      nodeById: byId,
      edgesByVersion: edges,
    };
  }, [published.data, otherVersions]);
  const resolveNodeId = useCallback(
    (versionId: string, nodeKey: string) => nodeIdByVersionKey.get(`${versionId}:${nodeKey}`),
    [nodeIdByVersionKey],
  );

  const rows = useMemo<SheetRow[]>(() => {
    const term = search.trim().toLowerCase();
    return [...(documents.data ?? [])]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .filter(
        (doc) =>
          doc.id === documentId ||
          (!documentId &&
            (!term ||
              doc.referenceNumber.toLowerCase().includes(term) ||
              doc.title.toLowerCase().includes(term) ||
              doc.currentNode?.label.toLowerCase().includes(term))),
      )
      .map((doc) => ({
        doc,
        values: new Map(
          doc.fieldValues.flatMap((field) => {
            const key = nodeKeyById.get(field.nodeId);
            return key ? [[key, field] as const] : [];
          }),
        ),
      }));
  }, [documents.data, documentId, nodeKeyById, search]);

  const canEditColumn = useMemo(() => {
    const isAdmin = user?.roleKeys.includes("admin") ?? false;
    const mayEdit = user?.permissionKeys.includes("documents.fields.edit") ?? false;
    return columns.map(
      (column) =>
        mayEdit &&
        (isAdmin || (column.department !== null && (user?.departmentKeys ?? []).includes(column.department.key))),
    );
  }, [columns, user]);

  const totalCols = FIXED_COUNT + columns.length;
  const sel: Selection = {
    row: Math.min(selected.row, rows.length - 1),
    col: Math.min(selected.col, totalCols - 1),
  };
  const selRow = rows[sel.row];
  const selColumn = sel.col >= FIXED_COUNT ? columns[sel.col - FIXED_COUNT] : undefined;
  const selColumnKey = selColumn?.key ?? FIXED[sel.col]?.key ?? null;

  const widthOf = useCallback(
    (key: string, fallback = DEFAULT_WIDTH) => widths[key] ?? fallback,
    [widths],
  );
  const stickyLeft = useMemo(
    () => [ROW_NUMBER_WIDTH, ROW_NUMBER_WIDTH + widthOf(FIXED[0].key, FIXED[0].width)],
    [widthOf],
  );
  const stickyWidth = stickyLeft[1]! + widthOf(FIXED[1].key, FIXED[1].width);

  const showToast = useCallback((message: string, tone: "error" | "info" = "error") => {
    setToast({ message, tone });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  }, [widths]);

  const flash = useCallback((key: string) => {
    const token = Date.now() + Math.random();
    setFlashes((current) => new Map(current).set(key, token));
    window.setTimeout(() => {
      setFlashes((current) => {
        if (current.get(key) !== token) return current;
        const next = new Map(current);
        next.delete(key);
        return next;
      });
    }, 1800);
  }, []);

  const save = useMutation({
    mutationFn: (input: { documentId: string; nodeId: string; value: unknown; expectedVersion: number }) =>
      api(`/documents/${input.documentId}/fields/${input.nodeId}`, {
        method: "PATCH",
        body: JSON.stringify({ value: input.value, expectedVersion: input.expectedVersion }),
      }),
    onMutate: async (input) => {
      const key = cellKey(input.documentId, input.nodeId);
      await queryClient.cancelQueries({ queryKey: ["documents"], exact: true });
      const previous = queryClient.getQueryData<DocumentListItem[]>(["documents"]);
      mineRef.current.set(key, input.expectedVersion + 1);
      setPending((current) => new Set(current).add(key));
      queryClient.setQueryData<DocumentListItem[]>(["documents"], (docs) =>
        docs?.map((doc) =>
          doc.id !== input.documentId
            ? doc
            : {
                ...doc,
                fieldValues: [
                  ...doc.fieldValues.filter((field) => field.nodeId !== input.nodeId),
                  {
                    nodeId: input.nodeId,
                    value: input.value,
                    version: input.expectedVersion + 1,
                    updatedAt: new Date().toISOString(),
                    updatedBy: user ? { fullName: user.fullName } : null,
                  },
                ],
              },
        ),
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(["documents"], context.previous);
      showToast(
        error instanceof ApiError && error.status === 409
          ? "Someone else changed this cell first. The latest value is now shown — re-enter your change if still needed."
          : error.message,
      );
    },
    onSettled: (_data, _error, input) => {
      setPending((current) => {
        const next = new Set(current);
        next.delete(cellKey(input.documentId, input.nodeId));
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const move = useMutation({
    mutationFn: (input: { documentId: string; edge: WorkflowEdge }) => {
      const isReturn = input.edge.type === "RETURN" || input.edge.type === "EXCEPTION";
      const reason = isReturn ? window.prompt("Describe the concern or return reason") : undefined;
      if (isReturn && !reason) throw new Error("A return reason is required");
      return api(`/documents/${input.documentId}/${isReturn ? "return" : "move"}`, {
        method: "POST",
        body: JSON.stringify({ targetNodeId: input.edge.targetNodeId, reason }),
      });
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["documents", input.documentId] });
    },
    onError: (error) => showToast(error.message),
  });

  const createDocument = useMutation({
    mutationFn: (input: { referenceNumber: string; title: string }) =>
      api<{ id: string }>("/documents", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (created) => {
      setShowCreate(false);
      setSearch("");
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      const docs = queryClient.getQueryData<DocumentListItem[]>(["documents"]) ?? [];
      const index = [...docs]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .findIndex((doc) => doc.id === created.id);
      if (index >= 0) setSelected({ row: index, col: FIXED_COUNT });
    },
  });

  const lockReason = useCallback(
    (row: SheetRow, col: number) => {
      if (col < FIXED_COUNT) return "This column is managed by the workflow and cannot be edited here.";
      const column = columns[col - FIXED_COUNT]!;
      if (!resolveNodeId(row.doc.workflowVersionId, column.nodeKey)) {
        return "This step is not part of this document's workflow version.";
      }
      if (!canEditColumn[col - FIXED_COUNT]) {
        return `View only — this cell belongs to ${column.department?.name ?? "the system"}.`;
      }
      return null;
    },
    [canEditColumn, columns, resolveNodeId],
  );

  const commitCell = useCallback(
    (row: SheetRow | undefined, col: number, raw: string) => {
      const column = columns[col - FIXED_COUNT];
      if (!row || !column || lockReason(row, col)) return false;
      const parsed = parseCell(column, raw);
      if (!parsed.ok) {
        showToast(parsed.error);
        return false;
      }
      const nodeId = resolveNodeId(row.doc.workflowVersionId, column.nodeKey)!;
      const field = row.values.get(column.nodeKey);
      const next = mergeCellValue(column, field?.value, parsed.value);
      if (sameValue(next, field?.value)) return true;
      save.mutate({ documentId: row.doc.id, nodeId, value: next, expectedVersion: field?.version ?? 0 });
      return true;
    },
    [columns, lockReason, resolveNodeId, save, showToast],
  );

  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });

  const select = useCallback(
    (row: number, col: number) => {
      setSelected({
        row: Math.max(0, Math.min(row, rows.length - 1)),
        col: Math.max(0, Math.min(col, totalCols - 1)),
      });
    },
    [rows.length, totalCols],
  );

  const startEdit = useCallback(
    (rowIndex: number, col: number, typed?: string) => {
      const row = rows[rowIndex];
      if (!row) return;
      if (col === 0 && typed === undefined) {
        if (!documentId) router.push(`/documents/${row.doc.id}`);
        return;
      }
      const reason = lockReason(row, col);
      if (reason) {
        showToast(reason, "info");
        return;
      }
      const column = columns[col - FIXED_COUNT]!;
      const current = cellValue(column, row.values.get(column.nodeKey)?.value);
      setEditing({
        documentId: row.doc.id,
        col,
        initial: typed ?? editableText(current),
        typed: typed !== undefined && column.type !== "ENUM",
      });
    },
    [columns, documentId, lockReason, router, rows, showToast],
  );

  const onCellMouseDown = useCallback(
    (row: number, col: number) => {
      setSelected({ row, col });
      window.requestAnimationFrame(() => gridRef.current?.focus({ preventScroll: true }));
    },
    [],
  );
  const onCellDoubleClick = useCallback(
    (row: number, col: number) => startEdit(row, col),
    [startEdit],
  );

  useEffect(() => {
    gridRef.current
      ?.querySelector(`[data-cell="${sel.row}-${sel.col}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [sel.row, sel.col]);

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing || !rows.length || event.target !== event.currentTarget) return;
    const { row, col } = sel;
    const mod = event.ctrlKey || event.metaKey;
    const go = (nextRow: number, nextCol: number) => {
      event.preventDefault();
      select(nextRow, nextCol);
    };
    switch (event.key) {
      case "ArrowUp":
        return go(mod ? 0 : row - 1, col);
      case "ArrowDown":
        return go(mod ? rows.length - 1 : row + 1, col);
      case "ArrowLeft":
        return go(row, mod ? 0 : col - 1);
      case "ArrowRight":
        return go(row, mod ? totalCols - 1 : col + 1);
      case "Tab":
        return go(row, col + (event.shiftKey ? -1 : 1));
      case "Home":
        return go(mod ? 0 : row, 0);
      case "End":
        return go(mod ? rows.length - 1 : row, totalCols - 1);
      case "PageDown":
        return go(row + 20, col);
      case "PageUp":
        return go(row - 20, col);
      case "Enter":
      case "F2":
        event.preventDefault();
        return startEdit(row, col);
      case "Delete":
      case "Backspace": {
        event.preventDefault();
        const reason = lockReason(rows[row]!, col);
        if (reason) return showToast(reason, "info");
        commitCell(rows[row], col, "");
        return;
      }
      default:
        if (event.key.length === 1 && !mod && !event.altKey) {
          event.preventDefault();
          startEdit(row, col, event.key);
        }
    }
  };

  const displayText = (row: SheetRow | undefined, col: number) => {
    if (!row) return "";
    if (col === 0) return row.doc.referenceNumber;
    if (col === 1) return row.doc.title;
    if (col === 2) return row.doc.currentNode?.label ?? row.doc.status;
    const column = columns[col - FIXED_COUNT]!;
    return formatCell(column, cellValue(column, row.values.get(column.nodeKey)?.value));
  };

  useEffect(() => {
    if (!socket) return;
    const onField = (event: { entityId: string; nodeId: string; version: number }) => {
      const key = cellKey(event.entityId, event.nodeId);
      if (mineRef.current.get(key) !== event.version) flash(key);
    };
    const onMoved = (event: { entityId: string }) => flash(`${event.entityId}:current`);
    const onPublished = () => void queryClient.invalidateQueries({ queryKey: ["workflow"] });
    const onPresence = (viewer: Omit<Viewer, "seenAt">) =>
      setPresence((current) => new Map(current).set(viewer.socketId, { ...viewer, seenAt: Date.now() }));
    const onLeft = ({ socketId }: { socketId: string }) =>
      setPresence((current) => {
        const next = new Map(current);
        next.delete(socketId);
        return next;
      });
    socket.on("document.field.updated", onField);
    socket.on("document.moved", onMoved);
    socket.on("document.returned", onMoved);
    socket.on("workflow.published", onPublished);
    socket.on("grid.presence", onPresence);
    socket.on("grid.presence.left", onLeft);
    const prune = window.setInterval(() => {
      const cutoff = Date.now() - 40_000;
      setPresence((current) => new Map([...current].filter(([, viewer]) => viewer.seenAt > cutoff)));
    }, 10_000);
    return () => {
      socket.off("document.field.updated", onField);
      socket.off("document.moved", onMoved);
      socket.off("document.returned", onMoved);
      socket.off("workflow.published", onPublished);
      socket.off("grid.presence", onPresence);
      socket.off("grid.presence.left", onLeft);
      window.clearInterval(prune);
    };
  }, [flash, queryClient, socket]);

  const presenceDocumentId = selRow?.doc.id ?? null;
  useEffect(() => {
    if (!socket) return;
    const send = () =>
      socket.emit("grid.presence", {
        documentId: presenceDocumentId,
        columnKey: presenceDocumentId ? selColumnKey : null,
      });
    send();
    const heartbeat = window.setInterval(send, 15_000);
    socket.on("connect", send);
    return () => {
      window.clearInterval(heartbeat);
      socket.off("connect", send);
    };
  }, [socket, presenceDocumentId, selColumnKey]);
  useEffect(
    () => () => {
      socket?.emit("grid.presence", { documentId: null, columnKey: null });
    },
    [socket],
  );

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!socket) return () => undefined;
      socket.on("connect", callback);
      socket.on("disconnect", callback);
      return () => {
        socket.off("connect", callback);
        socket.off("disconnect", callback);
      };
    },
    [socket],
  );
  const connected = useSyncExternalStore(subscribe, () => socket?.connected ?? false, () => false);

  const { viewersByRow, activeViewers } = useMemo(() => {
    const byRow = new Map<string, Map<string, Viewer[]>>();
    const people = new Map<string, Viewer>();
    for (const viewer of presence.values()) {
      if (!viewer.documentId) continue;
      if (viewer.userId !== user?.id) people.set(viewer.userId, viewer);
      if (!viewer.columnKey) continue;
      const cells = byRow.get(viewer.documentId) ?? new Map<string, Viewer[]>();
      cells.set(viewer.columnKey, [...(cells.get(viewer.columnKey) ?? []), viewer]);
      byRow.set(viewer.documentId, cells);
    }
    return { viewersByRow: byRow, activeViewers: [...people.values()] };
  }, [presence, user?.id]);

  const startResize = (key: string, fallback: number) => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const start = widthOf(key, fallback);
    const move = (moveEvent: PointerEvent) =>
      setWidths((current) => ({ ...current, [key]: Math.max(60, Math.round(start + moveEvent.clientX - startX)) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const selField = selRow && selColumn ? selRow.values.get(selColumn.nodeKey) : undefined;
  const selLock = selRow ? lockReason(selRow, sel.col) : null;
  const selDepartment = selColumn?.department;
  const selTransitions = useMemo(() => {
    const current = selRow?.doc.currentNode;
    if (!selRow || !user || !current) return [];
    const departmentKey = current.department?.key ?? null;
    const canAct =
      user.roleKeys.includes("admin") ||
      (departmentKey !== null && user.departmentKeys.includes(departmentKey)) ||
      (current.type === "START" && user.permissionKeys.includes("documents.create"));
    if (!canAct) return [];
    return (edgesByVersion.get(selRow.doc.workflowVersionId) ?? []).filter(
      (edge) =>
        edge.sourceNodeId === selRow.doc.currentNodeId &&
        (edge.type === "RETURN" || edge.type === "EXCEPTION"
          ? user.permissionKeys.includes("documents.return")
          : user.permissionKeys.includes("documents.advance")),
    );
  }, [edgesByVersion, selRow, user]);
  const myDepartments = new Set(user?.departmentKeys);
  const editingIndex = editing ? rows.findIndex((row) => row.doc.id === editing.documentId) : -1;
  const editingColumn = editing ? columns[editing.col - FIXED_COUNT] : undefined;
  const editor =
    editing && editingColumn && editingIndex >= 0 ? (
      <CellEditor
        column={editingColumn}
        initial={editing.initial}
        key={`${editing.documentId}-${editing.col}`}
        onCancel={() => {
          setEditing(null);
          focusGrid();
        }}
        onCommit={(raw, direction) => {
          const ok = commitCell(rows[editingIndex], editing.col, raw);
          setEditing(null);
          if (!direction) return;
          focusGrid();
          if (!ok) return;
          if (direction === "down") select(editingIndex + 1, editing.col);
          else if (direction === "right") select(editingIndex, editing.col + 1);
          else select(editingIndex, editing.col - 1);
        }}
        typed={editing.typed}
      />
    ) : null;

  const allColumns = [
    ...FIXED.map((fixed) => ({ key: fixed.key, width: widthOf(fixed.key, fixed.width) })),
    ...columns.map((column) => ({ key: column.key, width: widthOf(column.key) })),
  ];
  const headerCell = "border-b border-r text-center font-normal";

  return (
    <div
      className={
        documentId
          ? "flex h-[65dvh] min-h-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-white"
          : "-m-5 flex h-[85dvh] flex-col bg-white lg:-m-10 lg:h-[calc(100dvh-4.5rem)]"
      }
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2" style={{ borderColor: GRID_LINE }}>
        <div className="mr-2">
          <h1 className="text-[17px] font-semibold text-primary-strong">Document flow</h1>
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <span
              className={`inline-block size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-gray-400"}`}
              aria-hidden
            />
            {connected ? "Live" : "Reconnecting…"} · {rows.length}{" "}
            {rows.length === 1 ? "document" : "documents"}
          </p>
        </div>
        {!documentId ? (
          <label className="flex h-8 items-center gap-2 rounded-full bg-[#f1f3f4] px-3 text-sm text-[#5f6368] focus-within:bg-white focus-within:ring-1 focus-within:ring-[#1a73e8]">
            <MagnifyingGlass size={15} />
            <input
              className="w-48 bg-transparent text-[13px] text-[#202124] outline-none"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reference, title, step"
              value={search}
            />
          </label>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          {groups
            .filter((group, index) => groups.findIndex((other) => other.key === group.key) === index)
            .map((group) => {
              const colors = departmentColors(group.key);
              const mine = myDepartments.has(group.key) || user?.roleKeys.includes("admin");
              return (
                <button
                  className="flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] text-[#3c4043] hover:bg-[#f1f3f4]"
                  key={group.key}
                  onClick={() => {
                    select(sel.row < 0 ? 0 : sel.row, group.start + FIXED_COUNT);
                    focusGrid();
                  }}
                  style={{ borderColor: GRID_LINE }}
                  title={mine ? `You can edit ${group.name} cells` : `${group.name} cells are view only for you`}
                  type="button"
                >
                  <span className="size-2.5 rounded-sm" style={{ background: colors.band }} />
                  {group.name}
                  {mine ? <PencilSimple size={12} /> : <LockSimple size={12} className="text-[#80868b]" />}
                </button>
              );
            })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-3 text-[11px] text-[#5f6368] xl:flex">
            <span className="flex items-center gap-1">
              <span className="size-3 border" style={{ background: CURRENT_BG, borderColor: "#f9ab00" }} /> Current step
            </span>
            <span className="flex items-center gap-1">
              <span className="size-3 border" style={{ background: LOCKED_BG, borderColor: GRID_LINE }} /> View only
            </span>
          </div>
          <div className="flex -space-x-1.5">
            {activeViewers.slice(0, 6).map((viewer) => (
              <span
                className="grid size-7 place-items-center rounded-full border-2 border-white text-[11px] font-semibold text-white"
                key={viewer.userId}
                style={{ background: presenceColor(viewer.userId) }}
                title={`${viewer.fullName} is viewing`}
              >
                {initials(viewer.fullName)}
              </span>
            ))}
          </div>
          {!documentId && user?.permissionKeys.includes("documents.create") ? (
            <button
              className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-white"
              onClick={() => setShowCreate((value) => !value)}
              type="button"
            >
              {showCreate ? <X size={14} /> : <Plus size={14} />}
              {showCreate ? "Cancel" : "New document"}
            </button>
          ) : null}
        </div>
      </div>

      {!documentId && showCreate ? (
        <form
          className="flex flex-wrap items-center gap-2 border-b bg-[#f8fbff] px-4 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            createDocument.mutate({
              referenceNumber: String(data.get("referenceNumber")),
              title: String(data.get("title")),
            });
          }}
          style={{ borderColor: GRID_LINE }}
        >
          <input
            autoFocus
            className="h-8 w-44 rounded border px-2 text-[13px]"
            name="referenceNumber"
            placeholder="Reference number"
            required
            style={{ borderColor: "#c4c7c5" }}
          />
          <input
            className="h-8 min-w-64 flex-1 rounded border px-2 text-[13px]"
            name="title"
            placeholder="Project title"
            required
            style={{ borderColor: "#c4c7c5" }}
          />
          <button
            className="flex h-8 items-center gap-1.5 rounded bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60"
            disabled={createDocument.isPending}
            type="submit"
          >
            <Plus size={12} weight="bold" />
            Add row
          </button>
          {createDocument.error ? <p className="w-full text-[12px] text-red-700">{createDocument.error.message}</p> : null}
        </form>
      ) : null}

      <div className="flex h-8 items-stretch border-b text-[13px]" style={{ borderColor: GRID_LINE }}>
        <div
          className="grid w-24 shrink-0 place-items-center border-r font-medium text-[#3c4043]"
          style={{ borderColor: GRID_LINE }}
        >
          {selRow ? `${columnLetter(sel.col)}${sel.row + 1}` : "—"}
        </div>
        <div
          className="grid w-9 shrink-0 place-items-center border-r font-serif italic text-[#80868b]"
          style={{ borderColor: GRID_LINE }}
        >
          fx
        </div>
        <div className="flex min-w-0 flex-1 items-center truncate px-3 text-[#202124]">
          {displayText(selRow, sel.col)}
        </div>
        {selTransitions.length ? (
          <div
            className="flex shrink-0 items-center gap-1 border-l px-1.5"
            style={{ borderColor: GRID_LINE }}
          >
            {selTransitions.map((edge) => {
              const isReturn = edge.type === "RETURN" || edge.type === "EXCEPTION";
              const target = nodeById.get(edge.targetNodeId)?.label ?? "next step";
              return (
                <button
                  className={`flex h-6 items-center gap-1 whitespace-nowrap rounded px-2 text-[11px] font-semibold ${
                    isReturn
                      ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                      : "bg-primary text-white hover:opacity-90"
                  } disabled:opacity-60`}
                  disabled={move.isPending}
                  key={edge.id}
                  onClick={() => selRow && move.mutate({ documentId: selRow.doc.id, edge })}
                  title={`${isReturn ? "Return to" : "Move to"} ${target}`}
                  type="button"
                >
                  {isReturn ? <ArrowUUpLeft size={11} /> : <ArrowRight size={11} />}
                  {isReturn ? "Return to" : "Move to"} {target}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="hidden shrink-0 items-center gap-3 px-3 text-[11px] text-[#5f6368] md:flex">
          {selDepartment ? (
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm" style={{ background: departmentColors(selDepartment.key).band }} />
              {selDepartment.name}
              {selColumn?.step ? ` · Step ${selColumn.step}` : ""}
            </span>
          ) : null}
          {selRow ? (
            selLock ? (
              <span className="flex items-center gap-1">
                <LockSimple size={12} /> View only
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[#188038]">
                <PencilSimple size={12} /> Editable
              </span>
            )
          ) : null}
          {selField?.updatedBy ? (
            <span>
              Last edit: {selField.updatedBy.fullName}, {new Date(selField.updatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>

      <div
        aria-label="Document flow sheet"
        className="sheet relative min-h-0 flex-1 overflow-auto text-[13px] text-[#202124] outline-none"
        onCopy={(event) => {
          if (editing || event.target !== event.currentTarget) return;
          event.preventDefault();
          event.clipboardData.setData("text/plain", displayText(selRow, sel.col));
        }}
        onKeyDown={onGridKeyDown}
        onPaste={(event) => {
          if (editing || event.target !== event.currentTarget || !selRow) return;
          event.preventDefault();
          const reason = lockReason(selRow, sel.col);
          if (reason) return showToast(reason, "info");
          const text = event.clipboardData.getData("text/plain").split(/\r?\n/)[0]!.split("\t")[0]!;
          commitCell(selRow, sel.col, text);
        }}
        ref={gridRef}
        role="grid"
        style={
          {
            "--sheet-header": `${HEADER_HEIGHT}px`,
            "--sheet-sticky": `${stickyWidth}px`,
          } as React.CSSProperties
        }
        tabIndex={0}
      >
        <table className="border-separate border-spacing-0" style={{ tableLayout: "fixed", width: "max-content" }}>
          <colgroup>
            <col style={{ width: ROW_NUMBER_WIDTH }} />
            {allColumns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead className="select-none">
            <tr style={{ height: HEADER.letters }}>
              <th
                className={`${headerCell} sticky left-0 top-0 z-[30]`}
                style={{ background: HEADER_BG, borderColor: GRID_LINE }}
              />
              {allColumns.map((column, col) => {
                const active = col === sel.col;
                return (
                  <th
                    className={`${headerCell} sticky top-0 z-[20] text-[11px] ${col < 2 ? "z-[25]" : ""}`}
                    key={column.key}
                    onMouseDown={() => {
                      select(sel.row < 0 ? 0 : sel.row, col);
                      focusGrid();
                    }}
                    style={{
                      background: active ? "#d3e3fd" : HEADER_BG,
                      color: active ? "#0b57d0" : "#5f6368",
                      fontWeight: active ? 600 : 400,
                      borderColor: GRID_LINE,
                      left: col < 2 ? stickyLeft[col] : undefined,
                    }}
                  >
                    {columnLetter(col)}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 -right-[3px] z-10 w-[6px] cursor-col-resize hover:bg-[#1a73e8]/40"
                      onPointerDown={startResize(column.key, column.width)}
                    />
                  </th>
                );
              })}
            </tr>
            <tr style={{ height: HEADER.band }}>
              <th
                className={`${headerCell} sticky left-0 z-[30]`}
                rowSpan={3}
                style={{ top: HEADER.letters, background: HEADER_BG, borderColor: GRID_LINE }}
              />
              <th
                className={`${headerCell} sticky z-[25] text-[11px] font-bold tracking-[0.35em] text-white`}
                colSpan={2}
                style={{ top: HEADER.letters, left: stickyLeft[0], background: "#434343", borderColor: GRID_LINE }}
              >
                DOCUMENT
              </th>
              <th
                className={`${headerCell} sticky z-[20]`}
                style={{ top: HEADER.letters, background: "#434343", borderColor: GRID_LINE }}
              />
              {groups.map((group) => {
                const colors = departmentColors(group.key);
                return (
                  <th
                    className={`${headerCell} sticky z-[20] overflow-hidden whitespace-nowrap text-[11px] font-bold tracking-[0.35em]`}
                    colSpan={group.span}
                    key={`${group.key}-${group.start}`}
                    style={{ top: HEADER.letters, background: colors.band, color: colors.text, borderColor: GRID_LINE }}
                  >
                    {group.name.toUpperCase()}
                  </th>
                );
              })}
            </tr>
            <tr style={{ height: HEADER.label }}>
              {FIXED.map((fixed, col) => (
                <th
                  className={`${headerCell} sticky px-1.5 text-[10.5px] font-bold leading-tight text-[#202124] ${col < 2 ? "z-[25]" : "z-[20]"}`}
                  key={fixed.key}
                  style={{
                    top: HEADER.letters + HEADER.band,
                    left: col < 2 ? stickyLeft[col] : undefined,
                    background: "#efefef",
                    borderColor: GRID_LINE,
                  }}
                >
                  {fixed.label}
                </th>
              ))}
              {columns.map((column, offset) => (
                <th
                  className={`${headerCell} sticky z-[20] px-1.5 text-[10.5px] font-bold leading-tight text-[#202124]`}
                  key={column.key}
                  style={{
                    top: HEADER.letters + HEADER.band,
                    background: departmentColors(column.department?.key).header,
                    borderColor: GRID_LINE,
                  }}
                  title={column.label}
                >
                  <span className="line-clamp-4">{column.label}</span>
                  {canEditColumn[offset] ? (
                    <PencilSimple className="absolute right-1 top-1 text-[#188038]" size={11} weight="bold" />
                  ) : null}
                </th>
              ))}
            </tr>
            <tr style={{ height: HEADER.step }}>
              {FIXED.map((fixed, col) => (
                <th
                  className={`${headerCell} sticky text-[10.5px] text-[#80868b] ${col < 2 ? "z-[25]" : "z-[20]"}`}
                  key={fixed.key}
                  style={{
                    top: HEADER.letters + HEADER.band + HEADER.label,
                    left: col < 2 ? stickyLeft[col] : undefined,
                    background: "#ffffff",
                    borderColor: GRID_LINE,
                    borderBottomColor: "#c4c7c5",
                  }}
                />
              ))}
              {columns.map((column) => (
                <th
                  className={`${headerCell} sticky z-[20] px-1.5 text-left text-[10.5px] text-[#5f6368]`}
                  key={column.key}
                  style={{
                    top: HEADER.letters + HEADER.band + HEADER.label,
                    background: "#ffffff",
                    borderColor: GRID_LINE,
                    borderBottomColor: "#c4c7c5",
                  }}
                >
                  {column.step !== null ? `Step ${column.step}` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.isLoading || published.isLoading
              ? Array.from({ length: 12 }, (_, index) => (
                  <tr key={index}>
                    <th
                      className="sticky left-0 z-[6] border-b border-r text-center text-[11px] font-normal"
                      scope="row"
                      style={{ borderColor: GRID_LINE, background: HEADER_BG, color: "#5f6368" }}
                    >
                      {index + 1}
                    </th>
                    {allColumns.map((column, col) => (
                      <td
                        className={`h-6 border-b border-r px-1.5 align-middle ${col < 2 ? "sticky z-[5] bg-white" : ""}`}
                        key={column.key}
                        style={{
                          borderColor: GRID_LINE,
                          left: col < 2 ? stickyLeft[col] : undefined,
                          boxShadow: col === 1 ? "2px 0 0 0 #c4c7c5" : undefined,
                        }}
                      >
                        <div
                          className="h-3 animate-pulse rounded"
                          style={{ background: "#e8eaed", width: `${45 + ((index * 11 + col * 17) % 45)}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row, index) => (
              <SheetRowView
                canEditColumn={canEditColumn}
                columns={columns}
                detailLink={!documentId}
                editor={index === editingIndex ? editor : null}
                editorCol={index === editingIndex ? editing!.col : -1}
                flashes={flashes}
                index={index}
                key={row.doc.id}
                onCellDoubleClick={onCellDoubleClick}
                onCellMouseDown={onCellMouseDown}
                pending={pending}
                resolveNodeId={resolveNodeId}
                row={row}
                selectedCol={index === sel.row ? sel.col : -1}
                stickyLeft={stickyLeft}
                viewers={viewersByRow.get(row.doc.id) ?? EMPTY_VIEWERS}
              />
            ))}
          </tbody>
        </table>
        {!documents.isLoading && !published.isLoading && !rows.length ? (
          <p className="flex items-center justify-center gap-2 p-8 text-center text-[13px] text-muted">
            <Tray size={16} />
            {documentId
              ? "Document not found."
              : search
                ? "No documents match your search."
                : "No tracked documents yet."}
          </p>
        ) : null}
      </div>

      {toast ? (
        <div
          className={`pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md px-4 py-2.5 text-[13px] shadow-lg ${
            toast.tone === "error" ? "bg-[#b3261e] text-white" : "bg-[#323232] text-white"
          }`}
          role="status"
        >
          {toast.tone === "error" ? <WarningCircle size={15} weight="fill" /> : null}
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
