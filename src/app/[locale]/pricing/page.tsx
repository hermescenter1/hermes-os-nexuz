import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/public-site";
import { PageIntro } from "@/components/PageIntro";
import { PlanCatalog } from "@/components/billing/PlanCatalog";
import { buildMetadata } from "@/lib/seo/metadata";

// PHASE 96 — public pricing page. Deliberately NOT behind RequireCapability:
// pricing is public marketing content, unlike the authenticated
// /dashboard/billing surface. The page renders ONLY server-derived
// commercial decisions (see PlanCatalog / plan-catalog-logic.ts) — it never
// computes an entitlement or invents a price on the client.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/pricing",
    title: p.pricing.title,
    description: p.pricing.description,
    keywords: p.pricing.keywords,
  });
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");

  return (
    <PublicPageShell>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      <PlanCatalog />
    </PublicPageShell>
  );
}
