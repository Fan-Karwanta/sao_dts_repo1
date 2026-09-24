"use client";

import {
  ArrowRight,
  ArrowUUpLeft,
  CaretRight,
  CheckCircle,
  FileText,
  Files,
  FolderOpen,
  Gauge,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";
import type { DocumentListItem } from "@/lib/types";

export default function DashboardPage() {
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: () => api<DocumentListItem[]>("/documents"),
  });
  const data = documents.data ?? [];
  const cards = [
    {
      label: "Active records",
      value: data.filter((item) => item.status === "ACTIVE").length,
      icon: FileText,
      iconClass: "bg-sky-100 text-sky-700",
    },
    {
      label: "Returned concerns",
      value: data.filter((item) => item.status === "RETURNED").length,
      icon: ArrowUUpLeft,
      iconClass: "bg-amber-100 text-amber-700",
    },
    {
      label: "Completed",
      value: data.filter((item) => item.status === "COMPLETED").length,
      icon: CheckCircle,
      iconClass: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "Total tracked",
      value: data.length,
      icon: Files,
      iconClass: "bg-violet-100 text-violet-700",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Gauge size={16} />
            Operations overview
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary-strong">
            Document movement at a glance
          </h1>
          <p className="mt-2 text-muted">Live counts update when records move between departments.</p>
        </div>
        <Link
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-strong"
          href="/documents"
        >
          Open document flow
          <ArrowRight size={16} weight="bold" />
        </Link>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, iconClass }) => (
          <article
            className="flex items-center gap-4 rounded-2xl border border-border bg-white p-5"
            key={label}
          >
            <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${iconClass}`}>
              <Icon size={24} />
            </span>
            <div>
              <p className="text-sm text-muted">{label}</p>
              {documents.isLoading ? (
                <Skeleton className="mt-2 h-8 w-14" />
              ) : (
                <p className="mt-1 text-3xl font-semibold text-primary-strong">{value}</p>
              )}
            </div>
          </article>
        ))}
      </div>
      <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-white">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-primary-strong">Recent activity</h2>
        </div>
        <div className="divide-y divide-border">
          {data.slice(0, 8).map((document) => (
            <Link
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-background"
              href={`/documents/${document.id}`}
              key={document.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-primary">
                  <FileText size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-primary-strong">{document.referenceNumber}</p>
                  <p className="mt-1 truncate text-sm text-muted">{document.title}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-primary">
                    {document.currentNode?.label ?? document.status}
                  </p>
                  <p className="mt-1 text-xs text-muted">{new Date(document.updatedAt).toLocaleString()}</p>
                </div>
                <CaretRight className="text-muted" size={16} />
              </div>
            </Link>
          ))}
          {documents.isLoading
            ? Array.from({ length: 5 }, (_, index) => (
                <div className="flex items-center justify-between gap-4 px-5 py-4" key={index}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Skeleton className="size-10 shrink-0 rounded-xl" />
                    <div>
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="mt-2 h-3 w-52" />
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Skeleton className="ml-auto h-3.5 w-28" />
                    <Skeleton className="mt-2 h-3 w-36" />
                  </div>
                </div>
              ))
            : null}
          {!data.length && !documents.isLoading ? (
            <div className="px-5 py-12 text-center">
              <FolderOpen className="mx-auto text-muted" size={36} />
              <p className="mt-3 text-sm text-muted">No documents have been created yet.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
