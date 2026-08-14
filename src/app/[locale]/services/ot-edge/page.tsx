// R2 — public capability explainer (gap-closure roadmap, not a new engine).
// OT Edge itself is fully implemented under /dashboard/ot/* with a read-only
// safety invariant enforced in code (no write-back or command methods); this
// page only gives it a public, indexable explanation and a real connection
// graph. See CapabilityDetail.tsx and src/lib/capabilities/registry.ts.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell, CapabilityDetail } from "@/components/public-site";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/services/ot-edge",
    title: p.serviceOtEdge.title,
    description: p.serviceOtEdge.description,
    keywords: p.serviceOtEdge.keywords,
  });
}

export default async function OtEdgeServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PublicPageShell>
      <CapabilityDetail capabilityKey="otEdge" />
    </PublicPageShell>
  );
}
