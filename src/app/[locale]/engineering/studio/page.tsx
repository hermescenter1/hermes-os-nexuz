/**
 * PHASE 109-C1 — /[locale]/engineering/studio
 *
 * AUTHORIZATION happens in `src/middleware.ts`, on every request, before this
 * page is served. `/engineering` is registered in `PROTECTED_PATHS`
 * (`src/lib/auth/rbac.ts`) and `isAuthorizedForPath` routes it to
 * `canAccessEngineering(role)`. This page adds no guard, no role and no session
 * concept of its own — a second authorization path beside the one the product
 * already enforces is how the two drift apart.
 *
 * ROUTE GENERATION. Round 1 declared `export const dynamic = "force-dynamic"`
 * and then reported the route as dynamic; the production build disagreed and
 * emitted `●` (prerendered), exactly as it does for every sibling under
 * `/[locale]/engineering`. The declaration was a claim the build did not honour,
 * so it is removed rather than left to contradict the evidence.
 *
 * Prerendering is CORRECT here and does not weaken the boundary:
 *
 *   - the page body is a pure function of committed constants. The workspace
 *     comes from the local demo adapter, which reads no cookie, no header, no
 *     database and no environment. There is nothing request-specific, and no
 *     secret, in the generated HTML;
 *   - middleware runs for this path on every request regardless of whether the
 *     response is prerendered, so an unauthenticated visitor is redirected to
 *     the login route and never receives the HTML.
 *
 * If a future round makes the workspace depend on the request — a real project
 * loaded per tenant, say — that page must become dynamic, and the contract test
 * in `phase109c1-invariants` is what will force the question.
 */

import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { StudioWorkspace } from "@/components/automation-studio/StudioWorkspace";
import { resolveWorkspaceSource } from "@/lib/automation-studio";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "automationStudio" });
  return {
    // Localised, not a hard-coded English string. The suffix is the product
    // name, which is deliberately not translated.
    title: `${t("metaTitle")} · Hermes OS`,
    // An authenticated engineering surface is never indexed.
    robots: { index: false, follow: false },
  };
}

export default async function AutomationStudioPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Resolved on the SERVER and handed down as an immutable descriptor. There is
  // no search parameter, cookie or client branch that can select another mode,
  // and the classification is written literally as SIMULATED by the adapter
  // rather than inferred from the absence of a live connection.
  const source = resolveWorkspaceSource();

  return (
    <div className="h-full min-h-0">
      <StudioWorkspace source={source} />
    </div>
  );
}
