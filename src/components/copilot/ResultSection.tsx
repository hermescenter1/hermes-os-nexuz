import type { ReactNode } from "react";

/**
 * Reusable result panel for the Engineering Copilot (Phase 9A).
 * A titled surface card with an empty-state fallback. Kept presentational
 * so it can be reused for each analysis facet (domains, vendors, cases,
 * sources) and by future copilot sections.
 */
export function ResultSection({
  title,
  empty,
  isEmpty,
  children,
}: {
  title: string;
  empty: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{title}</h2>
      <div className="mt-4">
        {isEmpty ? (
          <p className="font-body text-sm text-muted/70">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** Small rounded chip used across copilot result sections. */
export function Chip({
  children,
  tone = "muted",
  ltr = false,
}: {
  children: ReactNode;
  tone?: "muted" | "signal";
  ltr?: boolean;
}) {
  const cls =
    tone === "signal"
      ? "border-signalDim text-signal"
      : "border-line text-muted";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-body text-[0.7rem] ${cls}`}
      {...(ltr ? { dir: "ltr" } : {})}
    >
      {children}
    </span>
  );
}
