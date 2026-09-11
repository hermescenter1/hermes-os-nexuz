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
  /*
   * PHASE 110-A2.1-R3 — compare CONTENT, not line endings.
   *
   * `serialized` is built in memory and always uses LF. The committed file is
   * materialised by the checkout, and this repository sets `core.autocrlf=true`,
   * so on Windows it arrives with CRLF. A raw comparison therefore failed for
   * every Windows developer while the two documents were byte-identical after
   * normalisation — measured: regenerating produced exactly the bytes in HEAD.
   *
   * ONLY the newline convention is normalised. No trim, no whitespace
   * collapsing, no JSON reparse: a changed value, a removed entry or a truncated
   * document must still fail, and the controls in the R3 evidence show that they
   * do.
   */
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const withoutCarriageReturns = (text) => text.split(CR + LF).join(LF);

  if (withoutCarriageReturns(current) !== withoutCarriageReturns(serialized)) {
    console.error("RESULT phase98_config_inventory=FAIL (committed JSON is stale — run the generator)");
    process.exit(1);
  }
  console.log("RESULT phase98_config_inventory=PASS (validated + up to date)");
} else {
  writeFileSync(OUT, serialized);
  console.log(`RESULT phase98_config_inventory=PASS (wrote ${OUT})`);
}
