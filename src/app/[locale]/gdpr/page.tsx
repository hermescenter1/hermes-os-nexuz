import { setRequestLocale, getTranslations } from "next-intl/server";
import { LegalPageShell } from "@/components/compliance/LegalPageShell";
import { PublicPageShell } from "@/components/public-site";
import { Link }           from "@/i18n/navigation";
import { buildMetadata }  from "@/lib/seo/metadata";
import { SITE_NAME }      from "@/lib/seo/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/gdpr", title: p.gdpr.title, description: p.gdpr.description, keywords: p.gdpr.keywords });
}

/** GDPR article number and the `legalPages.gdpr` key prefix of each right. */
const RIGHTS = [
  { art: 15, key: "access" },
  { art: 16, key: "rectification" },
  { art: 17, key: "erasure" },
  { art: 18, key: "restriction" },
  { art: 20, key: "portability" },
  { art: 21, key: "objection" },
] as const;

export default async function GdprPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The copy lives in `legalPages.gdpr` for fa/en/de; it was hard-coded
  // English, so /fa/gdpr and /de/gdpr served English text.
  const t = await getTranslations({ locale, namespace: "legalPages.gdpr" });

  return (
    <PublicPageShell ambient={1}>
      <LegalPageShell title={t("title")} eyebrow={t("eyebrow")} version="1.0" effective={t("effective")}>
        <p className="text-ink/80">{t("intro", { site: SITE_NAME })}</p>

        <div className="space-y-4">
          {RIGHTS.map((r) => (
            <div key={r.art} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-muted border border-line rounded px-1.5 py-0.5">{t("article", { n: r.art })}</span>
                    <h3 className="font-mono text-sm font-semibold text-ink">{t(`${r.key}Title`)}</h3>
                  </div>
                  <p className="text-[12px] text-ink/75 leading-relaxed">{t(`${r.key}Desc`)}</p>
                </div>
                <Link
                  href="/data-request"
                  className="shrink-0 text-[10px] font-mono text-signal hover:underline whitespace-nowrap"
                >
                  {t(`${r.key}Action`)} <span aria-hidden="true" className="rtl:inline-block rtl:-scale-x-100">→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">{t("responseTitle")}</h2>
          <p>{t("responseBody")}</p>
        </section>

        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">{t("authorityTitle")}</h2>
          <p>
            {t.rich("authorityBody", {
              url: "edpb.europa.eu",
              site: (c) => <span className="text-ink" dir="ltr">{c}</span>,
            })}
          </p>
        </section>
      </LegalPageShell>
    </PublicPageShell>
  );
}
