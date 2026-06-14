import { useTranslations } from "next-intl";

const MODULES = [
  "aiEngineer",
  "plcCopilot",
  "scadaStudio",
  "knowledgeCloud",
  "protectionCenter",
  "factoryDashboard",
] as const;

export function ModuleGrid() {
  const t = useTranslations("modules");
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="font-display text-3xl font-bold">{t("sectionTitle")}</h2>
      <p className="mt-3 max-w-2xl font-body text-muted">{t("sectionLede")}</p>

      <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <article
            key={m}
            className="group relative bg-surface p-7 transition-colors hover:bg-[#16202c]"
          >
            <span className="font-mono text-xs uppercase tracking-wider text-signal">
              {t(`${m}.tagline`)}
            </span>
            <h3 className="mt-3 font-display text-lg font-semibold text-ink">
              {t(`${m}.name`)}
            </h3>
            <p className="mt-2 font-body text-sm leading-relaxed text-muted">
              {t(`${m}.desc`)}
            </p>
            {/* leading rule mirrors automatically (logical inline-start) */}
            <span className="absolute inset-y-7 start-0 w-px bg-signalDim opacity-0 transition-opacity group-hover:opacity-100" />
          </article>
        ))}
      </div>
    </section>
  );
}
