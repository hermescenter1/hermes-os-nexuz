#!/usr/bin/env node
// PHASE 95 — MANUAL live pinned-model evaluation launcher (NOT run in PR CI).
//
// Fail-closed and opt-in: refuses to do anything unless PHASE95_LIVE_EVAL=1 AND
// a provider key is present (supplied only by the protected ai-evaluation GitHub
// Environment). It then runs the SKIPPED-BY-DEFAULT live Vitest file, which
// drives the pinned model over the SYNTHETIC hallucination dataset and validates
// every response through the SAME governance library (schema, citation
// allow-list, unsafe screen). It emits counts only — never a secret or raw model
// output. This launcher is never invoked by ordinary CI.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function refuse(code) {
  console.error(`[phase95-ai-live-eval] NOT RUNNING (${code})`);
  process.exit(2);
}

if (process.env.PHASE95_LIVE_EVAL !== "1") refuse("FLAG_MISSING");
if (!process.env.ANTHROPIC_API_KEY) refuse("NO_PROVIDER_KEY");

const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const result = spawnSync(
  process.execPath,
  [vitest, "run", "src/lib/ai-governance/__tests__/hallucination.live.test.ts"],
  { cwd: root, env: { ...process.env }, stdio: "inherit", shell: false },
);
if (result.error) { console.error("[phase95-ai-live-eval] SPAWN_ERROR"); process.exit(1); }
process.exit(result.status ?? 1);
