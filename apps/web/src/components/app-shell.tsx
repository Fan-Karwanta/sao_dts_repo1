"use client";

import {
  Bell,
  CaretLeft,
  CaretRight,
  Gauge,
  LockKey,
  Scroll,
  ShieldCheck,
  SignOut,
  SquaresFour,
  Table,
  TreeStructure,
  UserCircle,
  UserSwitch,
  Users,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { io } from "socket.io-client";
import { SocketContext } from "@/components/realtime";
import { Skeleton } from "@/components/skeleton";
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

const SIDEBAR_COLLAPSED_KEY = "sao.sidebar.collapsed";
const sidebarListeners = new Set<() => void>();

function subscribeSidebar(callback: () => void) {
  sidebarListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    sidebarListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

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
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    () => window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
    () => false,
  );

  const toggleCollapsed = () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!collapsed));
    sidebarListeners.forEach((listener) => listener());
  };

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
    return <AppShellSkeleton />;
  }

  const { user, actor, impersonationId } = auth.data;
  const permissions = new Set(user.permissionKeys);
  const features = new Set(enabledFeatures.data?.map(({ key }) => key));
  const unreadCount = notifications.data?.filter((item) => !item.readAt).length ?? 0;
  return (
    <div
      className={`min-h-screen bg-background transition-[grid-template-columns] duration-200 lg:grid ${
        collapsed ? "lg:grid-cols-[84px_1fr]" : "lg:grid-cols-[280px_1fr]"
      }`}
    >
      <aside
        className={`flex flex-col border-b border-white/10 bg-primary-strong p-5 text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 ${
          collapsed ? "lg:px-4 lg:py-7" : "lg:p-7"
        }`}
      >
        <div className={`flex items-center gap-3 ${collapsed ? "lg:flex-col" : ""}`}>
          <Image
            src="/dogh_logo.png"
            alt="Davao Occidental General Hospital logo"
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-2xl object-cover"
          />
          <div className={collapsed ? "lg:hidden" : ""}>
            <p className="font-semibold">SAO DTS</p>
            <p className="text-xs text-emerald-100/65">Workspace</p>
          </div>
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`hidden size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-emerald-50/70 transition hover:bg-white/10 hover:text-white lg:flex ${
              collapsed ? "" : "lg:ml-auto"
            }`}
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            type="button"
          >
            {collapsed ? (
              <CaretRight size={16} weight="bold" />
            ) : (
              <CaretLeft size={16} weight="bold" />
            )}
          </button>
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
                  aria-label={label}
                  className={`relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                    active ? "bg-white/12 font-semibold text-white" : "text-emerald-50/70 hover:bg-white/5 hover:text-white"
                  } ${collapsed ? "lg:justify-center lg:px-3" : ""}`}
                  href={href}
                  key={href}
                  title={label}
                >
                  <Icon className="shrink-0" size={18} weight={active ? "fill" : "regular"} />
                  <span className={`min-w-0 flex-1 truncate ${collapsed ? "lg:hidden" : ""}`}>{label}</span>
                  {href === "/notifications" && unreadCount ? (
                    <>
                      <span
                        className={`rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-primary-strong ${
                          collapsed ? "lg:hidden" : ""
                        }`}
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                      {collapsed ? (
                        <span className="absolute right-1.5 top-1.5 hidden size-2 rounded-full bg-accent lg:block" />
                      ) : null}
                    </>
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
              className="cursor-pointer font-semibold underline"
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
            className="group flex cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-primary-strong transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={() => setConfirmSignOut(true)}
            type="button"
          >
            <SignOut className="transition-transform group-hover:translate-x-0.5" size={16} />
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
      {confirmSignOut ? (
        <SignOutDialog
          error={logout.isError}
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={() => logout.mutate()}
          pending={logout.isPending}
        />
      ) : null}
    </div>
  );
}

function SignOutDialog({
  error,
  onCancel,
  onConfirm,
  pending,
}: {
  error: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close sign out confirmation"
        className="absolute inset-0 cursor-default bg-primary-strong/40 backdrop-blur-sm"
        onClick={onCancel}
        type="button"
      />
      <div
        aria-labelledby="sign-out-dialog-title"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <div className="flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <SignOut size={20} weight="bold" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-primary-strong" id="sign-out-dialog-title">
          Sign out of SAO DTS?
        </h2>
        <p className="mt-1 text-sm text-muted">
          You will need to sign in again to continue working in this workspace.
        </p>
        {error ? (
          <p className="mt-3 text-sm font-medium text-red-600">Sign out failed. Please try again.</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            autoFocus
            className="cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-semibold text-primary-strong transition hover:bg-background"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="cursor-pointer rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppShellSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading workspace"
      className="min-h-screen bg-background lg:grid lg:grid-cols-[280px_1fr]"
    >
      <aside className="flex flex-col border-b border-white/10 bg-primary-strong p-5 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:p-7">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-2xl" onDark />
          <div>
            <Skeleton className="h-4 w-20" onDark />
            <Skeleton className="mt-2 h-3 w-16" onDark />
          </div>
          <Skeleton className="ml-auto hidden size-8 rounded-lg lg:block" onDark />
        </div>
        <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:mt-12 lg:grid-cols-1">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton className="h-11 rounded-xl" key={index} onDark />
          ))}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-border bg-white px-6 py-4 lg:px-10">
          <div>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <Skeleton className="h-9 w-28 rounded-xl" />
        </header>
        <main className="p-5 lg:p-10">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-3 h-8 w-72" />
          <Skeleton className="mt-3 h-4 w-56" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                className="flex items-center gap-4 rounded-2xl border border-border bg-white p-5"
                key={index}
              >
                <Skeleton className="size-12 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="mt-2 h-7 w-12" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-white">
            <div className="border-b border-border px-5 py-4">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }, (_, index) => (
                <div className="flex items-center justify-between gap-4 px-5 py-4" key={index}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Skeleton className="size-10 shrink-0 rounded-xl" />
                    <div>
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="mt-2 h-3 w-52" />
                    </div>
                  </div>
                  <div className="hidden shrink-0 sm:block">
                    <Skeleton className="ml-auto h-3.5 w-28" />
                    <Skeleton className="mt-2 h-3 w-36" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
