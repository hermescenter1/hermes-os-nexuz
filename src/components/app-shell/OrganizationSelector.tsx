"use client";

// PHASE 87C — Organization / Site context affordances (display-only).
//
// TRUTHFUL BY DESIGN: no client-facing endpoint exists today that lists a
// user's organizations or switches sites (audit: org identity is server-derived
// per request; POST-only /api/organizations). These selectors therefore render
// the CURRENT context when the server provides it and an honest empty state
// when it does not — they never fabricate organizations or fire new API calls.
// The full prop contract (loading / empty / disabled / current) is in place so
// a later phase can light them up without UI changes.

import { useTranslations } from "next-intl";
import { cn, Skeleton, TechnicalValue } from "@/components/ds";

interface ContextSelectorProps {
  /** Current context name resolved server-side; null = no context. */
  name?: string | null;
  /** Optional technical code (site codes stay LTR inside RTL). */
  code?: string | null;
  loading?: boolean;
  className?: string;
}

function ContextRow({
  label,
  empty,
  name,
  code,
  loading,
  className,
}: ContextSelectorProps & { label: string; empty: string }) {
  const t = useTranslations("appShell.shell");
  return (
    <div
      // A non-interactive context display — deliberately NOT a button, so it is
      // never announced as an actionable selector while switching is impossible.
      aria-label={`${label}: ${name ?? empty}`}
      title={t("contextUnavailable")}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-sm border border-border-default",
        "bg-surface-interactive px-3",
        className,
      )}
    >
      <span className="text-label-compact font-semibold uppercase text-text-muted">{label}</span>
      {loading ? (
        <Skeleton shape="text" width="60%" />
      ) : (
        <span className={cn("truncate text-label", name ? "font-semibold text-text-primary" : "text-text-muted")}>
          {name ?? empty}
          {name && code ? (
            <>
              {" · "}
              <TechnicalValue>{code}</TechnicalValue>
            </>
          ) : null}
        </span>
      )}
    </div>
  );
}

export function OrganizationSelector(props: ContextSelectorProps) {
  const t = useTranslations("appShell.shell");
  return <ContextRow {...props} label={t("organizationLabel")} empty={t("noOrganizationContext")} />;
}

export function SiteSelector(props: ContextSelectorProps) {
  const t = useTranslations("appShell.shell");
  return <ContextRow {...props} label={t("siteLabel")} empty={t("noSiteContext")} />;
}
