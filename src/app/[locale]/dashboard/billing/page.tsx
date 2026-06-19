import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }        from "@/components/PageShell";
import { BillingDashboard } from "@/components/billing/BillingDashboard";

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
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <div className="mb-8">
          <p className="font-mono text-sm uppercase tracking-widest text-signal">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">{t("title")}</h1>
        </div>
        <BillingDashboard />
      </div>
    </PageShell>
  );
}
