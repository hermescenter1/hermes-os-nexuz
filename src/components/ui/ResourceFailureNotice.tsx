"use client";

/**
 * PHASE 107 STAGE 6-A — the one place a failed request becomes words.
 *
 * The Stage 5 evidence found 73 cells where a request had failed and the page
 * said nothing at all: the components had no error state to render, so a signed
 * -out user was shown an empty table and told they had no records.
 *
 * This turns a `ResourceFailureCode` into localized copy and the ONE action that
 * can actually help. That last part is why the codes are kept apart:
 *
 *   - an expired session needs a sign-in link; retrying only repeats the 401
 *   - a permission failure needs an administrator, so it offers no action at all
 *     rather than a button that cannot succeed
 *   - a network or server failure is the only kind worth a retry
 *
 * Copy lives in `errors.resource` in all three catalogues, so every module gets
 * the same wording for the same failure in fa, en and de.
 */

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ErrorState } from "@/components/ds/ErrorState";
import { buttonVariants } from "@/components/ds/logic";
import { isRetryable, type ResourceFailureCode } from "@/lib/client/resource-request";

/** Message keys for each failure. Total by construction — no fallback code. */
const COPY: Record<ResourceFailureCode, { title: string; hint: string }> = {
  UNAUTHENTICATED: { title: "unauthenticatedTitle", hint: "unauthenticatedHint" },
  ORGANIZATION_CONTEXT_REQUIRED: { title: "orgContextTitle",  hint: "orgContextHint" },
  SITE_CONTEXT_REQUIRED:         { title: "siteContextTitle", hint: "siteContextHint" },
  FORBIDDEN:       { title: "forbiddenTitle",       hint: "forbiddenHint" },
  NOT_FOUND:       { title: "notFoundTitle",        hint: "notFoundHint" },
  INVALID:         { title: "invalidTitle",         hint: "invalidHint" },
  RATE_LIMITED:    { title: "rateLimitedTitle",     hint: "rateLimitedHint" },
  UNAVAILABLE:     { title: "unavailableTitle",     hint: "unavailableHint" },
  OFFLINE:         { title: "offlineTitle",         hint: "offlineHint" },
  FAILED:          { title: "failedTitle",          hint: "failedHint" },
};

/**
 * The machine-readable half of the same statement.
 *
 * An auditor reading a rendered page could previously only guess at the state
 * from the words on it, which meant guessing in three languages: the Stage 5
 * detector looked for /error|failed|خطا|fehler/ and so read a perfectly correct
 * "Sign-in required" as an unhandled failure. This attribute says what the state
 * IS, in one vocabulary, independent of language.
 *
 * It carries no locale, no route, no tenant and no identifier — only which of a
 * closed set of states the surface is in — and it changes nothing visually.
 */
export const ASYNC_STATE: Record<ResourceFailureCode, string> = {
  UNAUTHENTICATED: "auth-required",
  ORGANIZATION_CONTEXT_REQUIRED: "org-context-required",
  SITE_CONTEXT_REQUIRED:         "site-context-required",
  FORBIDDEN:       "forbidden",
  NOT_FOUND:       "not-found",
  INVALID:         "server-error",
  RATE_LIMITED:    "server-error",
  UNAVAILABLE:     "server-error",
  OFFLINE:         "network-error",
  FAILED:          "server-error",
};

/**
 * The same copy, for places where a full panel is the wrong shape — a failed
 * save belongs beside the button that failed, not in place of the form.
 */
export function useResourceFailureCopy(code: ResourceFailureCode): { title: string; hint: string } {
  const t = useTranslations("errors.resource");
  return { title: t(COPY[code].title), hint: t(COPY[code].hint) };
}

export interface ResourceFailureNoticeProps {
  code: ResourceFailureCode;
  /** Offered only when the failure is one a second attempt could survive. */
  onRetry?: () => void;
  className?: string;
}

export function ResourceFailureNotice({ code, onRetry, className }: ResourceFailureNoticeProps) {
  const t = useTranslations("errors.resource");
  const locale = useLocale();
  const copy = COPY[code];

  // A 401 is the one case with a better answer than "try again".
  const signIn = code === "UNAUTHENTICATED" ? (
    // Styled through the design system's own button recipe rather than a
    // hand-written copy of it, so it cannot drift from a real ds Button.
    // `lg` is the 44px size: this is the only way out of the state, and it has
    // to be reachable with a thumb.
    <Link href={`/${locale}/auth/login`} className={buttonVariants("secondary", "lg")}>
      {t("signIn")}
    </Link>
  ) : undefined;

  return (
    // `display: contents` keeps this wrapper out of layout entirely, so the
    // attribute is observable without the page rendering one pixel differently.
    <div data-async-state={ASYNC_STATE[code]} style={{ display: "contents" }}>
      <ErrorState
        title={t(copy.title)}
        message={t(copy.hint)}
        action={signIn}
        onRetry={signIn || !isRetryable(code) ? undefined : onRetry}
        retryLabel={t("retry")}
        className={className}
      />
    </div>
  );
}
