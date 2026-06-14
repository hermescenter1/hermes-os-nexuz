import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { ArchitectureFlow } from "@/components/ArchitectureFlow";

const FUTURE = [
  "opcua",
  "modbus",
  "mqtt",
  "historian",
  "twin",
  "predictive",
] as const;

export default async function ArchitecturePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("architecture");

  return (
    <PageShell>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />

      <section className="mx-auto max-w-6xl px-6 py-16">
        <ArchitectureFlow />

        <p className="mx-auto mt-12 max-w-2xl rounded-lg border border-signalDim bg-surface px-5 py-4 text-center font-body text-sm text-muted">
          {t("note")}
        </p>

        {/* Future Platform Capabilities — designed-in, delivered Phase 2+ */}
        <div className="mt-24">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-2xl font-bold text-ink">
              {t("future.title")}
            </h2>
            <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-xs text-muted">
              {t("future.badge")}
            </span>
          </div>
          <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted">
            {t("future.lede")}
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {FUTURE.map((k) => (
              <div key={k} className="bg-surface p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {t(`future.items.${k}.name`)}
                  </h3>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted/50"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 font-body text-sm leading-relaxed text-muted">
                  {t(`future.items.${k}.desc`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
