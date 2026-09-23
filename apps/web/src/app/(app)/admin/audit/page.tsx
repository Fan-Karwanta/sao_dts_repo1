"use client";

import { Scroll, Tray } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function AuditPage() {
  const events = useQuery({
    queryKey: ["audit-events"],
    queryFn: () => api<AuditEvent[]>("/audit-events?take=250"),
  });
  return (
    <div className="mx-auto max-w-7xl">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
        <Scroll size={16} />
        Security log
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary-strong">Audit trail</h1>
      <p className="mt-2 text-muted">Append-only security and business activity across the system.</p>
      <div className="mt-8 overflow-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-primary-strong text-white">
            <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Change</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.data?.map((event) => (
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
        {events.data && !events.data.length ? (
          <div className="p-12 text-center">
            <Tray className="mx-auto text-muted" size={36} />
            <p className="mt-3 text-sm text-muted">No audit events recorded yet.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
