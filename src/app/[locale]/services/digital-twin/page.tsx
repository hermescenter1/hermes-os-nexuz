// R2 — public capability explainer (gap-closure roadmap, not a new engine).
// Digital Twin itself is fully implemented in src/lib/digital-twin/* and
// /dashboard/digital-twin/*; this page only gives it a public, indexable
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
    path: "/services/digital-twin",
    title: p.serviceDigitalTwin.title,
    description: p.serviceDigitalTwin.description,
    keywords: p.serviceDigitalTwin.keywords,
  });
}

export default async function DigitalTwinServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PublicPageShell>
      <CapabilityDetail capabilityKey="digitalTwin" />
    </PublicPageShell>
  );
}
