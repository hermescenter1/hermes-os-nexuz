import type { Metadata }    from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { LeadListClient }  from "@/components/crm/LeadListClient";

export const metadata: Metadata = noIndexMetadata("Leads — CRM · Hermes OS");

export default async function CrmLeadsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("crm.leads");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">{t("eyebrow")}</p>
        <h1 className="mt-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("desc")}</p>
      </div>
      <LeadListClient />
    </div>
  );
}
