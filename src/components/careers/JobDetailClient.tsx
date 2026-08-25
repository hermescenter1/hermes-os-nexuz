"use client";

import { useState, useEffect, useCallback } from "react";
import { Link }                 from "@/i18n/navigation";
import { useLocale, useTranslations }      from "next-intl";
import { ResourceFailureNotice } from "@/components/ui/ResourceFailureNotice";
import { requestJson, ResourceRequestError, type ResourceFailureCode } from "@/lib/client/resource-request";
import { formatSalaryRange, localizedLocationType } from "./job-format";
import { APPLY_JOURNEY_OPEN } from "@/lib/ats/acceptance-flag";
import { parsePublicJobDetail, type PublicJobDetail } from "./public-job-contract";

/**
 * B1.2 — the explicit async-state union. 404 (and a VALID response that
 * carries no posting) is "not-found": the enumeration-safe unavailable copy.
 * Everything else that is not success keeps its own identity — a 5xx, a
 * rejected fetch and a malformed 2xx are OUTAGES and must never wear the
 * "this job is not available" clothes.
 */
type DetailState =
  | { phase: "loading" }
  | { phase: "ready"; job: PublicJobDetail }
  | { phase: "not-found" }
  | { phase: "failed"; code: ResourceFailureCode };

/*
 * B1.3 §2 — the shape check is EXACT and lives in ./public-job-contract:
 * every consumed field is type-checked, every array member must be a real
 * string, localizedSkills must be string→string, and money must be an
 * integer or null. A malformed 2xx can no longer reach phase="ready".
 */

