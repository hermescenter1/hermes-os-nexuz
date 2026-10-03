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

interface CandidateDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  erased: boolean;
  stage: string | null;
  appliedAt: string | null;
  counts: { applications: number; interviews: number; reviews: number };
  audit: { action: string; createdAt: string; byName: string | null }[];
  canErase: boolean;
}

type View = "loading" | "ready" | "notFound" | "denied" | "error";

export function CandidateDetailClient({ candidateId }: { candidateId: string }) {
  const t = useTranslations("ats.erase");
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
              [t("stageLabel"), d.stage],
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
                    <span className="font-mono text-[0.65rem] text-ink">{a.action}</span>
                    <span className="kpi-label text-metadata">{new Date(a.createdAt).toISOString().slice(0, 10)}</span>
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
