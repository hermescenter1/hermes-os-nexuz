import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link }      from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/services",
    title:       p.services.title,
    description: p.services.description,
    keywords:    p.services.keywords,
  });
}

// slug (route) -> translation key (camelCase in messages)
const SERVICES = [
  { slug: "plc", key: "plc" },
  { slug: "scada-hmi", key: "scadaHmi" },
  { slug: "industrial-ai", key: "industrialAi" },
  { slug: "cybersecurity", key: "cybersecurity" },
  { slug: "knowledge-cloud", key: "knowledgeCloud" },
] as const;

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("services");
  const c = await getTranslations("common");

  return (
    <PageShell>
      <PageIntro
        eyebrow={t("eyebrow")}
        title={t("title")}
        strap={t("strap")}
        lede={t("lede")}
      />

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {SERVICES.map((s) => (
            <Link
              key={s.slug}
              href={`/services/${s.slug}`}
              className="group flex flex-col bg-surface p-7 transition-colors hover:bg-[#16202c]"
            >
              <h3 className="font-display text-lg font-semibold text-ink">
                {t(`items.${s.key}.name`)}
              </h3>
              <p className="mt-2 flex-1 font-body text-sm leading-relaxed text-muted">
                {t(`items.${s.key}.short`)}
              </p>
              <span className="mt-4 font-mono text-xs text-signal opacity-70 transition-opacity group-hover:opacity-100">
                {c("explore")} →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
