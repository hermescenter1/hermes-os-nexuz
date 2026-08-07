/**
 * PHASE 98 — encrypted PostgreSQL backup/restore rehearsal (real Docker + pg16).
 *
 * Exercises the ACTUAL Phase 98 encrypted path end to end against a disposable
 * pgvector/pgvector:pg16 container: pg_dump (custom) → verify → hbk.mjs encrypt
 * (AES-256-GCM) → hbk.mjs verify → destroy → hbk.mjs decrypt → pg_restore →
 * migrate deploy (idempotent) → deterministic integrity comparison. Then proves
 * the artifact rejects wrong key, corruption, a modified tag, truncation and an
 * unknown envelope version — each BEFORE any database mutation.
 *
 * Integrity uses deterministic per-row digests (md5 of row_to_json, aggregated in
 * digest order) over critical tables — detecting mutation, deletion and phantom
 * rows — PLUS an exact all-table row-count map. Never prints row payloads,
 * connection strings or credentials. Synthetic disposable key only.
 *
 * Emits RESULT lines for each closure sub-gate + phase98_encrypted_pg=PASS.
 */

import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withDisposablePg } from "./lib/disposable-pg.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HBK = join(REPO, "scripts", "dr", "hbk.mjs");
const ESSENTIAL = ["Organization", "User", "IndustrialSite", "IndustrialAsset"];
const CRITICAL = ["Organization", "User", "AuditLog", "IndustrialSite", "IndustrialAsset"];

let failed = false;
const check = (label, cond) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond) failed = true;
};
const hbk = (args) => execFileSync("node", [HBK, ...args], { encoding: "utf8" });
const hbkFails = (args) => {
  try {
    execFileSync("node", [HBK, ...args], { stdio: "pipe" });
    return false;
  } catch {
    return true;
  }
};

