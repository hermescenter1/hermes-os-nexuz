// PHASE 87J — EDMS document-control command surface (Server Component).
//
// Receives the ALREADY server-fetched, already-authorized EdmsDashboard and
// reorganizes it into the document-control IA: attention → workflow
// distribution → documents by type → recently updated register → recent
// controlled-document activity → next actions. Every value is a real
// dashboard field (see logic.ts). No fetch, no auth decision, no fabricated
// compliance/audit-readiness/quality metric, and no "overdue" claim (the
// summary carries no due dates).
//
// Document identity rules honoured here:
//   • document numbers / revision codes render inside <bdi dir="ltr"> with
//     their exact casing and separators — never translated, never reformatted;
//   • DOCUMENT status and APPROVAL status are distinct badge families;
//   • a document with no `currentRevision` is shown as "no current revision",
//     never as an approved-for-use revision.

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { TechnicalValue } from "@/components/ds";
import {
  DashboardSection, AttentionPanel, SafeActionGrid,
  type AttentionItem, type SafeAction,
} from "@/components/dashboard-experience";
import { DistributionCard } from "@/components/asset-maintenance";
import { DocumentStatusBadge } from "./DocumentBadges";
import { deriveDocumentAttention, orderedCounts, linkedContext } from "./logic";
import type { EdmsDashboard, EdmsDocumentStatus, EdmsDocumentType } from "@/lib/document/types";

function DocLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={className}>{children}</Link>;
}

const STATUS_ORDER: EdmsDocumentStatus[] = [
  "REVIEW", "DRAFT", "APPROVED", "REJECTED", "OBSOLETE", "ARCHIVED",
];

const TYPE_ORDER: EdmsDocumentType[] = [
  "ENGINEERING_DRAWING", "PID", "ELECTRICAL_DRAWING", "PLC_PROGRAM", "SCADA_PROJECT",
  "COMMISSIONING_REPORT", "INSPECTION_REPORT", "FAT", "SAT",
  "MANUAL", "PROCEDURE", "WORK_INSTRUCTION", "CERTIFICATE",
  "VENDOR_DATASHEET", "CONTRACT", "QUOTATION", "INVOICE", "OTHER",
];

