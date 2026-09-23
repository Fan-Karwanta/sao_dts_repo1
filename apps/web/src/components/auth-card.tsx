import Link from "next/link";

export function AuthCard({
  title,
  description,
  alternateHref,
  alternateLabel,
  children,
}: {
  title: string;
  description: string;
  alternateHref: string;
  alternateLabel: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-white p-7 shadow-[0_24px_80px_rgba(17,53,32,0.12)] sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-accent font-black text-primary-strong">
            SAO
          </div>
          <div>
            <p className="font-semibold text-primary-strong">SAO Document Tracker</p>
            <p className="text-xs text-muted">Secure and organized monitoring</p>
          </div>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-primary-strong">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        <div className="mt-8">{children}</div>
        <p className="mt-7 text-center text-sm text-muted">
          <Link className="font-semibold text-primary hover:underline" href={alternateHref}>
            {alternateLabel}
          </Link>
        </p>
      </section>
    </main>
  );
}
