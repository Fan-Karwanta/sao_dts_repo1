"use client";

import {
  Bell,
  Gauge,
  LockKey,
  Scroll,
  ShieldCheck,
  SignOut,
  SpinnerGap,
  SquaresFour,
  Table,
  TreeStructure,
  UserCircle,
  UserSwitch,
  Users,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { SocketContext } from "@/components/realtime";
import { api, API_URL, ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/types";

const navigation = [
  ["Dashboard", "/dashboard", null, "dashboard", Gauge],
  ["Document flow", "/documents", "documents.view", "document_flow", Table],
  ["Notifications", "/notifications", null, "notifications", Bell],
  ["Users", "/admin/users", "users.manage", "users", Users],
  ["Roles", "/admin/roles", "roles.manage", "roles", ShieldCheck],
  ["Pages", "/admin/features", "features.manage", null, SquaresFour],
  ["Workflow builder", "/admin/workflows", "workflows.design", "workflow_builder", TreeStructure],
  ["Audit trail", "/admin/audit", "audit.view", "audit", Scroll],
  ["Profile", "/profile", null, "settings", UserCircle],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const auth = useQuery({
    queryKey: ["auth"],
    queryFn: () => api<AuthContext>("/auth/me"),
    retry: false,
  });
  const enabledFeatures = useQuery({
    queryKey: ["enabled-features"],
    queryFn: () => api<Array<{ key: string }>>("/features/enabled"),
    enabled: Boolean(auth.data),
  });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Array<{ readAt: string | null }>>("/notifications"),
    enabled: Boolean(auth.data),
  });
  const logout = useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });

  useEffect(() => {
    if (auth.error instanceof ApiError && auth.error.status === 401) {
      router.replace("/login");
    }
  }, [auth.error, router]);

  const userId = auth.data?.user.id;
  const socket = useMemo(
    () => (userId ? io(API_URL, { withCredentials: true, autoConnect: false }) : null),
    [userId],
  );

  useEffect(() => {
    if (!socket) return;
    socket.connect();
    const refreshDocuments = () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    };
    const refreshNotifications = () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    socket.on("document.created", refreshDocuments);
    socket.on("document.field.updated", refreshDocuments);
    socket.on("document.moved", refreshDocuments);
    socket.on("document.returned", refreshDocuments);
    socket.on("workflow.published", refreshDocuments);
    socket.on("notification.created", refreshNotifications);
    return () => {
      socket.off("document.created", refreshDocuments);
      socket.off("document.field.updated", refreshDocuments);
      socket.off("document.moved", refreshDocuments);
      socket.off("document.returned", refreshDocuments);
      socket.off("workflow.published", refreshDocuments);
      socket.off("notification.created", refreshNotifications);
      socket.disconnect();
    };
  }, [socket, queryClient]);

  if (auth.isLoading || !auth.data) {
    return (
      <main className="grid min-h-screen place-items-center text-primary">
        <SpinnerGap className="animate-spin" size={32} />
      </main>
    );
  }

  const { user, actor, impersonationId } = auth.data;
  const permissions = new Set(user.permissionKeys);
  const features = new Set(enabledFeatures.data?.map(({ key }) => key));
  const unreadCount = notifications.data?.filter((item) => !item.readAt).length ?? 0;
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="border-b border-white/10 bg-primary-strong p-5 text-white lg:min-h-screen lg:border-b-0 lg:p-7">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-accent font-black text-primary-strong">
            SAO
          </div>
          <div>
            <p className="font-semibold">SAO DTS</p>
            <p className="text-xs text-emerald-100/65">Workspace</p>
          </div>
        </div>
        <nav className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:mt-12 lg:grid-cols-1" aria-label="Primary navigation">
          {navigation
            .filter(
              ([, , permission, feature]) =>
                (!permission || permissions.has(permission)) &&
                (!feature || !enabledFeatures.data || features.has(feature)),
            )
            .map(([label, href, , , Icon]) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                    active ? "bg-white/12 font-semibold text-white" : "text-emerald-50/70 hover:bg-white/5 hover:text-white"
                  }`}
                  href={href}
                  key={href}
                >
                  <Icon className="shrink-0" size={18} weight={active ? "fill" : "regular"} />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {href === "/notifications" && unreadCount ? (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-primary-strong">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
        </nav>
      </aside>
      <div className="min-w-0">
        {impersonationId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-100 px-6 py-3 text-sm text-amber-950">
            <span className="flex items-center gap-2">
              <UserSwitch className="shrink-0" size={16} weight="bold" />
              {actor.fullName} is impersonating <strong>{user.fullName}</strong>.
            </span>
            <button
              className="font-semibold underline"
              onClick={() =>
                api("/auth/impersonation", { method: "DELETE" }).then(() =>
                  queryClient.invalidateQueries({ queryKey: ["auth"] }),
                )
              }
              type="button"
            >
              Exit impersonation
            </button>
          </div>
        ) : null}
        <header className="flex items-center justify-between border-b border-border bg-white px-6 py-4 lg:px-10">
          <div>
            <p className="text-sm font-semibold text-primary-strong">{user.fullName}</p>
            <p className="text-xs text-muted">{user.roleKeys.join(", ")}</p>
          </div>
          <button
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-primary-strong transition hover:bg-background"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            type="button"
          >
            <SignOut size={16} />
            Sign out
          </button>
        </header>
        {user.mustChangePassword ? (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900 lg:px-10">
            <LockKey className="shrink-0" size={15} />
            Your temporary password must be changed from the Profile page.
          </div>
        ) : null}
        <main className="p-5 lg:p-10">
          <SocketContext value={socket}>{children}</SocketContext>
        </main>
      </div>
    </div>
  );
}
