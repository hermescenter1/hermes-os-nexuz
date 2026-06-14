import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";

const POINTS = ["one", "two", "three"] as const;

// Renders a service detail page from a translation key under services.items.
export async function ServiceDetail({
  locale,
  serviceKey,
}: {
  locale: string;
  serviceKey: string;
}) {
  setRequestLocale(locale);
  const t = await getTranslations(`services.items.${serviceKey}`);
  const s = await getTranslations("services");
  const c = await getTranslations("common");

  return (
    <PageShell>
      <PageIntro eyebrow={s("eyebrow")} title={t("title")} lede={t("lede")} />

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {POINTS.map((p, i) => (
            <div key={p} className="rounded-xl border border-line bg-surface p-6">
              <span className="font-mono text-sm text-signal">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-display text-base font-semibold text-ink">
                {t(`points.${p}.name`)}
              </h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-muted">
                {t(`points.${p}.desc`)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <Link
            href="/services"
            className="inline-flex rounded-md border border-line px-5 py-2.5 font-body text-sm text-ink transition-colors hover:border-signal/50"
          >
            <span className="back-arrow" aria-hidden="true" />{c("backToServices")}
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
