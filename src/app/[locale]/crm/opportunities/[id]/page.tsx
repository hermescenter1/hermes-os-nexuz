import type { Metadata }    from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { OpportunityDetailClient } from "@/components/crm/OpportunityDetailClient";

export const metadata: Metadata = noIndexMetadata("Opportunity — CRM · Hermes OS");

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("crm.oppDetail");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">{t("eyebrow")}</p>
        <h1 className="mt-1 text-xl font-bold text-ink">{t("title")}</h1>
      </div>
      <OpportunityDetailClient oppId={id} />
    </div>
  );
}
