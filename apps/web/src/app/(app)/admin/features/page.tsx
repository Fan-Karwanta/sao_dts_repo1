"use client";

import { AppWindow, SquaresFour } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Feature {
  id: string;
  key: string;
  name: string;
  isEnabled: boolean;
}

export default function FeaturesPage() {
  const queryClient = useQueryClient();
  const features = useQuery({
    queryKey: ["features"],
    queryFn: () => api<Feature[]>("/features"),
  });
  const update = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api(`/features/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["features"] }),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
        <SquaresFour size={16} />
        Module visibility
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary-strong">Page management</h1>
      <p className="mt-2 text-muted">Enable or disable modules without changing backend authorization.</p>
      <section className="mt-8 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white">
        {features.data?.map((feature) => (
          <div className="flex items-center justify-between gap-4 px-5 py-4" key={feature.id}>
            <div className="flex items-center gap-3">
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                  feature.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                }`}
              >
                <AppWindow size={18} />
              </span>
              <div>
                <p className="font-medium text-primary-strong">{feature.name}</p>
                <p className="mt-1 font-mono text-xs text-muted">{feature.key}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-semibold ${
                  feature.isEnabled ? "text-emerald-700" : "text-zinc-500"
                }`}
              >
                {feature.isEnabled ? "Enabled" : "Disabled"}
              </span>
              <button
                aria-checked={feature.isEnabled}
                aria-label={`Toggle ${feature.name}`}
                className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
                  feature.isEnabled ? "bg-emerald-500" : "bg-zinc-300"
                }`}
                disabled={update.isPending}
                onClick={() => update.mutate({ id: feature.id, isEnabled: !feature.isEnabled })}
                role="switch"
                type="button"
              >
                <span
                  className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${
                    feature.isEnabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
