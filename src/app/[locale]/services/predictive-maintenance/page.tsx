// R2 — public capability explainer (gap-closure roadmap, not a new engine).
// Predictive Maintenance itself is fully implemented in src/lib/predictive/*
// and /dashboard/predictive/*; this page only gives it a public, indexable
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
    path: "/services/predictive-maintenance",
    title: p.servicePredictiveMaintenance.title,
    description: p.servicePredictiveMaintenance.description,
    keywords: p.servicePredictiveMaintenance.keywords,
  });
}

export default async function PredictiveMaintenanceServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PublicPageShell>
      <CapabilityDetail capabilityKey="predictiveMaintenance" />
    </PublicPageShell>
  );
}
