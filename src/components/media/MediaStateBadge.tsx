import { Badge } from "@/components/ds";
import { useTranslations } from "next-intl";
import type { MediaLifecycleStatus, MediaProcessingState, MediaSkillLevel } from "./view-model";
import { lifecycleBadgeVariant, processingBadgeVariant, skillLevelBadgeVariant } from "./logic";

/**
 * PHASE 102 — the three status vocabularies of the media hub, as badges.
 *
 * WHY EDITORIAL AND PROCESSING ARE SEPARATE BADGES
 * They answer different questions and they move independently. "PUBLISHED" is an
 * editorial decision a reviewer made; "READY" is a statement about whether the
 * bytes on disk have been validated. An asset can be PUBLISHED and QUARANTINED at
 * the same time, and that combination is precisely the one an operator must see —
 * collapsing the two into one "status" chip would hide it.
 *
 * The variants come from `logic.ts` so the same colour decision is testable
 * without rendering, and so an operator console and a card can never disagree
 * about what amber means.
 *
 * Server-renderable: no state, no handlers, no `use client`.
 */

export interface MediaLifecycleBadgeProps {
  status: MediaLifecycleStatus;
  className?: string;
}

/** Where the asset sits in the editorial workflow (ADR §11). */
export function MediaLifecycleBadge({ status, className }: MediaLifecycleBadgeProps) {
  const t = useTranslations("mediaHub");
  return (
    <Badge variant={lifecycleBadgeVariant(status)} className={className}>
      {t(`lifecycle.${status}`)}
    </Badge>
  );
}

export interface MediaProcessingBadgeProps {
  state: MediaProcessingState;
  className?: string;
}

/**
 * Whether the bytes are servable (ADR §5).
 *
 * READY is rendered too, rather than only the exceptional states. A silent
 * absence of a badge is ambiguous — it could equally mean "fine" or "this
 * surface forgot to check" — and for a state machine advanced by an operator CLI
 * rather than a worker, the affirmative signal is the useful one.
 */
export function MediaProcessingBadge({ state, className }: MediaProcessingBadgeProps) {
  const t = useTranslations("mediaHub");
  return (
    <Badge variant={processingBadgeVariant(state)} className={className}>
      {t(`processing.${state}`)}
    </Badge>
  );
}

export interface MediaSkillLevelBadgeProps {
  /** Null renders nothing — an ungraded asset is not "beginner" by default. */
  level: MediaSkillLevel | null;
  className?: string;
}

export function MediaSkillLevelBadge({ level, className }: MediaSkillLevelBadgeProps) {
  const t = useTranslations("mediaHub");
  if (!level) return null;
  return (
    <Badge variant={skillLevelBadgeVariant(level)} className={className}>
      {t(`skillLevel.${level}`)}
    </Badge>
  );
}
