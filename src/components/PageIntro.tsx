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
      <p className="signal-text text-signal">
        {eyebrow}
      </p>
      <h1 className="exec-display mt-4 max-w-3xl">
        {title}
      </h1>
      {strap && (
        <p className="mt-4 signal-text text-signal/90">
          {strap}
        </p>
      )}
      <p className="eng-body mt-5 max-w-2xl text-muted">
        {lede}
      </p>
    </div>
  );
}
