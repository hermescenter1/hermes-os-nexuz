import { cn } from "@/components/ds";

// PHASE 87F — distinct dashboard states. `DashboardSkeleton` is a loading
// placeholder hidden from assistive tech (aria-hidden + role=presentation) and
// motion-reduced via the ds-skeleton utility. `DataUnavailableState` is a
// calm, non-raw "data unavailable" panel (never a stack trace / query / raw
// API error) — distinct from an empty state.

export function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div className="py-4">
      {/* Announce a single polite loading label; hide the shimmer bars from AT. */}
      <p className="sr-only" role="status" aria-live="polite">{label}</p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ds-skeleton h-20 rounded-md" />
          ))}
        </div>
        <div className="ds-skeleton h-40 rounded-md" />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="ds-skeleton h-28 rounded-md lg:col-span-2" />
          <div className="ds-skeleton h-28 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function DataUnavailableState({
  title,
  body,
  hint,
  className,
}: {
  title: string;
  body: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center gap-2 ds-glass-card rounded-lg px-6 py-10 text-center",
        className,
      )}
    >
      <span aria-hidden="true" className="text-2xl text-text-muted">⚠</span>
      <p className="text-title font-semibold text-text-primary">{title}</p>
      <p className="max-w-md text-body-compact text-text-secondary">{body}</p>
      {hint ? <p className="max-w-md text-caption text-text-muted">{hint}</p> : null}
    </div>
  );
}
