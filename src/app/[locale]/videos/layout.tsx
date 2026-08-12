import type { ReactNode } from "react";
import { PublicPageShell } from "@/components/public-site";

/**
 * PHASE 102 — the PUBLIC Video Hub shell.
 *
 * `PublicPageShell` is the canonical wrapper for an anonymous route (the same one
 * `/library`, `/academy` and `/articles/*` public pages use). It supplies the
 * public header and footer and — the part that matters for accessibility — the
 * single `<main id="public-content" tabIndex={-1}>` landmark that the global
 * skip-to-content link targets. Because it is here rather than in each page, both
 * the library and the watch page share one main landmark, and `not-found.tsx` /
 * `error.tsx` render inside it instead of on a bare background.
 *
 * There is no `<h1>` in this file: the layout owns chrome, each page owns exactly
 * one page heading, so heading order stays correct on every route under `/videos`.
 *
 * NOTHING IS LOADED HERE. A layout that queried media would run on every child
 * route and would need the organization selector twice; the pages resolve their
 * own scope so the published-only gate is applied once per request, in the
 * repository, where ADR §11 put it.
 */
export default function VideosLayout({ children }: { children: ReactNode }) {
  return <PublicPageShell>{children}</PublicPageShell>;
}
