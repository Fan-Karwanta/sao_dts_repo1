"use client";

import { CaretLeft, CaretRight, MagnifyingGlass, Scroll, Tray } from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";

interface AuditEvent {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  occurredAt: string;
  actor: { fullName: string; username: string } | null;
  effectiveActor: { fullName: string; username: string } | null;
  before: unknown;
  after: unknown;
}

interface AuditEventPage {
  items: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  actions: string[];
  targetTypes: string[];
}

const PAGE_SIZES = [10, 50, 100];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function pageWindow(current: number, totalPages: number) {
  const start = Math.max(1, Math.min(current - 2, totalPages - 4));
  return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const events = useQuery({
    queryKey: ["audit-events", page, pageSize, debouncedSearch, action, targetType],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (action) params.set("action", action);
      if (targetType) params.set("targetType", targetType);
      return api<AuditEventPage>(`/audit-events?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const data = events.data;
  const currentPage = data?.page ?? page;
  const totalPages = data?.totalPages ?? 1;
  const firstRow = data && data.total ? (currentPage - 1) * data.pageSize + 1 : 0;
  const lastRow = data ? Math.min(currentPage * data.pageSize, data.total) : 0;
  const filtered = Boolean(debouncedSearch || action || targetType);

  return (
    <div className="mx-auto max-w-7xl">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
        <Scroll size={16} />
        Security log
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary-strong">Audit trail</h1>
      <p className="mt-2 text-muted">Append-only security and business activity across the system.</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <label className="flex min-w-64 flex-1 items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm">
          <MagnifyingGlass size={16} className="shrink-0 text-muted" />
          <input
            className="w-full bg-transparent outline-none placeholder:text-muted"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search action, target, or actor…"
            type="search"
            value={search}
          />
        </label>
        <select
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          value={action}
        >
          <option value="">All actions</option>
          {data?.actions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
          onChange={(event) => {
            setTargetType(event.target.value);
            setPage(1);
          }}
          value={targetType}
        >
          <option value="">All targets</option>
          {data?.targetTypes.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-auto rounded-2xl border border-border bg-white">
        <table className={`w-full min-w-[900px] text-left text-sm ${events.isFetching ? "opacity-60" : ""}`}>
          <thead className="bg-primary-strong text-white">
            <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Change</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.isPending
              ? Array.from({ length: 8 }, (_, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3"><Skeleton className="h-3.5 w-32" /></td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <Skeleton className="size-7 shrink-0 rounded-full" />
                        <Skeleton className="h-3.5 w-28" />
                      </span>
                    </td>
                    <td className="px-4 py-3"><Skeleton className="h-3.5 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-3 w-44" /></td>
                  </tr>
                ))
              : null}
            {data?.items.map((event) => (
              <tr key={event.id}>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{new Date(event.occurredAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    {event.actor ? (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                        {initials(event.actor.fullName)}
                      </span>
                    ) : null}
                    <span>
                      {event.actor?.fullName ?? "System"}
                      {event.effectiveActor && event.actor?.username !== event.effectiveActor.username
                        ? ` as ${event.effectiveActor.fullName}`
                        : ""}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-primary">{event.action}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted">
                    {event.targetType}
                  </span>
                </td>
                <td className="max-w-md truncate px-4 py-3 font-mono text-xs text-muted">{JSON.stringify(event.after ?? event.before)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.items.length ? (
          <div className="p-12 text-center">
            <Tray className="mx-auto text-muted" size={36} />
            <p className="mt-3 text-sm text-muted">
              {filtered ? "No audit events match the current search or filters." : "No audit events recorded yet."}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted">
          <p>{data?.total ? `Showing ${firstRow}–${lastRow} of ${data.total}` : "No events"}</p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              Rows per page
              <select
                className="rounded-lg border border-border bg-white px-2 py-1.5"
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                value={pageSize}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button
                className="grid size-8 place-items-center rounded-lg border border-border transition enabled:hover:bg-background disabled:opacity-40"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                type="button"
              >
                <CaretLeft size={14} />
              </button>
              {pageWindow(currentPage, totalPages).map((number) => (
                <button
                  className={`size-8 rounded-lg border text-sm font-medium transition ${number === currentPage ? "border-primary bg-primary text-white" : "border-border hover:bg-background"}`}
                  key={number}
                  onClick={() => setPage(number)}
                  type="button"
                >
                  {number}
                </button>
              ))}
              <button
                className="grid size-8 place-items-center rounded-lg border border-border transition enabled:hover:bg-background disabled:opacity-40"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                type="button"
              >
                <CaretRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
