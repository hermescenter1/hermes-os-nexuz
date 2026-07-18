// PHASE 87J — EDMS landing: attention → workflow distribution → documents by
// type → recently updated register → controlled-document activity → next
// actions, all from the existing server-side getDocumentDashboard().
//
// The page owns the single H1 via PageHeader level="page", sourced from the
// EXISTING `documents.dashboard.title` catalog key (the previous h1 was a
// hardcoded English literal even though EN+FA values already existed).
//
// Demo badge is UNCONDITIONAL and deliberate: getDocumentDashboard() has no
// implemented Prisma path — it always returns the built-in demonstration
// dataset — so labelling it conditionally would misrepresent the source.

import { getTranslations, setRequestLocale } from "next-intl/server";
import { noIndexMetadata }             from "@/lib/seo/metadata";
import { getDocumentDashboard }        from "@/lib/document/service";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";
import { EdmsCommandSurface }          from "@/components/engineering-documents";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("EDMS — Document Management");

export default async function DocumentsDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t  = await getTranslations("documents");
  const ed = await getTranslations("engineeringDocuments");
  const dashboard = await getDocumentDashboard();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ed("header.eyebrow")}
        title={t("dashboard.title")}
        subtitle={ed("header.purpose")}
        level="page"
        status={<PageStatusBadge label={ed("header.demoBadge")} variant="simulated" />}
      />
      <p className="text-caption text-text-muted">{ed("header.demoNote")}</p>
      <EdmsCommandSurface dashboard={dashboard} locale={locale} />
    </div>
  );
}
