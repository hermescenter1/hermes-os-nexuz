/**
 * PHASE 93 — Control-Room loading skeleton. A calm, premium placeholder that
 * mirrors the real layout while live probes run — never fake numbers.
 */
import { cardVariants } from "@/components/ds/logic";
import { cn } from "@/components/ds/cn";

function Block({ className }: { className?: string }) {
  return <div className={cn("ds-skeleton rounded-md bg-surface-interactive/60", className)} aria-hidden="true" />;
}

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8" aria-busy="true" aria-live="polite">
      <Block className="h-4 w-28" />
      <Block className="mt-3 h-8 w-72" />
      <Block className="mt-2 h-4 w-full max-w-xl" />

      <div className={cn(cardVariants("hero", { padded: true }), "mt-6 flex items-center gap-4")}>
        <Block className="h-3 w-3 rounded-full" />
        <div className="flex-1">
          <Block className="h-5 w-40" />
          <Block className="mt-2 h-3 w-56" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={cn(cardVariants("soft", { padded: true }))}>
            <Block className="h-3 w-16" />
            <Block className="mt-2 h-7 w-20" />
            <Block className="mt-2 h-3 w-12" />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn(cardVariants("standard", { padded: true }))}>
            <Block className="h-4 w-40" />
            <Block className="mt-4 h-24 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