function ListCard({ heading, items, glyph, glyphClass }: { heading: string; items: string[]; glyph: string; glyphClass: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
      <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">{heading}</h2>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-ink/80">
            <span aria-hidden="true" className={`${glyphClass} mt-0.5 shrink-0`}>{glyph}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JobDetailClient({ jobId }: { jobId: string }) {
  const t = useTranslations("careers");
  const locale = useLocale();
  const [state, setState] = useState<DetailState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    // B1.2 — a dependency change (locale, jobId, retry) FIRST returns to
    // loading, so no stale job — and no stale language — can survive a failed
    // follow-up request.
    setState({ phase: "loading" });
    const controller = new AbortController();
    (async () => {
      try {
        const payload = await requestJson<{ job?: unknown; source?: string }>(
          `/api/careers/jobs/${jobId}?locale=${locale}`,
          (body) => (body && typeof body === "object" ? (body as { job?: unknown; source?: string }) : undefined),
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (payload.source !== "db") {
          // a 2xx that is not verifiably the database's projection is
          // MALFORMED — an outage, not a statement about the job
          setState({ phase: "failed", code: "FAILED" });
          return;
        }
        const job = parsePublicJobDetail(payload.job);
        setState(job ? { phase: "ready", job } : { phase: "failed", code: "FAILED" });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        const code: ResourceFailureCode =
          error instanceof ResourceRequestError ? error.code : "FAILED";
        // NOT_FOUND is the one non-success that is an ANSWER about the job —
        // enumeration-safe, same face as draft/private/closed/expired.
        setState(code === "NOT_FOUND" ? { phase: "not-found" } : { phase: "failed", code });
      }
    })();
    return () => controller.abort();
  }, [jobId, locale, attempt]);

  if (state.phase === "loading") {
    return <div className="py-20 text-center text-muted text-sm">{t("jobLoading")}</div>;
  }

  if (state.phase === "failed") {
    // Outage-class states: the Stage 6-A failure surface (role="alert",
    // named 44px retry) — NEVER the "job unavailable" copy.
    return (
      <div className="py-20">
        <h1 className="sr-only">{t("boardTitle")}</h1>
        <ResourceFailureNotice code={state.code} onRetry={retry} />
      </div>
    );
  }

  if (state.phase === "not-found") {
    // One honest, enumeration-safe answer: not published, closed, never
    // existed, or incomplete in this locale. It carries the page's <h1>.
    return (
      <div className="py-20 text-center">
        <h1 className="type-page-title mb-3">{t("jobUnavailable")}</h1>
        <p className="text-muted text-sm mb-6 mx-auto max-w-md leading-relaxed">{t("jobUnavailableBody")}</p>
        <Link href="/careers" className="ds-focus inline-flex min-h-11 items-center gap-1.5 text-signal text-sm hover:underline">
          <span aria-hidden="true" className="rtl:rotate-180 inline-block">←</span> {t("backToBoard")}
        </Link>
      </div>
    );
  }

  const job = state.job;
  // Skill chips: the localized label for this locale; a code without a label
  // renders as the code itself — a locale-independent technical token.
  const skillChips = job.skillCodes.map((code) => job.localizedSkills[code] ?? code);
  // B1.2 §7 — salary via Intl.NumberFormat + localized per-year copy; the raw
  // "onsite/remote/hybrid" enum renders only through its localized label, and
  // an unmapped value renders NOTHING (never a guess).
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.salaryCurrency, locale, (amount) => t("salaryPerYear", { amount }));
  const locationTypeLabel = localizedLocationType(job.locationType, (key) => t(`locationTypeLabels.${key}`));

  return (
    <div>
      <div className="mb-6">
        <Link href="/careers" className="ds-focus inline-flex min-h-11 items-center gap-1.5 text-xs text-muted hover:text-ink font-mono transition-colors">
          <span aria-hidden="true" className="rtl:rotate-180 inline-block">←</span> {t("backToBoard")}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main content — every string below is the locale's translation */}
        <div className="lg:col-span-2 space-y-6">
          <div className="page-header-premium">
            <p className="eyebrow-label mb-2">HERMES OS · {job.departmentLabel}</p>
            <h1 className="type-page-title">{job.title}</h1>
            <p className="mt-2 text-sm text-muted leading-relaxed">{job.shortSummary}</p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("aboutRole")}</h2>
            <p className="text-sm text-ink/80 leading-relaxed">{job.description}</p>
          </div>

          <ListCard heading={t("responsibilities")} items={job.responsibilities} glyph="▸" glyphClass="text-signal" />
          <ListCard heading={t("requirements")} items={job.requirements} glyph="✓" glyphClass="text-ice" />
          <ListCard heading={t("preferredExperience")} items={job.preferredExperience} glyph="＋" glyphClass="text-hermes-gold" />
        </div>

        {/* Sidebar — a row without a complete, LOCALIZED value does not render */}
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4 sticky top-8">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("positionDetails")}</h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted font-mono text-xs">{t("locationLabel")}</span>
                <span className="text-ink">{job.location}</span>
              </div>
              {locationTypeLabel && (
                <div className="flex items-center justify-between">
                  <span className="text-muted font-mono text-xs">{t("typeLabel")}</span>
                  <span className="text-ink">{locationTypeLabel}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted font-mono text-xs">{t("departmentDetailLabel")}</span>
                <span className="text-ink">{job.departmentLabel}</span>
              </div>
              {salary && (
                <div className="flex items-center justify-between">
                  <span className="text-muted font-mono text-xs">{t("compensationLabel")}</span>
                  <span className="text-signal font-mono text-xs">{salary}</span>
                </div>
              )}
            </div>

            {skillChips.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("keySkills")}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {skillChips.map((label) => (
                    <span key={label} className="rounded-md bg-bg px-2 py-0.5 text-[10px] font-mono text-muted border border-line">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/*
              B1.4 §1 — the apply affordance is gated on APPLY_JOURNEY_OPEN, not
              on the owner flag alone: acceptance being authorized does NOT mean
              the server can accept, because B2 still owns the orchestration.
              While either fact is false there is no link, no button and nothing
              focusable here — only a plain statement that applications are not
              open, so the page never routes a person toward a guaranteed
              refusal.
            */}
            {APPLY_JOURNEY_OPEN ? (
              <Link
                href={`/careers/apply/${job.id}`}
                className="block w-full rounded-lg bg-signal text-bg text-center py-2.5 text-sm font-mono font-semibold hover:bg-signal/90 transition-colors"
              >
                {t("applyCta")}
              </Link>
            ) : (
              <p
                role="note"
                className="block w-full rounded-lg border border-line bg-bg text-center py-2.5 text-sm font-mono text-muted"
              >
                {t("applicationsNotOpen")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
