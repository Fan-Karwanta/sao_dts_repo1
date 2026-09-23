"use client";

import { Buildings, CheckCircle, Key, LockKey, UserCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FormField } from "@/components/form-field";
import { api } from "@/lib/api";
import type { AuthContext } from "@/lib/types";

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const auth = useQuery({
    queryKey: ["auth"],
    queryFn: () => api<AuthContext>("/auth/me"),
  });
  const changePassword = useMutation({
    mutationFn: (input: object) =>
      api("/auth/password", { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: async () => {
      setMessage("Password changed. Other sessions were signed out.");
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-semibold tracking-tight text-primary-strong">Profile and security</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="flex items-center gap-2 font-semibold text-primary-strong">
            <UserCircle size={20} className="text-primary" />
            Account
          </h2>
          <dl className="mt-5 grid gap-4 text-sm">
            <div><dt className="text-muted">Name</dt><dd className="mt-1 font-medium">{auth.data?.user.fullName}</dd></div>
            <div><dt className="text-muted">Username</dt><dd className="mt-1 font-medium">{auth.data?.user.username}</dd></div>
            <div><dt className="text-muted">Email</dt><dd className="mt-1 font-medium">{auth.data?.user.email}</dd></div>
            <div>
              <dt className="flex items-center gap-1.5 text-muted"><Buildings size={14} />Departments</dt>
              <dd className="mt-1 font-medium">{auth.data?.user.departmentKeys.join(", ") || "System-wide"}</dd>
            </div>
          </dl>
        </section>
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="flex items-center gap-2 font-semibold text-primary-strong">
            <LockKey size={20} className="text-primary" />
            Change password
          </h2>
          <form
            className="mt-5 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setMessage("");
              const data = new FormData(event.currentTarget);
              changePassword.mutate({
                currentPassword: String(data.get("currentPassword")),
                password: String(data.get("password")),
                confirmPassword: String(data.get("confirmPassword")),
              });
            }}
          >
            <FormField label="Current password" name="currentPassword" type="password" required icon={<LockKey size={18} />} />
            <FormField label="New password" name="password" type="password" required icon={<Key size={18} />} />
            <FormField label="Confirm new password" name="confirmPassword" type="password" required icon={<Key size={18} />} />
            {changePassword.error ? <p className="text-sm text-red-700">{changePassword.error.message}</p> : null}
            {message ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-700">
                <CheckCircle size={16} weight="fill" />
                {message}
              </p>
            ) : null}
            <button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-white transition hover:bg-primary-strong" type="submit">
              <Key size={16} weight="bold" />
              Update password
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
