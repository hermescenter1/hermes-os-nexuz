/**
 * Loading placeholder for the customer pages: the shape of the page while the
 * server reads, never a number or a name that is not there yet.
 */
function Block({ className }: { className: string }) {
  return <div className={`ds-skeleton rounded-md bg-surface-interactive ${className}`} aria-hidden="true" />;
}

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8 sm:px-8" aria-busy="true" aria-live="polite">
      <Block className="h-4 w-28" />
      <Block className="h-8 w-72" />
      <Block className="h-4 w-full max-w-xl" />
      <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <Block className="h-4 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Block key={i} className="h-6 w-full" />
        ))}
      </div>
    </div>
  );
}
