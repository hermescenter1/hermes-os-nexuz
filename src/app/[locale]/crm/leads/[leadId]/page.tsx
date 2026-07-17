import type { Metadata }    from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { LeadDetailClient } from "@/components/crm/LeadDetailClient";

export const metadata: Metadata = noIndexMetadata("Lead Detail — CRM · Hermes OS");

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ locale: string; leadId: string }>;
}) {
  const { locale, leadId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("crm.leadDetail");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">{t("eyebrow")}</p>
        <h1 className="mt-1 text-xl font-bold text-ink">{t("title")}</h1>
      </div>
      <LeadDetailClient leadId={leadId} />
    </div>
  );
}
