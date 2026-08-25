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

/**
 * PHASE 104-B1.3 — the public application surface, closed honestly.
 *
 * WHY THERE IS NO FORM HERE
 * -------------------------
 * The server refuses every application:
 *
 *   APPLICATION_ACCEPTANCE_AUTHORIZED     = false   (owner gate, B1)
 *   APPLICATION_ORCHESTRATION_IMPLEMENTED = NO      (B2 work)
 *
 * A form that collects a person's name, e-mail and résumé and then posts them
 * into a guaranteed refusal is not a form — it is a way of taking data under a
 * false impression. So while acceptance is off this component offers NO
 * fields, NO submit control and NO application CTA, and makes NO claim of
 * receipt or later contact. It says the one true thing: applications are not
 * open for this position.
 *
 * WHAT WAS REMOVED (retired contract, B1.3 §1)
 * --------------------------------------------
 * The previous version implemented the pre-B1 vocabulary — `name`,
 * `location`, `coverLetter`, `totalYearsExp`, `skills` and a
 * `workAuthorization` select defaulting to `"citizen"` — none of which the
 * server's `.strict()` Stage-1 schema accepts, and the last of which invented
 * a legal fact about the applicant. It also posted without an idempotency key
 * and verified the posting without a locale. All of it is DELETED, not
 * hidden: the future contract lives in `./stage1-contract` (pure, tested,
 * unwired), and enabling it is a B2 SERVER change — no edit to this file can
 * bypass the route's refusal.
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
    return (
      <div className="py-24 text-center text-sm text-muted" aria-busy="true">
        {t("verifying")}
      </div>
    );
  }

  // Outage class — never dressed as a statement about the posting.
  if (state.phase === "failed") {
    return (
      <div className="mx-auto max-w-xl py-20">
        <h1 className="sr-only">{t("titleGeneric")}</h1>
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
   * The posting is real and published — and applications are still not being
   * accepted. This branch is deliberately unconditional on the client: the flag
   * is the SAME constant the server route reads (`@/lib/ats/acceptance-flag`,
   * which `@/lib/ats/application` re-exports rather than redeclares), so the
   * two cannot disagree; and there is no `else` that renders a form, because no
   * correct form exists until B2 ships the orchestration.
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

  /*
   * Unreachable while the gate above holds. When B2 enables acceptance it
   * builds the Stage-1 form on `./stage1-contract` — the payload builder and
   * the Web Crypto idempotency key that already match the server schema
   * exactly — and wires it to the orchestrated route. Rendering the honest
   * state is the correct behaviour for every state this stage can reach.
   */
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <h1 className="type-page-title mb-3">{t("notAcceptingTitle")}</h1>
      <p className="mx-auto max-w-md text-sm leading-relaxed text-muted">{t("notAcceptingBody")}</p>
    </div>
  );
}
