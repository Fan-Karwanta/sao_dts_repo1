"use client";

import {
  At,
  Briefcase,
  EnvelopeSimple,
  IdentificationCard,
  LockKey,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { FormField } from "@/components/form-field";
import { api } from "@/lib/api";

interface RegistrationRole {
  key: string;
  name: string;
}

export default function RegisterPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const roles = useQuery({
    queryKey: ["registration-roles"],
    queryFn: () => api<RegistrationRole[]>("/auth/registration-roles"),
  });
  const registration = useMutation({
    mutationFn: (input: object) =>
      api("/auth/register", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      setError("");
      setMessage("Your request was submitted and is waiting for administrator approval.");
    },
    onError: (failure: Error) => {
      setMessage("");
      setError(failure.message);
    },
  });

  return (
    <AuthCard
      title="Request access"
      description="Create an account request for review by the SAO system administrator."
      alternateHref="/login"
      alternateLabel="Return to sign in"
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          registration.mutate({
            fullName: String(data.get("fullName")),
            username: String(data.get("username")),
            email: String(data.get("email")),
            officeDesignation: String(data.get("officeDesignation")),
            requestedRoleKey: String(data.get("requestedRoleKey")),
            password: String(data.get("password")),
            confirmPassword: String(data.get("confirmPassword")),
            termsAccepted: data.get("termsAccepted") === "on",
            termsVersion: "1.0",
          });
        }}
      >
        <FormField label="Full name" name="fullName" required autoComplete="name" icon={<IdentificationCard size={18} />} />
        <FormField label="Username" name="username" required autoComplete="username" icon={<At size={18} />} />
        <FormField label="Email" name="email" type="email" required autoComplete="email" icon={<EnvelopeSimple size={18} />} />
        <FormField label="Office / designation" name="officeDesignation" icon={<Briefcase size={18} />} />
        <label className="grid gap-2 text-sm font-medium text-primary-strong">
          Requested role
          <select
            className="h-11 rounded-xl border border-border bg-white px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
            name="requestedRoleKey"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Select a role
            </option>
            {roles.data?.map((role) => (
              <option key={role.key} value={role.key}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <FormField
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={12}
          hint="At least 12 characters with an uppercase letter, a lowercase letter, and a number."
          icon={<LockKey size={18} />}
        />
        <FormField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          icon={<LockKey size={18} />}
        />
        <label className="flex items-start gap-3 text-sm leading-6 text-muted">
          <input className="mt-1" name="termsAccepted" type="checkbox" required />
          I agree to the system terms and accountable-use policy.
        </label>
        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {message ? (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>
        ) : null}
        <button
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-white transition hover:bg-primary-strong disabled:opacity-60"
          disabled={registration.isPending}
          type="submit"
        >
          <PaperPlaneTilt size={18} weight="bold" />
          {registration.isPending ? "Submitting…" : "Submit request"}
        </button>
      </form>
    </AuthCard>
  );
}
