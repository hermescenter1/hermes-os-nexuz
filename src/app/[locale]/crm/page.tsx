// PHASE 87G — premium CRM landing: sales attention → pipeline → recent leads
// → KPI strip → next actions, all from the existing /api/crm endpoints.
// Server component: resolves the honest demo-data badge (Prisma unavailable ⇒
// the CRM layer serves its deterministic mock fallback) before rendering the
// client island. The page owns the single H1 via PageHeader level="page".

import type { Metadata }               from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { noIndexMetadata }             from "@/lib/seo/metadata";
import { getPrisma }                   from "@/lib/db/prisma";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";
import { CrmCommandClient }            from "@/components/crm-experience";

export const metadata: Metadata = noIndexMetadata("CRM Dashboard — Hermes OS");
export const dynamic = "force-dynamic";

export default async function CrmDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("crm");

  // Honest data-provenance flag: without a database the CRM layer serves its
  // deterministic demo dataset — surface that per Hermes convention.
  let demoData = false;
  try {
    demoData = (await getPrisma()) === null;
  } catch {
    demoData = true;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("header.eyebrow")}
        title={t("header.title")}
        subtitle={t("header.purpose")}
        level="page"
        status={demoData ? <PageStatusBadge label={t("header.demoBadge")} variant="simulated" /> : undefined}
      />
      <CrmCommandClient />
    </div>
  );
}
