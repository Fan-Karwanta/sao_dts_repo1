import Image from "next/image";
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
    <main className="relative grid min-h-screen place-items-center p-4">
      <Image
        src="/dogh_background.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
      <section className="relative w-full max-w-lg rounded-3xl border border-border bg-white p-7 shadow-[0_24px_80px_rgba(17,53,32,0.12)] sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <Image
            src="/dogh_logo.png"
            alt="Davao Occidental General Hospital logo"
            width={48}
            height={48}
            className="size-12 rounded-2xl object-cover"
          />
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
