// PHASE 101-R — the server-only boundary for the Phase 101 corpus bridge.
//
// WHY THIS EXISTS INSTEAD OF `import "server-only"`
// The canonical Next.js marker is a bare `import "server-only";`, which resolves
// to a package whose browser export throws at BUILD time. That package is NOT
// installed in this repository — it is absent from `node_modules`, absent from
// `package-lock.json`, and Next 15.5.23 does not declare it as a dependency
// (`client-only` is present as a transitive dependency; `server-only` is not).
// Adding it would mean editing `package.json` and `package-lock.json`, which
// this increment is not permitted to touch, and importing it without installing
// it would fail the production build outright.
//
// So the guarantee is reproduced with no dependency at all, at both of the
// points where `server-only` acts:
//
//   RUNTIME  — `assertServerOnly` throws the moment a module that calls it is
//              evaluated in a browser realm. That is exactly what the
//              `server-only` browser export does.
//   BUILD    — a transitive client-graph gate (see
//              `__tests__/phase101r-client-boundary.test.ts`) walks every
//              `"use client"` entry in the app and fails if any of them can
//              reach the bridge, the exposure map or the corpus. It follows the
//              same module graph `next build` follows, and it reports the exact
//              import chain rather than a bundler error four hops away.
//
// The pair is strictly stronger than the marker alone: `server-only` only fails
// once a bundle is actually produced, while the gate fails in the unit-test run.

/** Realms in which a module guarded by this function must never be evaluated. */
function isBrowserRealm(): boolean {
  // `document` is checked as well as `window` so a bare `globalThis.window`
  // shim — which some bundlers inject — cannot be mistaken for a real browser,
  // and so a Node worker that defines `window` for a polyfill does not trip it.
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Fail closed when a server-only module reaches a browser.
 *
 * Called at module scope, so the failure happens at import time rather than at
 * the first call — by the time a function is invoked the module has already
 * been shipped, and shipping it is the defect.
 */
export function assertServerOnly(moduleName: string): void {
  if (isBrowserRealm()) {
    throw new Error(
      `${moduleName} is server-only: it carries the full Phase 101 reference corpus, ` +
        "including scenarios that are deliberately not published. It must never be " +
        "imported from a Client Component or reach the browser bundle.",
    );
  }
}
