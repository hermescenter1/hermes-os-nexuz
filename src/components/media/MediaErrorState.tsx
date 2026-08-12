"use client";

import { ErrorState } from "@/components/ds";
import { useTranslations } from "next-intl";

/**
 * PHASE 102 — a failed media read, reported honestly.
 *
 * NO SERVER TEXT IS EVER RENDERED HERE. The caller passes a failure CODE and
 * this component picks the localized wording, exactly as `OtFailure` does for the
 * OT console. That is a security property as much as a translation one: a raw
 * API `message` could carry a database error, a stack frame or another tenant's
 * identifier, and CLAUDE.md's "safe error responses" rule ends at the wire only
 * if the client refuses to echo whatever arrives.
 *
 * The reason codes mirror `MediaFailureReason` in `src/lib/media/db.ts` — mirrored
 * rather than imported, because that module reaches Prisma and must never enter a
 * client bundle. A code the UI does not recognise falls back to UNKNOWN instead of
 * being displayed, so a newly-added server reason degrades to a generic message
 * rather than leaking its identifier onto the page.
 */
export type MediaFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STORAGE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "ERROR"
  | "UNKNOWN";

const KNOWN: readonly MediaFailureCode[] = [
  "FORBIDDEN",
  "NOT_FOUND",
  "STORAGE_UNAVAILABLE",
  "RATE_LIMITED",
  "ERROR",
  "UNKNOWN",
];

/** Unrecognised codes collapse to UNKNOWN rather than reaching the DOM. */
export function normaliseFailureCode(code: string | null | undefined): MediaFailureCode {
  return code !== null && code !== undefined && (KNOWN as readonly string[]).includes(code)
    ? (code as MediaFailureCode)
    : "UNKNOWN";
}

/**
 * Codes worth offering a retry for.
 *
 * A 403 and a 404 will fail identically on every attempt; a retry button on
 * those only invites a user to spend their rate-limit budget discovering that.
 * RATE_LIMITED is excluded for the opposite reason — retrying is what caused it.
 */
export function isRetryableFailure(code: MediaFailureCode): boolean {
  return code === "STORAGE_UNAVAILABLE" || code === "ERROR" || code === "UNKNOWN";
}

export interface MediaErrorStateProps {
  code: string | null | undefined;
  onRetry?: () => void;
  className?: string;
}

export function MediaErrorState({ code, onRetry, className }: MediaErrorStateProps) {
  const t = useTranslations("mediaHub");
  const failure = normaliseFailureCode(code);
  const retry = onRetry && isRetryableFailure(failure) ? onRetry : undefined;
  return (
    <ErrorState
      className={className}
      title={t(`failure.${failure}.title`)}
      message={t(`failure.${failure}.body`)}
      onRetry={retry}
      retryLabel={t("failure.retry")}
    />
  );
}
