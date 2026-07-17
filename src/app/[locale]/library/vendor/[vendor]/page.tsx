import { notFound }    from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/public-site";
import { Link }       from "@/i18n/navigation";
import { routing }    from "@/i18n/routing";
import { VENDORS }    from "@/lib/industrial/vendors";
import { vendorContent } from "@/lib/industrial/related";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    VENDORS.map((v) => ({ locale, vendor: v.id }))
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; vendor: string }> }) {
  const { locale, vendor } = await params;
  const v = VENDORS.find((x) => x.id === vendor);
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  const title = v ? `${v.name} — ${p.libraryVendor.title}` : p.libraryVendor.title;
  return buildMetadata({ locale, path: `/library/vendor/${vendor}`, title, description: p.libraryVendor.description, keywords: `${v?.name ?? ""}, ${p.libraryVendor.keywords}` });
}

export default async function VendorPage({
  params,
}: {
  params: Promise<{ locale: string; vendor: string }>;
}) {
  const { locale, vendor } = await params;
  setRequestLocale(locale);

  const v = VENDORS.find((x) => x.id === vendor);
  if (!v) notFound();

  const t = await getTranslations("library");
  const b = await getTranslations("brain");
  const k = await getTranslations("knowledge");
  const kc = await getTranslations("knowledgeCases");
  const { libraries, cases } = vendorContent(v.id);

  return (
    <PublicPageShell>
      <div className="mx-auto max-w-3xl px-6 pb-20 pt-14">
        <Link href="/library" className="font-mono text-xs text-muted hover:text-ink">
          <span className="back-arrow" aria-hidden="true" />{t("article.back")}
        </Link>

        <p className="mt-8 font-mono text-sm uppercase tracking-widest text-signal">
          {t("vendorPage.eyebrow")}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold md:text-4xl">
          {b(`vendors.${v.id}`)}
        </h1>
        <p className="mt-4 font-body text-lg leading-relaxed text-muted">
          {t(`vendorPage.descs.${v.id}`)}
        </p>

        {/* vendor libraries */}
        <h2 className="mt-12 font-display text-xl font-bold">
          {t("vendorPage.librariesTitle")}
        </h2>
        {libraries.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {libraries.map((l) => (
              <Link
                key={l.id}
                href={`/library/${l.id}`}
                className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-signal/40"
              >
                <h3 className="font-display text-sm font-semibold text-ink">
                  {k(`${l.id}.name`)}
                </h3>
                <p className="mt-1 font-body text-xs leading-relaxed text-muted">
                  {k(`${l.id}.summary`)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 font-body text-sm text-muted">
            {t("vendorPage.noLibraries")}
          </p>
        )}

        {/* vendor field cases */}
        <h2 className="mt-12 font-display text-xl font-bold">
          {t("vendorPage.casesTitle")}
        </h2>
        <ul className="mt-4 space-y-3">
          {cases.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-sm font-semibold text-ink">
                  {b(`cases.${c.id}`)}
                </span>
                <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-muted">
                  {b(`domains.${c.category}`)}
                </span>
              </div>
              <p className="mt-2 font-body text-xs leading-relaxed text-muted">
                {kc(c.id)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </PublicPageShell>
  );
}
