"use client";

import {
  ArrowRight,
  ArrowUUpLeft,
  Bell,
  BellSlash,
  FilePlus,
  UserPlus,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function notificationIcon(type: string) {
  if (type.includes("return")) return ArrowUUpLeft;
  if (type.includes("move") || type.includes("advance")) return ArrowRight;
  if (type.includes("assign") || type.includes("registration")) return UserPlus;
  if (type.includes("creat")) return FilePlus;
  return Bell;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Notification[]>("/notifications"),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unreadCount = notifications.data?.filter((item) => !item.readAt).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-primary-strong">Notifications</h1>
        {unreadCount ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            {unreadCount} unread
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-muted">Assignments, returns, and document movement requiring attention.</p>
      <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-white">
        <div className="divide-y divide-border">
          {notifications.data?.map((notification) => {
            const Icon = notificationIcon(notification.type);
            const unread = !notification.readAt;
            return (
              <button
                className={`block w-full px-5 py-4 text-left transition hover:bg-background ${
                  unread ? "bg-emerald-50/50" : "bg-white"
                }`}
                key={notification.id}
                onClick={() => markRead.mutate(notification.id)}
                type="button"
              >
                <div className="flex gap-4">
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                      unread ? "bg-emerald-100 text-emerald-700" : "bg-background text-muted"
                    }`}
                  >
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <p className={`text-primary-strong ${unread ? "font-semibold" : "font-medium"}`}>
                        {notification.title}
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        {unread ? <span className="size-2 rounded-full bg-emerald-500" /> : null}
                        <time className="text-xs text-muted">
                          {new Date(notification.createdAt).toLocaleString()}
                        </time>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-muted">{notification.body}</p>
                  </div>
                </div>
              </button>
            );
          })}
          {notifications.isLoading
            ? Array.from({ length: 5 }, (_, index) => (
                <div className="px-5 py-4" key={index}>
                  <div className="flex gap-4">
                    <Skeleton className="size-10 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-24 shrink-0" />
                      </div>
                      <Skeleton className="mt-2 h-3.5 w-3/4" />
                    </div>
                  </div>
                </div>
              ))
            : null}
          {!notifications.isLoading && !notifications.data?.length ? (
            <div className="p-12 text-center">
              <BellSlash className="mx-auto text-muted" size={36} />
              <p className="mt-3 text-sm text-muted">No notifications.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
