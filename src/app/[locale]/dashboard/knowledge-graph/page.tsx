/**
 * Phase 56D — Hermes Engineering Knowledge Graph Dashboard.
 * Route: /dashboard/knowledge-graph
 *
 * Server component. Renders KnowledgeGraphClient which fetches /api/eng-graph.
 */

import { setRequestLocale, getTranslations } from "next-intl/server";
import { AppShell }          from "@/components/app-shell";
import { PageHeader }        from "@/components/ui/PageHeader";
import { KnowledgeGraphClient } from "@/components/knowledge-graph/KnowledgeGraphClient";

export const metadata = {
  title: "Engineering Knowledge Graph — Hermes Intelligence Network",
};

export default async function KnowledgeGraphPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  /*
   * GATE B.2 (B0-F04) — this page owns its header copy: it passes the eyebrow,
   * title and subtitle to PageHeader, which only renders what it is handed.
   * All three rendered the English string in DE and FA before this change.
   */
  const t = await getTranslations("knowledgeGraph");

  return (
    <AppShell>
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 pb-20">

        <PageHeader
          eyebrow={t("engineeringPageEyebrow")}
          title={t("engineeringPageTitle")}
          subtitle={t("engineeringPageSubtitle")}
          level="page"
        />

        {/* Safety Notice */}
        <div className="flex items-start gap-3 rounded-xl border border-signal/15 bg-signal/[0.03] px-4 py-3 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-signal flex-shrink-0 mt-1.5" />
          <p className="font-body text-xs text-signal/80 leading-relaxed">
            Read-only graph — no PLC writes, no LLM inference. All relationships are explicit, deterministic, and traceable.
            Every edge corresponds to a real engineering linkage in the Hermes knowledge catalog.
          </p>
        </div>

        {/* Main Graph Interface */}
        <KnowledgeGraphClient />

      </div>
    </AppShell>
  );
}
