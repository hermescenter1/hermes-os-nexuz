"use client";

/**
 * ATS-M1 — one position: every field, the publish-readiness checklist, the
 * linked-record counts, the lifecycle actions this actor may attempt, and the
 * audit history (read-only).
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ds/Button";
import { buttonVariants } from "@/components/ds/logic";
import { Alert } from "@/components/ds/Alert";
import type { PositionAction, PositionLocale } from "@/lib/ats/positions/contract";
import { atsRead } from "./client-api";
import { ConfirmDialog, ToastRegion, useToasts, type ConfirmSpec } from "./feedback";
import { usePositionActions } from "./position-actions";

interface Detail {
  id: string;
  requisitionKey: string | null;
  status: string;
  isPublic: boolean;
  publishedAt: string | null;
  closingDate: string | null;
  internalTitle: string | null;
  publicTitle: string;
  department: string;
  location: string;
  employmentType: string | null;
  workMode: string | null;
  sponsorshipPolicy: string | null;
  relocationPolicy: string | null;
  salary: { confidential: boolean; currency: string | null; min: number | null; max: number | null };
  internalBrief: string | null;
  evidenceRequirements: unknown;
  interviewKit: unknown;
  assessment: unknown;
  approvalOwnerRole: string | null;
  decisionSlaDays: number | null;
  hiringOwnerMemberId: string | null;
  roleProfileCode: string | null;
  copy: Record<PositionLocale, { title: string; summary: string; description: string } | null>;
  criteria: { code: string; kind: string; label: string; dimension: string; hardGate: boolean }[];
  linked: { applications: number; interviews: number; aiReviews: number; auditRecords: number };
  readiness: { ready: boolean; missing: string[]; protectedTerms: string[] };
  actions: { transitions: PositionAction[]; canEdit: boolean; canDelete: boolean };
  version: number;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

interface AuditEntry {
  id: string;
  action: string;
  actorName: string | null;
  actorUserId: string | null;
  at: string;
  correlationId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  affectedCounts: unknown;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/50 py-1.5 last:border-0">
      <span className="kpi-label text-metadata">{label}</span>
      <span className="text-end text-xs text-ink">{value}</span>
    </div>
  );
}

export function PositionDetailClient({ positionId }: { positionId: string }) {
  const t = useTranslations("ats.mgmt");
  const tf = useTranslations("ats.mgmt.form");
  const locale = useLocale();
  const { toasts, push, dismiss } = useToasts();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "notFound" | "error">("loading");
  const [tick, setTick] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const { requestTransition, requestDelete } = usePositionActions({ push, setConfirm, onChanged: reload });

  useEffect(() => {
    const id = encodeURIComponent(positionId);
    atsRead<{ position: Detail }>(`/api/ats/jobs/${id}`).then((r) => {
      if (r.status === 401 || r.status === 403) return setState("denied");
      if (r.status === 404) return setState("notFound");
      if (!r.ok || !r.data) return setState("error");
      setDetail(r.data.position);
      setState("ready");
    });
    atsRead<{ entries: AuditEntry[] }>(`/api/ats/jobs/${id}/audit`).then((r) => setAudit(r.ok && r.data ? r.data.entries : null));
  }, [positionId, tick]);

  if (state === "loading") return <div className="h-40 animate-pulse rounded-xl border border-line bg-surface" aria-busy="true" />;
  if (state === "denied")
    return (
      <Alert variant="warning" title={t("permission.title")}>
        {t("permission.viewRequired")}
      </Alert>
    );
  if (state === "error")
    return (
      <Alert variant="danger" title={t("states.errorTitle")}>
        <p>{t("errors.GENERIC")}</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={reload}>
          {t("states.retry")}
        </Button>
      </Alert>
    );
  if (state === "notFound" || !detail)
    return (
      <Alert variant="warning" title={t("errors.NOT_FOUND")}>
        <Link href="/dashboard/ats/jobs" className="underline">
          {t("actions.BACK")}
        </Link>
      </Alert>
    );

  const label = (locale === "fa" ? detail.copy.fa?.title : detail.copy.en?.title) || detail.publicTitle;
  const actionable = { id: detail.id, version: detail.version, label, applicationCount: detail.linked.applications };
  const kit = Array.isArray(detail.interviewKit) ? (detail.interviewKit as { code: string; label: string; ownerRole: string; slaDays: number }[]) : [];
  const date = (v: string | null) => (v ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(v)) : t("detail.notSet"));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/ats/jobs" className="text-xs text-muted hover:text-ink">
            ← {t("actions.BACK")}
          </Link>
          <h2 className="type-section-title mt-1 text-ink">{label}</h2>
          <p className="kpi-label text-metadata">
            {t(`status.${detail.status}`)} · {detail.isPublic ? t("visibility.public") : t("visibility.private")}
            {detail.requisitionKey ? <span dir="ltr"> · {detail.requisitionKey}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.actions.canEdit ? (
            <Link href={`/dashboard/ats/jobs/${detail.id}/edit`} className={buttonVariants("secondary", "sm")}>
              {t("actions.EDIT")}
            </Link>
          ) : null}
          {detail.actions.transitions.map((a) => (
            <Button key={a} size="sm" variant={a === "CLOSE" || a === "ARCHIVE" ? "destructive" : "primary"} onClick={() => requestTransition(actionable, a)}>
              {t(`actions.${a}`)}
            </Button>
          ))}
          {detail.actions.canDelete ? (
            <Button size="sm" variant="destructive" onClick={() => requestDelete(actionable)}>
              {t("actions.DELETE")}
            </Button>
          ) : null}
        </div>
      </div>

      <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="readiness-h">
        <h3 id="readiness-h" className="font-body text-sm font-semibold text-ink">
          {t("detail.readiness")}
        </h3>
        {detail.readiness.ready ? (
          <p className="mt-2 text-sm text-emerald-300">{t("detail.ready")}</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-muted">{t("detail.notReady")}</p>
            <ul className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
              {detail.readiness.missing.map((m) => (
                <li key={m} className="text-xs text-amber-200">
                  • {t(`readiness.${m}`)}
                </li>
              ))}
            </ul>
            {detail.readiness.protectedTerms.length ? (
              <p className="mt-2 text-xs text-rose-300">{tf("protectedTerms", { terms: detail.readiness.protectedTerms.join(", ") })}</p>
            ) : null}
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-5 lg:col-span-2">
          <h3 className="font-body text-sm font-semibold text-ink">{t("detail.fields")}</h3>
          <div className="mt-3">
            <Row label={tf("internalTitle")} value={detail.internalTitle ?? t("detail.notSet")} />
            <Row label={tf("publicTitle")} value={detail.publicTitle} />
            <Row label={tf("copy.locale.fa")} value={detail.copy.fa?.title || t("detail.notSet")} />
            <Row label={tf("copy.locale.en")} value={detail.copy.en?.title || t("detail.notSet")} />
            <Row label={tf("copy.locale.de")} value={detail.copy.de?.title || t("detail.notSet")} />
            <Row label={tf("department")} value={detail.department} />
            <Row label={tf("employmentType")} value={detail.employmentType ? tf(`employment.${detail.employmentType}`) : t("detail.notSet")} />
            <Row label={tf("workMode")} value={detail.workMode ? tf(`workModes.${detail.workMode}`) : t("detail.notSet")} />
            <Row label={tf("location")} value={detail.location || t("detail.notSet")} />
            <Row label={tf("sponsorshipPolicy")} value={detail.sponsorshipPolicy ? tf(`mobility.${detail.sponsorshipPolicy}`) : t("detail.notSet")} />
            <Row label={tf("relocationPolicy")} value={detail.relocationPolicy ? tf(`mobility.${detail.relocationPolicy}`) : t("detail.notSet")} />
            <Row
              label={tf("salary")}
              value={
                detail.salary.confidential
                  ? tf("salaryConfidential")
                  : detail.salary.min != null || detail.salary.max != null
                    ? `${detail.salary.min ?? "—"}–${detail.salary.max ?? "—"} ${detail.salary.currency ?? ""}`
                    : t("detail.notSet")
              }
            />
            <Row label={tf("approvalOwner")} value={detail.approvalOwnerRole ? tf(`roles.${detail.approvalOwnerRole}`) : t("detail.notSet")} />
            <Row label={tf("hiringOwner")} value={detail.hiringOwnerMemberId ? t("detail.assigned") : t("detail.notSet")} />
            <Row label={tf("decisionSla")} value={detail.decisionSlaDays != null ? t("detail.days", { count: detail.decisionSlaDays }) : t("detail.notSet")} />
            <Row label={t("detail.openingDate")} value={date(detail.publishedAt)} />
            <Row label={tf("closingDate")} value={date(detail.closingDate)} />
          </div>
        </section>
        <section className="rounded-xl border border-line bg-surface p-5">
          <h3 className="font-body text-sm font-semibold text-ink">{t("detail.linked")}</h3>
          <div className="mt-3">
            <Row label={t("detail.linkedApplications")} value={detail.linked.applications} />
            <Row label={t("detail.linkedInterviews")} value={detail.linked.interviews} />
            <Row label={t("detail.linkedReviews")} value={detail.linked.aiReviews} />
            <Row label={t("detail.linkedAudit")} value={detail.linked.auditRecords} />
          </div>
          <h3 className="mt-5 font-body text-sm font-semibold text-ink">{tf("sections.interviewKit")}</h3>
          <ol className="mt-2 space-y-1 text-xs text-ink">
            {kit.length === 0 ? <li className="text-muted">{t("detail.notSet")}</li> : null}
            {kit.map((s, i) => (
              <li key={s.code}>
                {i + 1}. {s.label} · {tf(`roles.${s.ownerRole}`)} · {t("detail.days", { count: s.slaDays })}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h3 className="font-body text-sm font-semibold text-ink">{tf("sections.criteria")}</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          {(["MUST_HAVE", "NICE_TO_HAVE", "DISQUALIFIER"] as const).map((kind) => (
            <div key={kind}>
              <p className="kpi-label mb-1">{t(`detail.criteriaKind.${kind}`)}</p>
              <ul className="space-y-1 text-xs text-ink">
                {detail.criteria.filter((c) => c.kind === kind).length === 0 ? <li className="text-muted">{t("detail.notSet")}</li> : null}
                {detail.criteria
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <li key={c.code}>
                      • {c.label} <span className="text-muted">({tf(`dimension.${c.dimension}`)})</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="audit" className="rounded-xl border border-line bg-surface p-5" aria-labelledby="audit-h">
        <h3 id="audit-h" className="font-body text-sm font-semibold text-ink">
          {t("audit.title")}
        </h3>
        <p className="mt-1 text-xs text-muted">{t("audit.immutable")}</p>
        {audit === null ? <p className="mt-3 text-xs text-muted">{t("audit.unavailable")}</p> : null}
        {audit && audit.length === 0 ? <p className="mt-3 text-xs text-muted">{t("audit.empty")}</p> : null}
        {audit && audit.length > 0 ? (
          <ol className="mt-3 space-y-3">
            {audit.map((e) => (
              <li key={e.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">{t.has(`audit.actions.${e.action}`) ? t(`audit.actions.${e.action}`) : e.action}</span>
                  <span className="text-[0.65rem] text-muted">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(e.at))}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {t("audit.actor")}: {e.actorName ?? e.actorUserId ?? "—"}
                </p>
                {e.reason ? (
                  <p className="mt-1 text-xs text-ink">
                    {t("audit.reason")}: {e.reason}
                  </p>
                ) : null}
                <details className="mt-1">
                  <summary className="cursor-pointer text-[0.65rem] text-muted">{t("audit.details")}</summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-bg p-2 font-mono text-[0.6rem] text-muted" dir="ltr">
                    {JSON.stringify({ before: e.before, after: e.after, affectedCounts: e.affectedCounts, correlationId: e.correlationId }, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
