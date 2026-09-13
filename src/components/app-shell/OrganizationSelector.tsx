"use client";

// PHASE 87C — Organization / Site context affordances.
//
// TRUTHFUL BY DESIGN: these rows render the CURRENT context when the server
// provides it and an honest empty state when it does not. They never fabricate
// an organization or a site.
//
// PHASE 110-A1.0b — the ORGANIZATION half is no longer display-only, and this
// comment used to say the opposite: "no client-facing endpoint exists today
// that lists a user's organizations or switches sites". One does now —
// `/api/tenant/context` — and `OrganizationSwitcher` beside this file consumes
// it. This row still only DISPLAYS; switching lives in that component, so the
// non-interactive element below stays non-interactive and is not announced as
// something it cannot do.
//
// The SITE half is unchanged and still genuinely unbuilt: no per-request site
// selection exists, so the site chip keeps its honest empty state.

import { useTranslations } from "next-intl";
import { cn, Skeleton, TechnicalValue } from "@/components/ds";

interface ContextSelectorProps {
  /** Current context name resolved server-side; null = no context. */
  name?: string | null;
  /**
   * PHASE 104 R1 (V-M7) - the context could not be RESOLVED (store down or
   * the query failed), which is NOT the same as the account having none.
   * Rendering an outage as an empty state states a fact about the user that
   * was never established.
   */
  unavailable?: boolean;
  /**
   * PHASE 110-A1.0b - the reader belongs to SEVERAL organizations and has
   * chosen none. Distinct from `unavailable` (the question could not be asked)
   * and from an empty name (the account has no membership): this one is a
   * choice waiting to be made, and saying "No organization" to somebody who
   * holds three of them is simply false.
   */
  selectionRequired?: boolean;
  /** Optional technical code (site codes stay LTR inside RTL). */
  code?: string | null;
  loading?: boolean;
  className?: string;
}

function ContextRow({
  label,
  empty,
  name,
  unavailable,
  selectionRequired,
  code,
  loading,
  className,
}: ContextSelectorProps & { label: string; empty: string }) {
  const t = useTranslations("appShell.shell");
  /* Four distinct states, never collapsed: a name, a pending choice, an honest
     empty, or an explicit "could not be determined". The order matters - a
     reader with several memberships must not fall through to the empty state,
     which is the one sentence that is definitely wrong for them. */
  const value =
    name ?? (selectionRequired ? t("contextSelectionRequired") : unavailable ? t("contextUnresolved") : empty);
  return (
    <div
      // A non-interactive context display — deliberately NOT a button, so it is
      // never announced as an actionable selector while switching is impossible.
      aria-label={`${label}: ${value}`}
      // The full value, so nothing depends on the rendered width.
      title={name ? `${label}: ${name}` : t("contextUnavailable")}
      className={cn(
        // PHASE 104 R1 (V-M7) - `h-9` + `truncate` cut the empty state itself
        // to "No organizatio...". The row now grows to fit its content.
        "flex min-h-9 w-full items-start gap-2 rounded-sm border border-border-default py-1.5",
        "bg-surface-interactive px-3",
        className,
      )}
    >
      <span className="mt-px shrink-0 text-label-compact font-semibold uppercase text-text-muted">{label}</span>
      {loading ? (
        <Skeleton shape="text" width="60%" />
      ) : (
        <span className={cn("min-w-0 break-words text-label", name ? "font-semibold text-text-primary" : "text-text-muted")}>
          {value}
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
