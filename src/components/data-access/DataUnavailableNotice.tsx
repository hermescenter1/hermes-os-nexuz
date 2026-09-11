/**
 * PHASE 110-A2.0 — a server-rendered honest state for a data layer that refused.
 *
 * The five asset section pages used to enrich real assets with `MOCK_*` arrays,
 * so they had no failure state at all: there was nothing that could fail. Now
 * that the layer reaches PostgreSQL and refuses fail-closed, each page needs to
 * say WHICH refusal happened, because the remedies are opposite:
 *
 *   sign in            the session is gone
 *   ask an admin       the account is a member of nothing
 *   choose one         the account is a member of several and picked none
 *   retry              a dependency is not answering
 *
 * Rendering all four as one "no data" screen is what this slice exists to stop.
 *
 * NO NEW COPY. The four sentences already exist in `errors.resource` in fa, en
 * and de — they were written for the browser-side failure vocabulary in Phase
 * 107 and extended in 110-A1.0b. Reusing them keeps the wording identical to
 * what the client surfaces show for the same states, and adds no leaves to the
 * three catalogues or to the German gate's pinned count.
 *
 * RTL is inherited: `ErrorState` centres its content and carries no directional
 * padding, and the page is already inside the locale layout that sets `dir`.
 */

import { getTranslations } from "next-intl/server";

import { ErrorState } from "@/components/ds/ErrorState";
import type { DataScopeRefusal } from "@/lib/data-access/tenant-scope";

/** Which pair of existing `errors.resource` keys each refusal renders. */
const COPY: Record<DataScopeRefusal, { title: string; hint: string }> = {
  AUTHENTICATION_REQUIRED: { title: "unauthenticatedTitle", hint: "unauthenticatedHint" },
  ORGANIZATION_CONTEXT_REQUIRED: { title: "orgContextTitle", hint: "orgContextHint" },
  ORGANIZATION_SELECTION_REQUIRED: { title: "orgSelectionTitle", hint: "orgSelectionHint" },
  ORGANIZATION_CONTEXT_UNAVAILABLE: { title: "unavailableTitle", hint: "unavailableHint" },
  /*
   * PHASE 110-A2.0 — an internal fault, kept apart from the outage above.
   *
   * 503 says "a dependency is not answering, try again"; 500 says "the server
   * is broken and a retry will not help". Showing the retry wording for a
   * `TypeError` in our own code sends the reader round a loop. The existing
   * generic failure copy says the right thing and adds no catalogue leaf.
   */
  INTERNAL_ERROR: { title: "failedTitle", hint: "failedHint" },
};

/**
 * The machine-readable half of the same statement.
 *
 * An auditor reading a rendered page should not have to infer the state from a
 * sentence in one of three languages. Mirrors `ASYNC_STATE` in
 * `ResourceFailureNotice`, and deliberately uses the same values so one
 * vocabulary describes both halves of the application.
 */
const DATA_STATE: Record<DataScopeRefusal, string> = {
  AUTHENTICATION_REQUIRED: "auth-required",
  ORGANIZATION_CONTEXT_REQUIRED: "org-context-required",
  ORGANIZATION_SELECTION_REQUIRED: "org-selection-required",
  ORGANIZATION_CONTEXT_UNAVAILABLE: "server-error",
  INTERNAL_ERROR: "server-error",
};

export async function DataUnavailableNotice({ code }: { code: DataScopeRefusal }) {
  const t = await getTranslations("errors.resource");
  const copy = COPY[code];

  return (
    <div data-async-state={DATA_STATE[code]}>
      <ErrorState title={t(copy.title)} message={t(copy.hint)} />
    </div>
  );
}