export async function EdmsCommandSurface({
  dashboard, locale,
}: {
  dashboard: EdmsDashboard;
  locale: string;
}) {
  const t = await getTranslations("engineeringDocuments");
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });

  const attention: AttentionItem[] = deriveDocumentAttention(dashboard).map((a) => ({
    id: a.id,
    severity: a.severity === "action" ? "high" : "medium",
    severityLabel: a.severity === "action" ? t("attention.severityAction") : t("attention.severityReview"),
    object: t("fields.documents"),
    reason: t(`attention.${a.kind}`, { count: nf.format(a.count) }),
    href: a.href,
    viewLabel: t("attention.view"),
  }));

  const statusRows = orderedCounts(STATUS_ORDER, dashboard.documentsByStatus);
  const typeRows = orderedCounts(TYPE_ORDER, dashboard.documentsByType);
  const recent = (dashboard.recentDocuments ?? []).filter((d) => !d.deletedAt).slice(0, 6);
  const activity = (dashboard.recentAudit ?? []).slice(0, 6);

  const actions: SafeAction[] = [
    { key: "explorer", label: t("actions.explorer"), description: t("actions.explorerDesc"), href: "/documents/explorer", glyph: "◆" },
    { key: "approvals", label: t("actions.approvals"), description: t("actions.approvalsDesc"), href: "/documents/approvals", glyph: "◈" },
    { key: "revisions", label: t("actions.revisions"), description: t("actions.revisionsDesc"), href: "/documents/revisions", glyph: "◉" },
    { key: "search", label: t("actions.search"), description: t("actions.searchDesc"), href: "/documents/search", glyph: "◇" },
  ];

  const registerEmpty = dashboard.totalDocuments === 0;

  return (
    <div className="flex flex-col gap-6">
      <DashboardSection id="edms-attention" title={t("attention.title")}>
        <AttentionPanel items={attention} emptyLabel={t("attention.empty")} LinkComponent={DocLink} />
      </DashboardSection>

      <DashboardSection id="edms-workflow" title={t("sections.workflow")}>
        {registerEmpty ? (
          <div className="ds-glass-card rounded-lg p-5">
            <p className="text-body-compact text-text-secondary">{t("states.emptyRegister")}</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <DistributionCard
              title={t("sections.workflow")}
              rows={statusRows.map((r) => ({
                key: r.key, count: r.count,
                badge: <DocumentStatusBadge status={r.key} label={t(`status.${r.key}`)} />,
              }))}
              nf={nf}
            />
            <div className="ds-glass-card rounded-lg p-5">
              <h3 className="mb-3 text-title-lg font-semibold text-text-primary">{t("sections.byType")}</h3>
              <ul className="flex flex-col gap-2">
                {typeRows.map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-2">
                    <span className="text-body-compact text-text-secondary" dir="auto">{t(`docType.${r.key}`)}</span>
                    <span className="tabular-nums text-body-compact font-semibold text-text-primary" dir="ltr">
                      {nf.format(r.count)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DashboardSection>

      {/* Recently updated register — document number is a technical identifier
          (LTR, exact casing); current revision is shown as-is or explicitly
          absent. Document status ≠ approval status. */}
      {recent.length > 0 ? (
        <DashboardSection id="edms-register" title={t("sections.register")}>
          <ul className="flex flex-col gap-2">
            {recent.map((doc) => {
              const links = linkedContext(doc);
              return (
                <li key={doc.id}>
                  <Link
                    href={`/documents/${doc.id}`}
                    className="ds-focus flex flex-wrap items-center gap-x-3 gap-y-1 ds-glass-interactive rounded-lg p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-compact font-semibold text-text-primary" dir="auto">
                        {doc.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-text-muted">
                        <span dir="auto">{t(`docType.${doc.documentType}`)}</span>
                        <span>
                          · {t("fields.currentRevision")}:{" "}
                          {doc.currentRevision
                            ? <TechnicalValue>{doc.currentRevision}</TechnicalValue>
                            : <span dir="auto">{t("fields.noRevision")}</span>}
                        </span>
                        {links.length > 0
                          ? links.map((l) => (
                              <span key={`${l.kind}-${l.id}`}>
                                · {t(`fields.${l.kind === "workOrder" ? "workOrder" : l.kind}`)}{" "}
                                <TechnicalValue>{l.id}</TechnicalValue>
                              </span>
                            ))
                          : <span dir="auto">· {t("fields.noLinkedContext")}</span>}
                      </span>
                    </span>
                    <DocumentStatusBadge status={doc.status} label={t(`status.${doc.status}`)} />
                    <span className="shrink-0 text-caption text-text-muted" dir="ltr">
                      {df.format(new Date(doc.updatedAt))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-caption text-text-muted">{t("distinction.controlled")}</p>
        </DashboardSection>
      ) : null}

      <DashboardSection id="edms-activity" title={t("sections.activity")}>
        <div className="ds-glass-card rounded-lg p-5">
          {activity.length === 0 ? (
            <p className="text-body-compact text-text-secondary">{t("states.noActivity")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                  {/* Audit action codes are machine identifiers — LTR-isolated,
                      never translated and never presented as a legal record. */}
                  <span className="min-w-0 flex-1 truncate text-body-compact text-text-primary">
                    <TechnicalValue>{a.action}</TechnicalValue>
                  </span>
                  <span className="shrink-0 text-caption text-text-muted" dir="ltr">
                    {df.format(new Date(a.createdAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DashboardSection>

      <DashboardSection id="edms-actions" title={t("sections.actions")}>
        <SafeActionGrid actions={actions} LinkComponent={DocLink} />
      </DashboardSection>
    </div>
  );
}
