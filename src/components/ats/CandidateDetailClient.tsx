"use client";

/**
 * ATS go-live — the candidate detail surface and the audited erase action.
 *
 * Reads `/api/ats/candidates/[id]` (ATS_VIEW, tenant-scoped) and shows the
 * candidate, the linked counts and the audit trail. The erase action is shown
 * only when the server says this viewer may run it (`canErase`, i.e.
 * ATS_ADMIN) and the candidate is not already erased; the erase route
 * re-enforces ATS_ADMIN regardless. Erasure requires a written reason and the
 * exact confirmation phrase, and cannot be undone.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { atsRead, atsMutate } from "@/components/ats/management/client-api";

/** The exact phrase the operator must type — never translated. */
const CONFIRMATION = "ERASE CANDIDATE";

/** PipelineStage slug → the `ats.stageNames` key. Kept exhaustive on purpose:
 *  an unmapped stage falls back to the raw slug, which is exactly the kind of
 *  untranslated machine value this hotfix exists to remove. */
const STAGE_KEY: Record<string, string> = {
  applied: "applied",
  "ai-review": "aiReview",
  "pending-approval": "pendingApproval",
  screening: "screening",
  "technical-review": "technicalReview",
  interview: "interview",
  offer: "offer",
  hired: "hired",
  rejected: "rejected",
};

/** Report dimension code → the `ats.reviewPanel.dimensions` key. */
const DIMENSION_KEY: Record<string, string> = {
  skill: "skill",
  experience: "experience",
  education: "education",
  certification: "certification",
  project: "project",
  role_relevance: "roleRelevance",
};

const RECOMMENDATIONS = new Set(["ADVANCE", "REVIEW_REQUIRED", "HOLD", "REJECT_RECOMMENDED"]);

interface ReviewSummary {
  id: string;
  cycle: number;
  provider: string;
  recommendation: string;
  overallScore: number | null;
  confidence: number | null;
  hardGates: { passed: number; failed: number; unknown: number };
  riskFlagCount: number;
  completedAt: string;
  versions: { extractor: string; rubric: string; prompt: string; policy: string; model: string | null };
  dimensionScores: { dimension: string; score: number | null; weightApplied: number; matched: number; total: number }[];
  hardGateResults: { criterionCode: string; label: string; outcome: string; note: string }[];
  evidence: { criterionCode: string; label: string; source: string; quote: string; confidence: string }[];
  missingEvidence: { label: string; ask: string }[];
  riskFlags: { code: string; note: string }[];
  explanation: string | null;
  requiresHumanDecision: boolean;
}

interface CandidateDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  erased: boolean;
  stage: string | null;
  appliedAt: string | null;
  latestApplication: {
    id: string;
    status: string;
    stage: string;
    appliedAt: string;
    awaitingHumanDecision: boolean;
  } | null;
  latestReview: ReviewSummary | null;
  counts: { applications: number; interviews: number; reviews: number };
  audit: { action: string; entityType: string; createdAt: string; byName: string | null }[];
  canErase: boolean;
}

type View = "loading" | "ready" | "notFound" | "denied" | "error";

