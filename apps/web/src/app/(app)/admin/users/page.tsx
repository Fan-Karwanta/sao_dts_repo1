"use client";

import {
  Check,
  EnvelopeSimple,
  Key,
  LockOpen,
  Prohibit,
  Tray,
  UserPlus,
  UserSwitch,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";
import type { Department } from "@/lib/types";

interface Role {
  id: string;
  key: string;
  name: string;
}

interface User {
  id: string;
  publicId: string;
  fullName: string;
  username: string;
  email: string;
  officeDesignation: string | null;
  status: "ACTIVE" | "BLOCKED" | "PENDING" | "REJECTED";
  userRoles: Array<{ role: Role; department: Department | null }>;
}

interface RegistrationRequest {
  id: string;
  fullName: string;
  username: string;
  email: string;
  officeDesignation: string | null;
  createdAt: string;
  requestedRole: { key: string; name: string } | null;
}

const STATUS_TONE: Record<User["status"], string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  BLOCKED: "bg-red-100 text-red-700",
  PENDING: "bg-amber-100 text-amber-800",
  REJECTED: "bg-zinc-100 text-zinc-600",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users") });
  const registrations = useQuery({
    queryKey: ["registration-requests"],
    queryFn: () => api<RegistrationRequest[]>("/registration-requests"),
  });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/roles") });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Department[]>("/departments"),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["registration-requests"] }),
    ]);
  };
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      api(`/registration-requests/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason: action === "reject" ? "Rejected by administrator" : undefined }),
      }),
    onSuccess: refresh,
  });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "BLOCKED" }) =>
      api(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: refresh,
  });
  const assignRole = useMutation({
    mutationFn: (input: { userId: string; roleId: string; departmentId: string | null }) =>
      api(`/users/${input.userId}/roles`, {
        method: "POST",
        body: JSON.stringify({ roleId: input.roleId, departmentId: input.departmentId }),
      }),
    onSuccess: refresh,
  });
  const impersonate = useMutation({
    mutationFn: (user: User) =>
      api("/auth/impersonation", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, reason: `Support requested for ${user.username}` }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
  const resetPassword = useMutation({
    mutationFn: (userId: string) =>
      api<{ temporaryPassword: string }>("/auth/admin-reset-password", {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    onSuccess: (result) => setTemporaryPassword(result.temporaryPassword),
  });

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-3xl font-semibold tracking-tight text-primary-strong">User management</h1>
      <p className="mt-2 text-muted">Review requests, control access, assign roles, and provide audited support.</p>

      {temporaryPassword ? (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="flex items-center gap-2 font-semibold">
            <Key size={16} weight="bold" />
            One-time temporary password
          </p>
          <code className="mt-2 block select-all rounded-lg bg-white p-3">{temporaryPassword}</code>
          <p className="mt-2">Copy it now. It is not stored in recoverable form and the user must change it.</p>
        </div>
      ) : null}

      <section className="mt-8 rounded-2xl border border-border bg-white">
        <div className="border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-primary-strong">
            <Tray size={18} className="text-primary" />
            Pending registrations
          </h2>
        </div>
        <div className="divide-y divide-border">
          {registrations.data?.map((request) => (
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" key={request.id}>
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {initials(request.fullName)}
                </span>
                <div>
                  <p className="font-medium text-primary-strong">{request.fullName}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    <EnvelopeSimple size={13} />
                    {request.email} · {request.requestedRole?.name}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-strong"
                  onClick={() => review.mutate({ id: request.id, action: "approve" })}
                  type="button"
                >
                  <Check size={14} weight="bold" />
                  Approve
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                  onClick={() => review.mutate({ id: request.id, action: "reject" })}
                  type="button"
                >
                  <X size={14} weight="bold" />
                  Reject
                </button>
              </div>
            </div>
          ))}
          {registrations.isLoading
            ? Array.from({ length: 2 }, (_, index) => (
                <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" key={index}>
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                    <div>
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="mt-2 h-3 w-48" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-24 rounded-lg" />
                    <Skeleton className="h-9 w-20 rounded-lg" />
                  </div>
                </div>
              ))
            : null}
          {!registrations.isLoading && !registrations.data?.length ? <p className="p-5 text-sm text-muted">No pending requests.</p> : null}
        </div>
      </section>

      <section className="mt-8 overflow-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-primary-strong text-white">
            <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Access</th><th className="px-4 py-3">Assign role</th><th className="px-4 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.isLoading
              ? Array.from({ length: 5 }, (_, index) => (
                  <tr key={index}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-9 shrink-0 rounded-full" />
                        <div>
                          <Skeleton className="h-3.5 w-36" />
                          <Skeleton className="mt-2 h-3 w-44" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4"><Skeleton className="h-3.5 w-40" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-9 w-52 rounded-lg" /></td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Skeleton className="h-9 w-20 rounded-lg" />
                        <Skeleton className="h-9 w-28 rounded-lg" />
                        <Skeleton className="h-9 w-32 rounded-lg" />
                      </div>
                    </td>
                  </tr>
                ))
              : null}
            {users.data?.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(user.fullName)}
                    </span>
                    <div>
                      <p className="font-medium text-primary-strong">{user.fullName}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                        {user.email}
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_TONE[user.status]}`}>
                          {user.status}
                        </span>
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-muted">{user.userRoles.map(({ role, department }) => `${role.name}${department ? ` (${department.name})` : ""}`).join(", ") || "No role"}</td>
                <td className="px-4 py-4">
                  <form className="flex gap-2" onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    assignRole.mutate({ userId: user.id, roleId: String(data.get("roleId")), departmentId: String(data.get("departmentId")) || null });
                  }}>
                    <select className="rounded-lg border border-border px-2 py-2" name="roleId" required defaultValue=""><option value="" disabled>Role</option>{roles.data?.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
                    <select className="rounded-lg border border-border px-2 py-2" name="departmentId" defaultValue=""><option value="">No department</option>{departments.data?.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
                    <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 font-semibold transition hover:bg-background" type="submit">
                      <UserPlus size={14} />
                      Assign
                    </button>
                  </form>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 transition hover:bg-background"
                      onClick={() => updateStatus.mutate({ id: user.id, status: user.status === "BLOCKED" ? "ACTIVE" : "BLOCKED" })}
                      type="button"
                    >
                      {user.status === "BLOCKED" ? <LockOpen size={14} /> : <Prohibit size={14} />}
                      {user.status === "BLOCKED" ? "Unblock" : "Block"}
                    </button>
                    <button
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 transition hover:bg-background"
                      onClick={() => impersonate.mutate(user)}
                      type="button"
                    >
                      <UserSwitch size={14} />
                      Impersonate
                    </button>
                    <button
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 transition hover:bg-background"
                      onClick={() => resetPassword.mutate(user.id)}
                      type="button"
                    >
                      <Key size={14} />
                      Reset password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
