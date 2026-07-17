"use client";

// PHASE 87E — password strength meter on ds tokens. Purely presentational; the
// score comes from the existing scorePassword() policy (unchanged). Five
// segments + a localized label; the label is announced politely.

import { useTranslations } from "next-intl";
import { cn } from "@/components/ds";

const SCORE_KEY = ["veryWeak", "weak", "fair", "strong", "veryStrong"] as const;
const SCORE_TONE = [
  "bg-status-danger",
  "bg-status-warning",
  "bg-status-warning",
  "bg-intelligence-azure",
  "bg-status-success",
] as const;
const SCORE_TEXT = [
  "text-status-danger",
  "text-status-warning",
  "text-status-warning",
  "text-intelligence-azure",
  "text-status-success",
] as const;

export function PasswordStrengthMeter({ score }: { score: 0 | 1 | 2 | 3 | 4 }) {
  const t = useTranslations("authExperience.strength");
  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-fast",
              i <= score ? SCORE_TONE[score] : "bg-surface-interactive",
            )}
          />
        ))}
      </div>
      <p className={cn("mt-1 text-caption font-medium", SCORE_TEXT[score])} aria-live="polite">
        {t(SCORE_KEY[score])}
      </p>
    </div>
  );
}
