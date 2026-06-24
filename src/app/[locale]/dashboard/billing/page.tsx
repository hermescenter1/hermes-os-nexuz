import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }        from "@/components/PageShell";
import { BillingDashboard } from "@/components/billing/BillingDashboard";
import { PageHeader }       from "@/components/ui/PageHeader";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("billing");

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          level="page"
        />
        <BillingDashboard />
      </div>
    </PageShell>
  );
}
