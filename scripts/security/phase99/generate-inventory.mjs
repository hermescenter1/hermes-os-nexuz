#!/usr/bin/env node
/**
 * PHASE 99 — generate (or verify) the committed route-security inventory.
 *
 * The inventory is a machine-readable statement about the API surface: every
 * handler, its classification, the authorization evidence found in its own
 * source, and whether it mutates. Committing it makes drift visible in review —
 * a pull request that adds an unauthenticated write shows up as a diff here, not
 * as a surprise in production.
 *
 *   node scripts/security/phase99/generate-inventory.mjs            # write
 *   node scripts/security/phase99/generate-inventory.mjs --check    # verify
 *
 * `--check` exits non-zero when the committed artifact no longer matches the
 * source tree, and is what CI runs.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

import { buildRouteInventory, summarizeInventory, REPO_ROOT } from "./route-inventory.mjs";
import { analyzeTenantPredicates } from "./tenant-predicates.mjs";

const OUT = join(REPO_ROOT, "docs", "security", "phase99-route-security-inventory.json");

export function renderInventory() {
  const routes = buildRouteInventory({ repoRoot: REPO_ROOT });
  const summary = summarizeInventory(routes);
  const tenant = analyzeTenantPredicates({ repoRoot: REPO_ROOT });

  return {
    schemaVersion: 1,
    phase: "99",
    note: "Machine-readable route-security inventory. Derived from the source tree by scripts/security/phase99/route-inventory.mjs; regenerate with `node scripts/security/phase99/generate-inventory.mjs`. Contains no secrets, no request data and no customer information.",
    classificationSet: [
      "PUBLIC_READ", "PUBLIC_WRITE", "AUTHENTICATED_USER", "TENANT_MEMBER",
      "TENANT_ADMIN", "OWNER_ONLY", "PLATFORM_ADMIN", "WEBHOOK",
      "INTERNAL_HEALTH", "UNKNOWN",
    ],
    summary,
    tenantCoverage: tenant.coverage,
    routes: routes.map((r) => ({
      apiPath: r.apiPath,
      method: r.method,
      file: r.file,
      classification: r.classification,
      authEvidence: r.authEvidence,
      declaredSurface: r.declaredSurface,
      tenantScoped: r.tenantScoped,
      mutates: r.mutates,
      senderAuthenticated: r.senderAuthenticated,
    })),
  };
}

function main() {
  const check = process.argv.includes("--check");
  const rendered = JSON.stringify(renderInventory(), null, 2) + "\n";

  if (!check) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, rendered);
    console.log(`[phase99-inventory] wrote ${OUT}`);
    return 0;
  }

  let committed;
  try {
    committed = readFileSync(OUT, "utf8");
  } catch {
    console.error("[phase99-inventory] committed inventory is missing — run the generator");
    return 1;
  }
  // Compare content, not bytes: a CRLF checkout must not read as drift.
  if (committed.replace(/\r\n/g, "\n") !== rendered.replace(/\r\n/g, "\n")) {
    console.error("[phase99-inventory] DRIFT — the committed inventory does not match the source tree.");
    console.error("[phase99-inventory] Regenerate it and review the diff: node scripts/security/phase99/generate-inventory.mjs");
    return 1;
  }
  console.log("[phase99-inventory] committed inventory matches the source tree");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("generate-inventory.mjs")) {
  process.exit(main());
}
