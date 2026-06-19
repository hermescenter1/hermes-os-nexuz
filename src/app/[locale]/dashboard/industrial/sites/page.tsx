import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }  from "@/components/PageShell";
import { SitesList }  from "@/components/industrial/SitesList";

export default async function IndustrialSitesPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("industrial");

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <div className="mb-8">
          <p className="font-mono text-sm uppercase tracking-widest text-signal">
            {(t as unknown as (k: string) => string)("sites.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {(t as unknown as (k: string) => string)("sites.title")}
          </h1>
        </div>
        <SitesList />
      </div>
    </PageShell>
  );
}