async function main() {
  const work = mkdtempSync(join(tmpdir(), "hermes-p98-encpg-"));
  const durable = mkdtempSync(join(tmpdir(), "hermes-p98-durable-")); // simulated durable backup dir
  const keyFile = join(work, "key.hex");
  const badKeyFile = join(work, "bad.hex");

  await withDisposablePg("encpg", async (ctx) => {
    const PRIMARY = "hermes_p98_primary";
    const RESTORE = "hermes_p98_restore";
    const FRESH = "hermes_p98_fresh";

    // 1. PRIMARY database + full schema.
    ctx.psql(`DROP DATABASE IF EXISTS ${PRIMARY}`);
    ctx.psql(`CREATE DATABASE ${PRIMARY}`);
    execSync("npx --no-install prisma migrate deploy", { cwd: REPO, stdio: "inherit", env: { ...process.env, DATABASE_URL: ctx.urlForDb(PRIMARY) } });

    // 2. Seed representative rows.
    const seed = [
      ["p98_a", "case.updated", "case", "p98-cid-a"],
      ["p98_b", "login.failure", "user", "p98-cid-b"],
      ["p98_c", "org.ownership.transfer", "organization", null],
    ];
    for (const [id, action, et, cid] of seed) {
      const cidVal = cid === null ? "NULL" : `'${cid}'`;
      ctx.psql(
        `INSERT INTO "AuditLog" (id, action, "entityType", metadata, "createdAt", "correlationId") VALUES ('${id}', '${action}', '${et}', '{}'::jsonb, now(), ${cidVal})`,
        PRIMARY,
      );
    }

    // 3. Deterministic pre-backup integrity evidence.
    const before = snapshot(ctx, PRIMARY);
    check("phase98_encpg_seeded", (before.counts["AuditLog"] ?? 0) >= 3);

    // 4. BACKUP — pg_dump custom (operator path), write plaintext to PRIVATE tmp.
    const dumpBuf = ctx.dumpTo(PRIMARY, null);
    const plain = join(work, "dump.plain");
    writeFileSync(plain, dumpBuf, { mode: 0o600 });

    // 5. Verify the plaintext dump TOC (essential tables).
    const toc = ctx.listToc(dumpBuf);
    check(
      "phase98_encpg_plaintext_verifiable",
      ESSENTIAL.every((t) => toc.includes(t)),
    );

    // 6. Disposable key + ENCRYPT via the real CLI.
    hbk(["genkey", "--out", keyFile]);
    const art = join(durable, "hermes_postgres_p98.hbk");
    hbk(["encrypt", "--in", plain, "--out", art, "--key-file", keyFile, "--key-id", "p98-rehearsal", "--type", "postgres", "--created", "2026-08-07T00:00:00.000Z"]);
    check("POSTGRES_ENCRYPTED_BACKUP", existsSync(art));

    // 7. Prove NO durable plaintext remains in the durable dir.
    rmSync(plain, { force: true });
    check(
      "phase98_encpg_no_durable_plaintext",
      readdirSync(durable).every((f) => !f.endsWith(".plain") && !f.endsWith(".dump")),
    );

    // 8. Authenticate the encrypted artifact.
    check("POSTGRES_BACKUP_AUTHENTICATION", !hbkFails(["verify", "--in", art, "--key-file", keyFile, "--type", "postgres"]));
    check("POSTGRES_BACKUP_VERIFICATION", !hbkFails(["header", "--in", art]));

    // 9. DISASTER — destroy the restore target.
    ctx.psql(`DROP DATABASE IF EXISTS ${RESTORE}`);
    ctx.psql(`CREATE DATABASE ${RESTORE}`);

    // 10. DECRYPT (authenticated) then restore.
    const dec = join(work, "dump.dec");
    hbk(["decrypt", "--in", art, "--out", dec, "--key-file", keyFile, "--type", "postgres"]);
    ctx.restoreFrom(RESTORE, readFileSync(dec));
    rmSync(dec, { force: true });

    // 11. Post-restore migrate deploy is idempotent (no pending migrations).
    execSync("npx --no-install prisma migrate deploy", { cwd: REPO, stdio: "inherit", env: { ...process.env, DATABASE_URL: ctx.urlForDb(RESTORE) } });
    let noPending = true;
    try {
      execFileSync("npx", ["--no-install", "prisma", "migrate", "status"], {
        cwd: REPO,
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: ctx.urlForDb(RESTORE) },
        shell: process.platform === "win32",
      });
    } catch {
      noPending = false;
    }
    check("POSTGRES_POST_RESTORE_MIGRATION", noPending);

    // 12. Deterministic integrity comparison.
    const after = snapshot(ctx, RESTORE);
    check("phase98_encpg_rowcounts_identical", deepEqual(before.counts, after.counts));
    check("POSTGRES_RESTORE_INTEGRITY", deepEqual(before.digests, after.digests));

    // 13. Fresh restore into a brand-new DB.
    ctx.psql(`DROP DATABASE IF EXISTS ${FRESH}`);
    ctx.psql(`CREATE DATABASE ${FRESH}`);
    const dec2 = join(work, "dump.dec2");
    hbk(["decrypt", "--in", art, "--out", dec2, "--key-file", keyFile, "--type", "postgres"]);
    ctx.restoreFrom(FRESH, readFileSync(dec2));
    rmSync(dec2, { force: true });
    const fresh = snapshot(ctx, FRESH);
    check("phase98_encpg_fresh_restore_integrity", deepEqual(before.digests, fresh.digests));

    // 14. FAILURE INJECTION — all must be rejected by hbk verify (no db mutation).
    writeFileSync(badKeyFile, "0".repeat(63) + "1", { mode: 0o600 }); // valid-length but wrong key
    chmodSync(badKeyFile, 0o600); // owner-only so it tests WRONG-KEY, not key-file permissions
    check("POSTGRES_WRONG_KEY_REJECTION", hbkFails(["verify", "--in", art, "--key-file", badKeyFile, "--type", "postgres"]));

    const corrupt = join(work, "corrupt.hbk");
    const b = readFileSync(art);
    const c1 = Buffer.from(b);
    c1[Math.floor(c1.length / 2)] ^= 0xff;
    writeFileSync(corrupt, c1);
    check("POSTGRES_CORRUPTION_REJECTION", hbkFails(["verify", "--in", corrupt, "--key-file", keyFile]));

    const tag = join(work, "tag.hbk");
    const c2 = Buffer.from(b);
    c2[c2.length - 1] ^= 0xff;
    writeFileSync(tag, c2);
    check("phase98_encpg_modified_tag_rejection", hbkFails(["verify", "--in", tag, "--key-file", keyFile]));

    const trunc = join(work, "trunc.hbk");
    writeFileSync(trunc, b.subarray(0, b.length - 32));
    check("phase98_encpg_truncation_rejection", hbkFails(["verify", "--in", trunc, "--key-file", keyFile]));

    // Unknown envelope version: rewrite header formatVersion.
    const badver = join(work, "badver.hbk");
    const hb = Buffer.from(b);
    const hlen = hb.readUInt32BE(4);
    const header = JSON.parse(hb.subarray(8, 8 + hlen).toString("utf8"));
    header.formatVersion = 999;
    const newHeader = Buffer.from(JSON.stringify(header), "utf8");
    const newLen = Buffer.alloc(4);
    newLen.writeUInt32BE(newHeader.length, 0);
    writeFileSync(badver, Buffer.concat([hb.subarray(0, 4), newLen, newHeader, hb.subarray(8 + hlen)]));
    check("phase98_encpg_unknown_version_rejection", hbkFails(["header", "--in", badver]) && hbkFails(["verify", "--in", badver, "--key-file", keyFile]));

    // 15. Cleanup DBs.
    for (const d of [PRIMARY, RESTORE, FRESH]) ctx.psql(`DROP DATABASE IF EXISTS ${d}`);
  });

  rmSync(work, { recursive: true, force: true });
  rmSync(durable, { recursive: true, force: true });

  check("POSTGRES_BACKUP_RESTORE_REHEARSAL", !failed);
  console.log(`RESULT phase98_encrypted_pg=${failed ? "FAIL" : "PASS"}`);
  process.exit(failed ? 1 : 0);
}

