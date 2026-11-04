import { getTranslations } from "next-intl/server";

// THIN-CONTENT lane — a server-rendered explainer placed under an interactive
// public tool (/brain, /copilot) or a client-loaded catalog (/library), whose
// own content only arrives after hydration. The copy lives under
// `architecture.guides.<key>` because `architecture` is a server-only
// namespace (see src/i18n/client-namespaces.json): adding it costs the client
// payload of these sections nothing.

interface NamedBullet {
  name: string;
  desc: string;
}

interface GuideContent {
  title: string;
  lede?: string;
  body?: string[];
  steps?: NamedBullet[];
  boundaryTitle?: string;
  boundary?: string;
}

export type PageGuideKey = "brain" | "copilot" | "library";

export async function PageGuide({ guideKey }: { guideKey: PageGuideKey }) {
  const t = await getTranslations("architecture");
  const g = t.raw(`guides.${guideKey}`) as GuideContent;
  const headingId = `page-guide-${guideKey}`;

  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-6xl px-6 py-12">
      <h2 id={headingId} className="font-display text-xl font-semibold text-ink">
        {g.title}
      </h2>
      {g.lede ? (
        <p className="mt-4 max-w-3xl font-body text-base leading-relaxed text-muted">{g.lede}</p>
      ) : null}

      {g.body ? (
        <div className="mt-4 max-w-3xl space-y-4">
          {g.body.map((paragraph) => (
            <p key={paragraph} className="font-body text-base leading-relaxed text-muted">
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}

      {g.steps ? (
        <ol className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {g.steps.map((step, i) => (
            <li key={step.name} className="rounded-xl border border-line bg-surface p-5">
              <span className="font-mono text-sm text-signal">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 font-display text-base font-semibold text-ink">{step.name}</h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-muted">{step.desc}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {g.boundaryTitle && g.boundary ? (
        <div className="mt-8 max-w-3xl">
          <h3 className="font-display text-base font-semibold text-ink">{g.boundaryTitle}</h3>
          <p className="mt-2 font-body text-base leading-relaxed text-muted">{g.boundary}</p>
        </div>
      ) : null}
    </section>
  );
}
