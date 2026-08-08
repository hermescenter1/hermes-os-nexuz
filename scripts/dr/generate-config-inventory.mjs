/**
 * Hermes OS — Phase 98 configuration-inventory generator.
 *
 * Writes the SECRET-FREE machine-readable inventory to
 * docs/release/phase98-configuration-inventory.json and validates it against
 * .env.production.example. Fail-closed: non-zero exit if validation fails or if
 * any secret value is detected. Never prints secret values.
 *
 * Usage: node scripts/dr/generate-config-inventory.mjs [--check]
 *   (default) write the JSON and validate.
 *   --check   validate only; also verify the committed JSON is up to date.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderInventory, validateInventory, inventorySha256 } from "./config-inventory.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(REPO, "docs", "release", "phase98-configuration-inventory.json");
const ENV_EXAMPLE = join(REPO, ".env.production.example");

const checkOnly = process.argv.includes("--check");
const inv = renderInventory();
const doc = { ...inv, inventorySha256: inventorySha256() };
const serialized = JSON.stringify(doc, null, 2) + "\n";

const envText = readFileSync(ENV_EXAMPLE, "utf8");
const { ok, errors } = validateInventory(inv, envText);
if (!ok) {
  console.error("RESULT phase98_config_inventory=FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (checkOnly) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    console.error("RESULT phase98_config_inventory=FAIL (committed JSON missing — run the generator)");
    process.exit(1);
  }
  if (current !== serialized) {
    console.error("RESULT phase98_config_inventory=FAIL (committed JSON is stale — run the generator)");
    process.exit(1);
  }
  console.log("RESULT phase98_config_inventory=PASS (validated + up to date)");
} else {
  writeFileSync(OUT, serialized);
  console.log(`RESULT phase98_config_inventory=PASS (wrote ${OUT})`);
}
