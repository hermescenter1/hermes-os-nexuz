"use client";
// FIXTURE — a type-only import, which is NOT a violation.
//
// This project compiles without `verbatimModuleSyntax`, so `import type` is
// erased: no module is requested, nothing is bundled, and the corpus never
// reaches the browser. Classifying it as an edge would report a defect the
// runtime does not have, and a gate that cries wolf on the safe case is a gate
// people learn to override.
//
// The distinction is deliberately narrow. An inline `import { type A, B }`
// keeps the statement alive through `B` and IS an edge; only a statement whose
// every binding is a type disappears.
import type { BridgeLocale } from "@/lib/industrial-knowledge/runtime/bridge";

export function TypeOnlyFixture({ locale }: { locale: BridgeLocale }) {
  return <span>{locale}</span>;
}
