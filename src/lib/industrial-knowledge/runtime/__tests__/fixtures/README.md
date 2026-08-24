# PHASE 101-R — client-graph walker fixtures

These files are POSITIVE CONTROLS for
`__tests__/phase101r-client-boundary.test.ts`. Each one is a `"use client"`
module that reaches the Phase 101 bridge through a different import shape, and
the walker must find a chain from every one of them.

They exist because a boundary gate that only ever asserts "no violations found"
rots into a no-op the moment its traversal breaks. A walker that silently
stopped following re-exports, or that never learned to see `import()`, would
keep reporting a clean repository forever.

Nothing here is reachable from a route, so `next build` never bundles it, and
the walker skips `__tests__` when it enumerates the real client entries — these
files are only ever visited when the test points the walker at them directly.
