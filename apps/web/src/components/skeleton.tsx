export function Skeleton({
  className = "",
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded ${onDark ? "bg-white/15" : "bg-foreground/10"} ${className}`}
    />
  );
}
