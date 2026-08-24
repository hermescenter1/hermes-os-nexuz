"use client";

// PHASE 94C1 — helpers both OT lists need.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchSites } from "@/lib/ot-operations/api";
import type { OtFailureCode } from "@/lib/ot-operations/api";
import type { OtStateCopy } from "./OtStates";

/**
 * Site names, keyed by id.
 *
 * The site registry is authorized SEPARATELY from the OT lists
 * (`view_industrial` rather than `view_ot_*`), so an operator can legitimately
 * be allowed to list gateways while being unable to name their sites. A failure
 * therefore degrades to an empty map — the list still renders, and the site
 * cell falls back to the identifier — rather than failing the page.
 */
export function useSiteNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    fetchSites(controller.signal)
      .then((sites) => {
        if (controller.signal.aborted) return;
        setNames(Object.fromEntries(sites.map((site) => [site.id, site.name])));
      })
      .catch(() => {
        // Deliberately silent: the names are an enhancement, and an operator
        // without site-registry access must not see an error for it.
      });
    return () => controller.abort();
  }, []);

  return names;
}

/** Options for the site filter, sorted by the name an operator actually reads. */
export function useSiteOptions(siteNames: Record<string, string>) {
  return useMemo(
    () =>
      Object.entries(siteNames)
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [siteNames],
  );
}

/**
 * The localized copy for every failure code.
 *
 * Built once here so both lists answer a given code identically, and so no
 * component is tempted to render the server's own English `message` field.
 */
export function useFailureCopy(): Record<OtFailureCode, OtStateCopy> {
  const t = useTranslations("otEdge.states");
  return useMemo(
    () => ({
      UNAUTHENTICATED: { title: t("unauthenticatedTitle"), body: t("unauthenticatedBody") },
      // PHASE 107 STAGE 6-A — a signed-in operator with no organization or site
      // selected must not be told to sign in again. The wording points at the
      // selection they actually need to make.
      ORGANIZATION_CONTEXT_REQUIRED: { title: t("orgContextTitle"), body: t("orgContextBody") },
      SITE_CONTEXT_REQUIRED: { title: t("siteContextTitle"), body: t("siteContextBody") },
      CONNECTION_FAILED: { title: t("connectionFailedTitle"), body: t("connectionFailedBody") },
      FORBIDDEN: { title: t("forbiddenTitle"), body: t("forbiddenBody") },
      NOT_FOUND: { title: t("notFoundTitle"), body: t("notFoundBody") },
      INVALID_QUERY: { title: t("invalidQueryTitle"), body: t("invalidQueryBody") },
      RATE_LIMITED: { title: t("rateLimitedTitle"), body: t("rateLimitedBody") },
      UNAVAILABLE: { title: t("unavailableTitle"), body: t("unavailableBody") },
      FAILED: { title: t("failedTitle"), body: t("failedBody") },
    }),
    [t],
  );
}
