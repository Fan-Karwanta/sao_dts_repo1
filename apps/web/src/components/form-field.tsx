"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

interface FormFieldProps {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  minLength?: number;
  hint?: string;
  icon?: ReactNode;
}

export function FormField({
  label,
  name,
  type = "text",
  required = false,
  autoComplete,
  defaultValue,
  minLength,
  hint,
  icon,
}: FormFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="grid gap-2 text-sm font-medium text-primary-strong">
      <label htmlFor={name}>{label}</label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            {icon}
          </span>
        ) : null}
        <input
          className={`h-11 w-full rounded-xl border border-border bg-white text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 ${
            icon ? "pl-10" : "pl-3"
          } ${isPassword ? "pr-11" : "pr-3"}`}
          id={name}
          name={name}
          type={isPassword && showPassword ? "text" : type}
          required={required}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          minLength={minLength}
        />
        {isPassword ? (
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-primary"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
          </button>
        ) : null}
      </div>
      {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
    </div>
  );
}
