"use client";

import { LockKey, SignIn, User } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { FormField } from "@/components/form-field";
import { ApiError, api } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const login = useMutation({
    mutationFn: (input: { identifier: string; password: string }) =>
      api<{ user: AuthUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      router.replace("/dashboard");
    },
    onError: (failure: Error) => {
      if (failure instanceof ApiError && failure.code === "ACCOUNT_PENDING") {
        setError("");
        setNotice(failure.message);
      } else {
        setNotice("");
        setError(failure.message);
      }
    },
  });

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to monitor and update procurement document movement."
      alternateHref="/register"
      alternateLabel="Request a new account"
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          setNotice("");
          const data = new FormData(event.currentTarget);
          login.mutate({
            identifier: String(data.get("identifier")),
            password: String(data.get("password")),
          });
        }}
      >
        <FormField
          label="Username or email"
          name="identifier"
          required
          autoComplete="username"
          icon={<User size={18} />}
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          icon={<LockKey size={18} />}
        />
        {notice ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <button
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-white transition hover:bg-primary-strong disabled:opacity-60"
          disabled={login.isPending}
          type="submit"
        >
          <SignIn size={18} weight="bold" />
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}
