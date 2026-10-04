"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations }       from "next-intl";
import { Link }                             from "@/i18n/navigation";
import { ResourceFailureNotice } from "@/components/ui/ResourceFailureNotice";
import { requestJson, ResourceRequestError, type ResourceFailureCode } from "@/lib/client/resource-request";
import { parsePublicJobDetail, type PublicJobDetail } from "./public-job-contract";
// The dependency-free flag module: the SAME constant the server route reads,
// without pulling Prisma/pg into the client bundle (see acceptance-flag.ts).
import { APPLICATION_ACCEPTANCE_AUTHORIZED } from "@/lib/ats/acceptance-flag";
import { Stage1ApplicationForm } from "./Stage1ApplicationForm";

/**
 * The public application surface.
 *
 * ORDER OF TRUTH
 * --------------
 * The posting is verified FIRST, in the active locale, against the database
 * (`source === "db"`); an outage, an unknown posting and a posting that is not
 * published in this language each get their own honest answer and NO fields.
 * Only a verified posting reaches the owner gate:
 *
 *   APPLICATION_ACCEPTANCE_AUTHORIZED = false → the honest "not accepting"
 *     state: no fields, no submit control, no claim of receipt or contact;
 *   APPLICATION_ACCEPTANCE_AUTHORIZED = true  → the Stage-1 form
 *     (`./Stage1ApplicationForm`), built on `./stage1-contract` and validated
 *     with the server's own `stage1ApplicationSchema`.
 *
 * The flag is the SAME constant the server route reads, so the two cannot
 * disagree. Nothing in this file can bypass the route: it still refuses, with
 * one generic answer, when the organization's intake is closed, no approved
 * retention policy is in effect, or the posting stops being eligible.
 *
 * WHAT WAS REMOVED (retired contract, B1.3 §1)
 * --------------------------------------------
 * The pre-B1 vocabulary — `name`, `location`, `coverLetter`, `totalYearsExp`,
 * `skills` and a `workAuthorization` select defaulting to `"citizen"` — is
 * DELETED, not hidden; the server's `.strict()` schema rejects every one of
 * those keys, and the last of them invented a legal fact about the applicant.
 */

type VerifyState =
  | { phase: "verifying" }
  | { phase: "verified"; job: PublicJobDetail }
  | { phase: "not-found" }
  | { phase: "failed"; code: ResourceFailureCode };

export function ApplyFormClient({ jobId }: { jobId: string }) {
  const t = useTranslations("careers.apply");
  const locale = useLocale();
  const [state, setState] = useState<VerifyState>({ phase: "verifying" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    // Every dependency change returns to `verifying` first, so a failed
    // follow-up can never leave the previous posting — or the previous
    // language — on screen.
    setState({ phase: "verifying" });
    const controller = new AbortController();
    (async () => {
      try {
        // B1.3 — the ACTIVE locale is part of the request: the API serves a
        // posting only where that locale's translation is complete, and the
        // response is the real PublicJobDetail shape.
        const payload = await requestJson<{ job?: unknown; source?: string }>(
          `/api/careers/jobs/${jobId}?locale=${locale}`,
          (body) => (body && typeof body === "object" ? (body as { job?: unknown; source?: string }) : undefined),
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (payload.source !== "db") {
          setState({ phase: "failed", code: "FAILED" });
          return;
        }
        const job = parsePublicJobDetail(payload.job);
        setState(job ? { phase: "verified", job } : { phase: "failed", code: "FAILED" });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        const code: ResourceFailureCode =
          error instanceof ResourceRequestError ? error.code : "FAILED";
        setState(code === "NOT_FOUND" ? { phase: "not-found" } : { phase: "failed", code });
      }
    })();
    return () => controller.abort();
  }, [jobId, locale, attempt]);

  if (state.phase === "verifying") {
    /*
      Final.1.2 §E — see JobDetailClient: this is the branch the server
      renders, so it is the branch that decides whether the delivered
      document has a heading. aria-busy stays on the region that is actually
      pending, not on the heading.
    */
    return (
      <div className="py-24">
        <h1 className="type-page-title mb-4 text-center">{t("titleGeneric")}</h1>
        <p className="text-center text-sm text-muted" aria-busy="true">{t("verifying")}</p>
      </div>
    );
  }

  // Outage class — never dressed as a statement about the posting.
  if (state.phase === "failed") {
    return (
      <div className="mx-auto max-w-xl py-20">
        {/*
          Final.1.2 §E — visible heading above the alert, same reasoning as
          the job detail outage: identity first, failure second. The string,
          the accessible name and the fail-closed behaviour are unchanged.
        */}
        <h1 className="type-page-title mb-4 text-center">{t("titleGeneric")}</h1>
        <ResourceFailureNotice code={state.code} onRetry={retry} />
      </div>
    );
  }

  // No such public posting: unknown, draft, private, closed, expired, or not
  // translated into this locale — one indistinguishable answer.
  if (state.phase === "not-found") {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <h1 className="type-page-title mb-3">{t("unavailableTitle")}</h1>
        <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted">{t("unavailableBody")}</p>
        <Link
          href="/careers"
          className="ds-focus inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-signal/90"
        >
          {t("unavailableCta")}
          <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span>
        </Link>
      </div>
    );
  }

  const job = state.job;

  /*
   * The posting is real and published — but the owner gate is closed. The flag
   * is the SAME constant the server route reads (`@/lib/ats/acceptance-flag`,
   * which `@/lib/ats/application` re-exports rather than redeclares), so while
   * it is false no field is ever rendered.
   */
  if (!APPLICATION_ACCEPTANCE_AUTHORIZED) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <div className="mb-6">
          <Link href={`/careers/${jobId}`} className="ds-focus font-mono text-xs text-muted transition-colors hover:text-ink">
            <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span> {t("backToJob")}
          </Link>
        </div>
        <h1 className="type-page-title mb-3">{t("notAcceptingTitle")}</h1>
        <p className="mx-auto mb-3 max-w-md text-sm leading-relaxed text-muted">{t("notAcceptingBody")}</p>
        <p className="mx-auto mb-8 max-w-md type-secondary">{job.title}</p>
        <Link
          href="/careers"
          className="ds-focus inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-6 py-2.5 text-sm text-muted transition-colors hover:text-ink"
        >
          {t("notAcceptingCta")}
        </Link>
      </div>
    );
  }

  // Verified, published in this locale, and the owner gate is open.
  return <Stage1ApplicationForm jobId={jobId} jobTitle={job.title} locale={locale} />;
}
