import Link from "next/link";
import { Card } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { useTranslations } from "next-intl";
import type { MediaInstructorView } from "./view-model";

/**
 * PHASE 102 — the instructor attribution panel on a watch page.
 *
 * NO FABRICATED IDENTITY. An instructor without an uploaded avatar gets a monogram
 * derived from their own display name, never a stock portrait or a generated face.
 * A missing headline renders nothing at all rather than a plausible-sounding
 * placeholder — inventing a job title for a real, named person is a fabrication
 * with a subject attached to it.
 *
 * `videoCount === null` means "the caller did not count", which is not zero, so it
 * is omitted rather than rendered as "0 videos".
 *
 * The profile link is conditional: `href === null` is the honest representation of
 * "this deployment has no instructor profile route", and a link to nowhere is
 * worse than plain text.
 *
 * Server-renderable.
 */
export interface InstructorCardProps {
  instructor: MediaInstructorView;
  className?: string;
}

/** First character of the display name — from their name, not from a generator. */
function monogram(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? Array.from(trimmed)[0].toUpperCase() : "?";
}

export function InstructorCard({ instructor, className }: InstructorCardProps) {
  const t = useTranslations("mediaHub");

  return (
    <Card variant="soft" className={cn("flex items-start gap-4", className)}>
      {instructor.avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- next/image would
           route this through the sharp-backed optimizer; sharp is overrides-only
           here and gated by release engineering (ADR §2.6). */
        <img
          src={instructor.avatarUrl}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-full border border-border-default object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border-default bg-surface-interactive text-title-lg font-semibold text-brand-primary"
        >
          {monogram(instructor.name)}
        </span>
      )}

      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-label font-semibold text-text-primary">
          {instructor.href ? (
            <Link href={instructor.href} className="ds-focus rounded-xs hover:text-brand-primary">
              {instructor.name}
            </Link>
          ) : (
            instructor.name
          )}
        </p>
        {instructor.headline ? (
          <p className="text-body-compact text-text-secondary">{instructor.headline}</p>
        ) : null}
        {instructor.videoCount !== null ? (
          <p className="text-label-compact text-text-muted">
            {t("instructor.videoCount", { count: instructor.videoCount })}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
