"use client";

import { LockSimple, ShieldCheck } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";

interface Permission {
  id: string;
  key: string;
  name: string;
}

interface Role {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  rolePermissions: Array<{ permission: Permission }>;
}

export default function RolesPage() {
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/roles") });
  const permissions = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api<Permission[]>("/permissions"),
  });
  const update = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) =>
      api(`/roles/${roleId}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissionIds }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["roles"] }),
  });

  return (
    <div className="mx-auto max-w-7xl">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
        <ShieldCheck size={16} />
        Access control
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary-strong">Roles and permissions</h1>
      <p className="mt-2 text-muted">Configure API-enforced privileges for every system role.</p>
      <div className="mt-8 overflow-auto rounded-2xl border border-border bg-white">
        <table className="min-w-max text-left text-sm">
          <thead className="bg-primary-strong text-white">
            <tr>
              <th className="sticky left-0 bg-primary-strong px-4 py-3">Permission</th>
              {roles.isLoading
                ? Array.from({ length: 4 }, (_, index) => (
                    <th className="min-w-40 px-4 py-3" key={index}>
                      <Skeleton className="mx-auto h-4 w-20" onDark />
                    </th>
                  ))
                : null}
              {roles.data?.map((role) => (
                <th className="min-w-40 px-4 py-3 text-center" key={role.id}>
                  <span className="inline-flex items-center gap-1.5">
                    {role.name}
                    {role.key === "admin" ? <LockSimple size={13} weight="bold" /> : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {roles.isLoading || permissions.isLoading
              ? Array.from({ length: 8 }, (_, index) => (
                  <tr key={index}>
                    <td className="sticky left-0 bg-white px-4 py-3">
                      <Skeleton className="h-3.5 w-40" />
                    </td>
                    {Array.from({ length: 4 }, (_, cell) => (
                      <td className="px-4 py-3" key={cell}>
                        <Skeleton className="mx-auto size-4 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            {!roles.isLoading && permissions.data?.map((permission) => (
              <tr key={permission.id}>
                <td className="sticky left-0 bg-white px-4 py-3 font-mono text-xs">{permission.key}</td>
                {roles.data?.map((role) => {
                  const selected = role.rolePermissions.some((item) => item.permission.id === permission.id);
                  return (
                    <td className="px-4 py-3 text-center" key={role.id}>
                      <input
                        className="size-4 accent-primary"
                        checked={selected}
                        disabled={role.key === "admin" || update.isPending}
                        onChange={() => {
                          const current = role.rolePermissions.map((item) => item.permission.id);
                          update.mutate({
                            roleId: role.id,
                            permissionIds: selected
                              ? current.filter((id) => id !== permission.id)
                              : [...current, permission.id],
                          });
                        }}
                        type="checkbox"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
