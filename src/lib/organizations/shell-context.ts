/**
 * The application shell's organization context.
 *
 * PHASE 104 R1 (V-M7) built this because `AppShell` hardcoded
 * `organizationName = null`, so the sidebar told an ACTIVE OWNER of an
 * organization that they had "No organization context". PHASE 110-A1.0b keeps
 * that fix and removes the second defect underneath it: the shell answered the
 * question with its own `findFirst` + `orderBy: { createdAt: "asc" }`, in
 * parallel with the API path doing the same thing separately.
 *
 * Two independent lookups meant two places that could disagree, and for a
 * reader with more than one membership they DID disagree invisibly: the sidebar
 * named whichever organization sorted first, the API scoped to whichever
 * organization sorted first, and the fact that either was an arbitrary pick was
 * unobservable on both sides. There is now one resolver, one selection and one
 * answer.
 *
 * The states keep their names and meanings, with one addition:
 *
 *   resolved     — there is an organization, and this is it;
 *   selection    — PHASE 110-A1.0b: there are SEVERAL and none is chosen. The
 *                  shell must say so rather than name one of them;
 *   none         — the account genuinely has no ACTIVE membership;
 *   unavailable  — the question could not be asked. Reporting this as "no
 *                  organization" would invent a fact about the account out of
 *                  an outage.
 *
 * DISPLAY ONLY. This widens nothing: it reads the context the server resolves
 * for this request, and every route keeps its own permission check.
 */

import { resolveTenantDecisionFromSession } from "@/lib/tenant-selection/selection";

export type ShellOrgContext =
  | {
      state: "resolved";
      organizationId: string;
      organizationName: string;
      /** True when the reader has several memberships and may switch. */
      selectable: boolean;
    }
  | { state: "selection" }
  | { state: "none" }
  | { state: "unavailable" };

/**
 * Resolve the shell's organization context.
 *
 * The cookie jar is passed in rather than read here, so this module never
 * imports `next/headers` — which is what lets one selection implementation
 * serve both a server component and a route handler instead of two.
 *
 * The old `userId` parameter is gone. Taking identity from a caller is exactly
 * the pattern this phase removes: the resolver establishes identity itself,
 * from a session it verifies and whose revocation it checks. A caller cannot
 * hand it somebody else's id, because it no longer accepts one.
 */
export async function getShellOrgContext(jar: {
  get: (name: string) => { value: string } | undefined;
}): Promise<ShellOrgContext> {
  const decision = await resolveTenantDecisionFromSession(jar);

  if (decision.granted) {
    return {
      state: "resolved",
      organizationId: decision.organizationId,
      /*
       * The slug, not the display name.
       *
       * A context exists only if the organization row loaded, and the resolver
       * proves a slug as part of that. Asking for `name` here would mean a
       * second query for a string the chip can live without — and the previous
       * version reported a membership whose organization had no readable name
       * as an OUTAGE, which was never true.
       */
      organizationName: decision.organizationSlug,
      selectable: decision.selectable,
    };
  }

  switch (decision.code) {
    // Signed out. The shell renders its signed-out chrome and has nothing to
    // resolve — not an outage, and not an empty organization list.
    case "AUTHENTICATION_REQUIRED":
      return { state: "none" };
    case "ORGANIZATION_CONTEXT_REQUIRED":
      return { state: "none" };
    case "ORGANIZATION_SELECTION_REQUIRED":
      return { state: "selection" };
    case "ORGANIZATION_CONTEXT_UNAVAILABLE":
      return { state: "unavailable" };
  }
}
