// R2 — public capability explainer (gap-closure roadmap, not a new engine).
// CRM itself is fully implemented under /crm/* and 13 Crm* Prisma models;
// this page only gives it a public, indexable explanation and a real
// connection graph. See CapabilityDetail.tsx and
// src/lib/capabilities/registry.ts.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell, CapabilityDetail } from "@/components/public-site";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/services/crm",
    title: p.serviceCrm.title,
    description: p.serviceCrm.description,
    keywords: p.serviceCrm.keywords,
  });
}

export default async function CrmServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PublicPageShell>
      <CapabilityDetail capabilityKey="crm" />
    </PublicPageShell>
  );
}
