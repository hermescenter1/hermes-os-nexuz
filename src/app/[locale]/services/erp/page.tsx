// R2 — public capability explainer (gap-closure roadmap, not a new engine).
// ERP itself is fully implemented under /erp/* (8 workspace routes) and 15
// Erp* Prisma models; this page only gives it a public, indexable
// explanation and a real connection graph. See CapabilityDetail.tsx and
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
    path: "/services/erp",
    title: p.serviceErp.title,
    description: p.serviceErp.description,
    keywords: p.serviceErp.keywords,
  });
}

export default async function ErpServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PublicPageShell>
      <CapabilityDetail capabilityKey="erp" />
    </PublicPageShell>
  );
}
