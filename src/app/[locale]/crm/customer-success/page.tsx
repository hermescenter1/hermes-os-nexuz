import type { Metadata }    from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { CustomerSuccessClient }  from "@/components/crm/CustomerSuccessClient";

export const metadata: Metadata = noIndexMetadata("Customer Success — CRM · Hermes OS");

export default async function CustomerSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("crm.cs");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">{t("eyebrow")}</p>
        <h1 className="mt-1 text-xl font-bold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("desc")}</p>
      </div>
      <CustomerSuccessClient />
    </div>
  );
}