export function CandidateDetailClient({ candidateId }: { candidateId: string }) {
  const t = useTranslations("ats.erase");
  const tr = useTranslations("ats.reviewPanel");
  const ts = useTranslations("ats.stageNames");
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [view, setView] = useState<View>("loading");
  const [tick, setTick] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setView("loading");
    atsRead<CandidateDetail>(`/api/ats/candidates/${encodeURIComponent(candidateId)}`).then((r) => {
      if (!active) return;
      if (r.ok && r.data) {
        setDetail(r.data);
        setView("ready");
      } else if (r.status === 404) setView("notFound");
      else if (r.status === 401 || r.status === 403) setView("denied");
      else setView("error");
    });
    return () => { active = false; };
  }, [candidateId, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  if (view === "loading") return <div className="rounded-xl border border-line bg-surface h-40 animate-pulse" />;
  if (view === "notFound") return <Shell t={t}><p className="kpi-label text-metadata py-8 text-center">404</p></Shell>;
  if (view === "denied") return <Shell t={t}><p role="alert" className="kpi-label text-danger py-8 text-center">{t("errorForbidden")}</p></Shell>;
  if (view === "error" || !detail) return <Shell t={t}><p role="alert" className="kpi-label text-danger py-8 text-center">{t("errorGeneric")}</p></Shell>;

  const d = detail;
  // A stage this build does not know is shown as its raw slug rather than
  // mislabelled: a wrong stage name is worse than an unfamiliar one.
  const stageKey = d.stage ? STAGE_KEY[d.stage] : undefined;
  const stageLabel = stageKey ? ts(stageKey) : d.stage;
  const review = d.latestReview;
  return (
    <Shell t={t}>
      {d.erased ? (
        <div role="status" className="mb-5 rounded-lg border border-amber-400/50 bg-amber-950/30 p-3">
          <p className="text-sm text-ink">{t("erasedBadge")}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-xl border border-line bg-surface p-5">
          <div className="h-layer-sep mb-3"><span className="kpi-label">{t("sectionProfile")}</span></div>
          <p className="font-body text-base font-semibold text-ink">{d.name || "—"}</p>
          <div className="mt-3 space-y-1.5">
            {([
              [t("emailLabel"), d.email],
              [t("phoneLabel"), d.phone],
              [t("locationLabel"), d.location],
              [t("stageLabel"), stageLabel],
              // The database value itself, beside the rendered stage. The two
              // can no longer disagree, and an operator reading a support
              // ticket can quote the status the row actually holds.
              [tr("applicationStatus"), d.latestApplication?.status ?? null],
              [t("appliedLabel"), d.appliedAt ? new Date(d.appliedAt).toISOString().slice(0, 10) : null],
            ] as const).filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="kpi-label text-metadata">{label}</span>
                <span className="font-mono text-[0.7rem] text-ink text-right" dir="auto">{value}</span>
              </div>
            ))}
          </div>

          {d.canErase && !d.erased ? (
            <div className="mt-6 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="ds-focus rounded-lg border border-rose-400/60 px-4 py-2 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-950/30"
              >
                {t("action")}
              </button>
            </div>
          ) : null}
        </section>

        <ReviewPanel tr={tr} review={review} awaiting={d.latestApplication?.awaitingHumanDecision ?? false} />

        <aside className="flex flex-col gap-5">
          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="h-layer-sep mb-3"><span className="kpi-label">{t("sectionActivity")}</span></div>
            <div className="space-y-1.5">
              {([
                [t("countApplications"), d.counts.applications],
                [t("countInterviews"), d.counts.interviews],
                [t("countReviews"), d.counts.reviews],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="kpi-label text-metadata">{label}</span>
                  <span className="font-mono text-sm font-bold text-ink">{value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="h-layer-sep mb-3"><span className="kpi-label">{t("sectionAudit")}</span></div>
            {d.audit.length === 0 ? (
              <p className="kpi-label text-metadata">{t("noAudit")}</p>
            ) : (
              <ul className="space-y-1.5">
                {d.audit.map((a, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[0.65rem] text-ink">{a.action}</span>
                      {/* entityType is a model name, not prose: it is the same
                          class of technical identifier as the action above and
                          stays verbatim in every locale. */}
                      <span className="kpi-label text-metadata block font-mono text-[0.6rem]" dir="ltr">{a.entityType}</span>
                    </span>
                    <span className="kpi-label text-metadata shrink-0">{new Date(a.createdAt).toISOString().slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {modalOpen ? (
        <EraseModal
          t={t}
          candidateId={d.id}
          counts={d.counts}
          onClose={() => setModalOpen(false)}
          onDone={() => { setModalOpen(false); refresh(); }}
        />
      ) : null}
    </Shell>
  );
}

/**
 * ATS review-visibility hotfix — the AI review result, on the page.
 *
 * `GET /api/ats/applications/[id]/review` has returned this evidence since
 * ATS-S1 and no surface consumed it, so a completed review was invisible: the
 * candidate page showed only a count of reviews, and nothing told a recruiter
 * that a decision was waiting on them. Everything here is read from the stored
 * report; nothing is derived, inferred or re-scored in the browser.
 *
 * The report is ADVISORY. This panel states that, shows that a human decision
 * is required when the application is in PENDING_HUMAN_APPROVAL, and offers no
 * accept/reject control: a decision is recorded through
 * `POST /api/ats/applications/[id]/decision`, which requires a written reason.
 */
function ReviewPanel({
  tr, review, awaiting,
}: {
  tr: ReturnType<typeof useTranslations>;
  review: ReviewSummary | null;
  awaiting: boolean;
}) {
  return (
    <section className="lg:col-span-2 rounded-xl border border-line bg-surface p-5">
      <div className="h-layer-sep mb-3 flex items-center justify-between gap-3">
        <span className="kpi-label">{tr("title")}</span>
        {awaiting ? (
          <span role="status" className="hs-badge hs--warning">{tr("awaitingDecision")}</span>
        ) : null}
      </div>

      {!review ? (
        <p className="kpi-label text-metadata py-6 text-center">{tr("empty")}</p>
      ) : (
        <>
          <p className="mb-4 text-xs leading-relaxed text-muted">{tr("advisory")}</p>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label={tr("overallScore")}
              value={review.overallScore === null ? tr("notScored") : `${review.overallScore}`}
            />
            <Metric
              label={tr("confidence")}
              value={review.confidence === null ? tr("notScored") : `${review.confidence}`}
            />
            <Metric
              label={tr("recommendation")}
              value={RECOMMENDATIONS.has(review.recommendation)
                ? tr(`recommendations.${review.recommendation}`)
                : review.recommendation}
            />
            <Metric label={tr("completedAt")} value={new Date(review.completedAt).toISOString().slice(0, 16).replace("T", " ")} />
          </div>

          <div className="mb-5 space-y-1.5">
            <Row label={tr("provider")} value={review.provider} />
            <Row label={tr("cycle")} value={`${review.cycle}`} />
            <Row
              label={tr("hardGatesTitle")}
              value={tr("hardGatesSummary", {
                passed: review.hardGates.passed,
                failed: review.hardGates.failed,
                unknown: review.hardGates.unknown,
              })}
            />
          </div>

          {review.dimensionScores.length > 0 ? (
            <Block title={tr("dimensionsTitle")}>
              <ul className="space-y-2">
                {review.dimensionScores.map((ds) => (
                  <li key={ds.dimension}>
                    <div className="flex justify-between gap-2">
                      <span className="kpi-label text-metadata">
                        {DIMENSION_KEY[ds.dimension] ? tr(`dimensions.${DIMENSION_KEY[ds.dimension]}`) : ds.dimension}
                      </span>
                      <span className="font-mono text-[0.7rem] text-ink">
                        {ds.score === null ? tr("notScored") : ds.score}
                        {" · "}
                        {tr("matchedLabel", { matched: ds.matched, total: ds.total })}
                        {" · "}
                        {tr("weightLabel", { weight: ds.weightApplied })}
                      </span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-line">
                      <div
                        className="h-1 rounded-full bg-ice"
                        style={{ width: `${ds.score === null ? 0 : Math.max(0, Math.min(100, ds.score))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {review.hardGateResults.length > 0 ? (
            <Block title={tr("hardGatesTitle")}>
              <ul className="space-y-1.5">
                {review.hardGateResults.map((g) => (
                  <li key={g.criterionCode} className="flex justify-between gap-2">
                    <span className="min-w-0 flex-1 text-xs text-ink" dir="auto">{g.label || g.criterionCode}</span>
                    <span className="kpi-label shrink-0 font-mono text-metadata" dir="ltr">{g.outcome}</span>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {review.evidence.length > 0 ? (
            <Block title={tr("evidenceTitle")}>
              <ul className="space-y-2">
                {review.evidence.map((e, i) => (
                  <li key={`${e.criterionCode}-${i}`} className="rounded-lg border border-line/60 p-2">
                    <div className="flex justify-between gap-2">
                      <span className="kpi-label text-metadata" dir="auto">{e.label || e.criterionCode}</span>
                      <span className="kpi-label shrink-0 font-mono text-metadata" dir="ltr">{e.source} · {e.confidence}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink" dir="auto">{e.quote}</p>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {review.missingEvidence.length > 0 ? (
            <Block title={tr("missingTitle")}>
              <ul className="space-y-1.5">
                {review.missingEvidence.map((m, i) => (
                  <li key={`${m.label}-${i}`} className="text-xs text-muted" dir="auto">
                    <span className="text-ink">{m.label}</span>{m.ask ? ` — ${m.ask}` : null}
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {review.riskFlags.length > 0 ? (
            <Block title={tr("riskFlagsTitle")}>
              <ul className="space-y-1.5">
                {review.riskFlags.map((f, i) => (
                  <li key={`${f.code}-${i}`} className="text-xs text-muted">
                    <span className="font-mono text-[0.65rem] text-ink" dir="ltr">{f.code}</span>
                    {f.note ? <span dir="auto"> — {f.note}</span> : null}
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {review.explanation ? (
            <Block title={tr("explanationTitle")}>
              <p className="text-xs leading-relaxed text-muted" dir="auto">{review.explanation}</p>
            </Block>
          ) : null}

          <Block title={tr("versionsTitle")}>
            <div className="space-y-1.5">
              {([
                ["extractor", review.versions.extractor],
                ["rubric", review.versions.rubric],
                ["prompt", review.versions.prompt],
                ["policy", review.versions.policy],
                ["model", review.versions.model],
              ] as const).filter(([, v]) => v).map(([name, v]) => (
                <div key={name} className="flex justify-between gap-2">
                  <span className="kpi-label text-metadata font-mono" dir="ltr">{name}</span>
                  <span className="font-mono text-[0.65rem] text-ink" dir="ltr">{v}</span>
                </div>
              ))}
            </div>
          </Block>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/60 p-2.5">
      <p className="kpi-label text-metadata mb-1">{label}</p>
      <p className="font-mono text-sm font-bold text-ink" dir="auto">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="kpi-label text-metadata">{label}</span>
      <span className="font-mono text-[0.7rem] text-ink text-right" dir="auto">{value}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="kpi-label text-metadata mb-2">{title}</p>
      {children}
    </div>
  );
}

function Shell({ t, children }: { t: ReturnType<typeof useTranslations>; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl py-6">
      <div className="mb-5">
        <Link href="/dashboard/ats/candidates" className="ds-focus font-mono text-xs text-muted transition-colors hover:text-ink">
          <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span> {t("back")}
        </Link>
      </div>
      <h1 className="type-page-title mb-5">{t("detailTitle")}</h1>
      {children}
    </div>
  );
}

function EraseModal({
  t, candidateId, counts, onClose, onDone,
}: {
  t: ReturnType<typeof useTranslations>;
  candidateId: string;
  counts: { applications: number; interviews: number; reviews: number };
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = reason.trim().length >= 5 && phrase === CONFIRMATION && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const r = await atsMutate<{ erased: boolean }>(
      `/api/ats/candidates/${encodeURIComponent(candidateId)}/erase`,
      "POST",
      { reason: reason.trim(), confirmation: CONFIRMATION },
    );
    if (r.ok) {
      onDone();
      return;
    }
    setBusy(false);
    setError(
      r.code === "LEGAL_HOLD" ? t("errorLegalHold")
      : r.code === "CROSS_ORG" ? t("errorCrossOrg")
      : r.status === 403 ? t("errorForbidden")
      : t("errorGeneric"),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="erase-title">
      <div className="w-full max-w-lg rounded-xl border border-line bg-bg p-6 shadow-xl">
        <h2 id="erase-title" className="type-page-title mb-3 text-lg">{t("modalTitle")}</h2>
        <p className="mb-3 text-sm leading-relaxed text-muted">{t("modalWarning")}</p>
        <p className="mb-4 text-sm text-ink">
          {t("modalImpact", { applications: counts.applications, interviews: counts.interviews, reviews: counts.reviews })}
        </p>

        <label className="mb-1 block text-sm font-medium text-ink" htmlFor="erase-reason">{t("reasonLabel")}</label>
        <textarea
          id="erase-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("reasonPlaceholder")}
          className="ds-focus mb-4 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />

        <label className="mb-1 block text-sm font-medium text-ink" htmlFor="erase-confirm">{t("confirmLabel")}</label>
        <input
          id="erase-confirm"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          dir="ltr"
          autoComplete="off"
          className="ds-focus mb-4 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm text-ink"
        />

        {error ? <p role="alert" className="mb-3 text-xs text-rose-300">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="ds-focus rounded-lg border border-line px-4 py-2 text-sm text-muted transition-colors hover:text-ink disabled:opacity-60">
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            aria-disabled={!ready}
            className="ds-focus rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
          >
            {busy ? t("erasing") : t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
