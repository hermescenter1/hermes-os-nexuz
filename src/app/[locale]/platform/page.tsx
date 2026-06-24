import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link }         from "@/i18n/navigation";
import { PageShell }    from "@/components/PageShell";
import { PageIntro }    from "@/components/PageIntro";
import { ModuleGrid }   from "@/components/ModuleGrid";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/platform", title: p.platform.title, description: p.platform.description, keywords: p.platform.keywords });
}

const PRINCIPLES = ["bilingual", "modular", "onprem", "vendorNeutral"] as const;

export default async function PlatformPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("platform");
  const c = await getTranslations("common");

  return (
    <PageShell>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />

      <ModuleGrid />

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="font-display text-2xl font-bold">{t("principlesTitle")}</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p} className="rounded-xl border border-line bg-surface p-6">
              <h3 className="font-display text-base font-semibold text-ink">
                {t(`principles.${p}.name`)}
              </h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-muted">
                {t(`principles.${p}.desc`)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <Link
            href="/architecture"
            className="inline-flex rounded-md border border-line px-5 py-2.5 font-body text-sm text-ink transition-colors hover:border-signal/50"
          >
            {c("viewArchitecture")}
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
