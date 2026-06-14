import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { ModuleGrid } from "@/components/ModuleGrid";

const CAPS = ["plc", "scada", "hmi", "copilot", "security", "library"] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <PageShell>
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        {/* status strip — honest framing of the demo */}
        <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-signalDim bg-surface px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          <span className="font-mono text-xs text-signal">{t("status.label")}</span>
          <span className="font-mono text-xs text-muted">· {t("status.note")}</span>
        </div>

        <p className="font-mono text-sm uppercase tracking-widest text-muted">
          {t("eyebrow")}
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight md:text-6xl">
          {t("title")}
        </h1>
        <p className="mt-6 max-w-2xl font-body text-lg leading-relaxed text-muted">
          {t("lede")}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/platform"
            className="rounded-md bg-signal px-5 py-2.5 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            {t("primaryCta")}
          </Link>
          <Link
            href="/architecture"
            className="rounded-md border border-line px-5 py-2.5 font-body text-sm text-ink transition-colors hover:border-signal/50"
          >
            {t("secondaryCta")}
          </Link>
        </div>

        <h2 className="mt-20 font-display text-2xl font-bold">
          {t("capabilitiesTitle")}
        </h2>
        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {CAPS.map((c) => (
            <div key={c} className="bg-surface p-6">
              <h3 className="font-display text-base font-semibold text-ink">
                {t(`capabilities.${c}.name`)}
              </h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-muted">
                {t(`capabilities.${c}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <ModuleGrid />
    </PageShell>
  );
}
