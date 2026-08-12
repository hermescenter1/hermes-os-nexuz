"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ds/cn";
import { buttonVariants } from "@/components/ds/logic";

/**
 * PHASE 102 — the error boundary for the public Video Hub.
 *
 * NOTHING FROM `error` REACHES THE DOM. Next hands this boundary the thrown
 * error, and in a production build its `message` is already redacted — but not in
 * a self-hosted development or preview deployment, where it can carry a Prisma
 * error, a file path or another tenant's identifier. The wording below is chosen
 * from the catalog by the component, exactly as `MediaErrorState` does it, so
 * there is no path by which server text becomes page text. The digest is logged
 * to the console for correlation and is never rendered either.
 *
 * `reset()` is offered because a media read is retryable — the failure modes here
 * are a transient database or storage outage, not an authorization decision.
 */
export default function VideosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("mediaHub");

  useEffect(() => {
    // Correlation only. Never surfaced to the visitor.
    console.error("[videos] render failed", error.digest ?? "no-digest");
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-6 py-20"
    >
      <h1 className="text-role-h2 font-bold text-text-primary">{t("states.error")}</h1>
      <p className="text-body text-text-secondary">{t("states.errorHint")}</p>
      <button type="button" onClick={reset} className={cn(buttonVariants("primary", "md"))}>
        {t("states.retry")}
      </button>
    </div>
  );
}
