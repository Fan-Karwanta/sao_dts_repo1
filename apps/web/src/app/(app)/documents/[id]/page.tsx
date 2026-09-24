"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUUpLeft,
  CheckCircle,
  FilePlus,
  FlagCheckered,
  GitBranch,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DocumentSheet } from "@/components/document-sheet";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";
import type { AuthContext, WorkflowNode } from "@/lib/types";

interface DocumentDetail {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  currentNode: WorkflowNode | null;
  movements: Array<{
    id: string;
    type: string;
    reason: string | null;
    occurredAt: string;
    fromNode: WorkflowNode | null;
    toNode: WorkflowNode | null;
    actor: { fullName: string; username: string };
  }>;
  concerns: Array<{
    id: string;
    status: string;
    message: string;
    createdAt: string;
    node: WorkflowNode | null;
    openedBy: { fullName: string };
  }>;
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const document = useQuery({
    queryKey: ["documents", id],
    queryFn: () => api<DocumentDetail>(`/documents/${id}`),
  });
  const auth = useQuery({
    queryKey: ["auth"],
    queryFn: () => api<AuthContext>("/auth/me"),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["documents", id] });
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
  };
  const resolveConcern = useMutation({
    mutationFn: (concernId: string) => {
      const resolution = window.prompt("How was this concern resolved?");
      if (!resolution) throw new Error("A resolution note is required");
      return api(`/documents/concerns/${concernId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution }),
      });
    },
    onSuccess: refresh,
  });

  if (document.isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading document" className="mx-auto max-w-7xl">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="mt-4 h-4 w-32" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-3 h-4 w-48" />
        <Skeleton className="mt-8 h-[380px] rounded-2xl border border-border bg-white" />
        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          {[0, 1].map((section) => (
            <section className="rounded-2xl border border-border bg-white" key={section}>
              <div className="border-b border-border px-5 py-4">
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="divide-y divide-border">
                {Array.from({ length: 3 }, (_, index) => (
                  <div className="flex gap-3 px-5 py-4" key={index}>
                    <Skeleton className="size-9 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="mt-2 h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }
  if (!document.data) return <p className="text-red-700">Unable to load this document.</p>;

  const data = document.data;
  const canResolve = auth.data?.user.permissionKeys.includes("documents.fields.edit") ?? false;
  const statusTone =
    data.status === "RETURNED"
      ? "bg-amber-100 text-amber-900"
      : data.status === "COMPLETED"
        ? "bg-emerald-100 text-emerald-900"
        : "bg-sky-100 text-sky-900";

  const movementIcon = (type: string) => {
    if (type === "RETURN") return { icon: ArrowUUpLeft, tone: "bg-amber-100 text-amber-700" };
    if (type === "COMPLETE") return { icon: FlagCheckered, tone: "bg-emerald-100 text-emerald-700" };
    if (type === "CREATE") return { icon: FilePlus, tone: "bg-violet-100 text-violet-700" };
    if (type === "REROUTE") return { icon: GitBranch, tone: "bg-sky-100 text-sky-700" };
    return { icon: ArrowRight, tone: "bg-emerald-100 text-emerald-700" };
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            href="/documents"
          >
            <ArrowLeft size={13} weight="bold" />
            Document flow
          </Link>
          <p className="mt-2 text-sm font-semibold text-primary">{data.referenceNumber}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-primary-strong">{data.title}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone}`}>
              {data.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            Current step: <strong>{data.currentNode?.label ?? data.status}</strong>
          </p>
        </div>
      </div>

      {resolveConcern.error ? (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{resolveConcern.error.message}</p>
      ) : null}

      <section className="mt-8">
        <DocumentSheet documentId={id} />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-white">
          <h2 className="border-b border-border px-5 py-4 font-semibold text-primary-strong">Movement timeline</h2>
          <div className="divide-y divide-border">
            {data.movements.map((movement) => {
              const { icon: Icon, tone } = movementIcon(movement.type);
              return (
                <div className="flex gap-3 px-5 py-4 text-sm" key={movement.id}>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-primary-strong">
                      {movement.type}: {movement.fromNode?.label ?? "Created"} → {movement.toNode?.label}
                    </p>
                    <p className="mt-1 text-muted">
                      {movement.actor.fullName} · {new Date(movement.occurredAt).toLocaleString()}
                    </p>
                    {movement.reason ? <p className="mt-2 text-amber-800">{movement.reason}</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-white">
          <h2 className="border-b border-border px-5 py-4 font-semibold text-primary-strong">Concerns and returns</h2>
          <div className="divide-y divide-border">
            {data.concerns.map((concern) => (
              <div className="flex gap-3 px-5 py-4 text-sm" key={concern.id}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
                  <WarningCircle size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-primary-strong">{concern.node?.label}</p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{concern.status}</span>
                      {concern.status === "OPEN" && canResolve ? (
                        <button
                          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-primary-strong transition hover:bg-background disabled:opacity-60"
                          disabled={resolveConcern.isPending}
                          onClick={() => resolveConcern.mutate(concern.id)}
                          type="button"
                        >
                          <CheckCircle size={12} />
                          Resolve
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-muted">{concern.message}</p>
                  <p className="mt-2 text-xs text-muted">{concern.openedBy.fullName}</p>
                </div>
              </div>
            ))}
            {!data.concerns.length ? (
              <div className="flex items-center gap-2 p-5 text-sm text-muted">
                <CheckCircle size={16} className="text-emerald-600" />
                No concerns recorded.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
