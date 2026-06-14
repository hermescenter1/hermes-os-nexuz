export function PageIntro({
  eyebrow,
  title,
  strap,
  lede,
}: {
  eyebrow: string;
  title: string;
  /** Optional technical strap line (e.g. "PLC • SCADA • HMI"), set in mono. */
  strap?: string;
  lede: string;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 md:pt-20">
      <p className="font-mono text-sm uppercase tracking-widest text-signal">
        {eyebrow}
      </p>
      <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight md:text-5xl">
        {title}
      </h1>
      {strap && (
        <p className="mt-4 font-mono text-sm tracking-wide text-signal/90">
          {strap}
        </p>
      )}
      <p className="mt-5 max-w-2xl font-body text-lg leading-relaxed text-muted">
        {lede}
      </p>
    </div>
  );
}