// Deterministic snapshot: exact all-table row counts + per-critical-table row digests.
function snapshot(ctx, db) {
  const tablesRaw = ctx.psql(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
    db,
  );
  const tables = tablesRaw.split("\n").map((s) => s.trim()).filter(Boolean);
  const counts = {};
  if (tables.length) {
    const unions = tables.map((t) => `SELECT '${t}' AS t, count(*)::bigint AS c FROM "${t}"`).join(" UNION ALL ");
    const res = ctx.psql(unions, db);
    for (const line of res.split("\n").map((s) => s.trim()).filter(Boolean)) {
      const [t, c] = line.split("|");
      counts[t] = Number(c);
    }
  }
  const digests = {};
  for (const t of CRITICAL) {
    if (!tables.includes(t)) continue;
    // md5 of each row's JSON, aggregated in digest order (deterministic, no PK needed).
    const d = ctx
      .psql(
        `SELECT coalesce(md5(string_agg(h, '' ORDER BY h)), 'EMPTY') FROM (SELECT md5(row_to_json(x)::text) h FROM "${t}" x) s`,
        db,
      )
      .trim();
    digests[t] = d;
  }
  return { counts, digests };
}

function deepEqual(a, b) {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length || ak.join(",") !== bk.join(",")) return false;
  return ak.every((k) => a[k] === b[k]);
}

main().catch((err) => {
  console.error(`RESULT phase98_encrypted_pg=FAIL (${err?.name}: ${String(err?.message ?? err).slice(0, 200)})`);
  process.exit(1);
});
