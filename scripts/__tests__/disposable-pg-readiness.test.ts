/**
 * The disposable PostgreSQL helper must not hand its caller a server that is
 * about to be shut down.
 *
 * WHAT WENT WRONG. The official image initialises itself by starting a
 * SOCKET-ONLY server — `docker_temp_server_start` appends
 * `-c listen_addresses=''` — running its setup, then stopping that server and
 * starting the real one. A `pg_isready` over the unix socket answers "ready"
 * for the temporary server, so the helper returned and the caller's first
 * statement met `FATAL: the database system is shutting down`, or a socket
 * that was already gone.
 *
 * MEASURED on 2026-10-15 against pgvector/pgvector:pg16: the socket probe
 * said ready at 10.8 s while TCP was still refused, and TCP only became
 * reachable at 22.3 s — an 11.5-second window. An A/B over three container
 * starts reproduced the exact CI error once with the socket probe and never
 * with the TCP one. Three rehearsals (Phase 97 PostgreSQL, Phase 98 encrypted
 * recovery, Phase 99.7 baseline→target) failed that way in one afternoon.
 *
 * These are source-level assertions on purpose. The behaviour they protect is
 * a RACE: running a container here would prove nothing on a run where the
 * race did not fire, and would make a 25-second container start part of every
 * unit run. What can be pinned deterministically is that the probe speaks TCP
 * — which the temporary server cannot answer — and that one success is not
 * enough.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync("scripts/ci/lib/disposable-pg.mjs", "utf8");
const LF = String.fromCharCode(10);

/** The helper's code with comment lines removed, so prose cannot satisfy a rule. */
const CODE = SOURCE.split(LF)
  .filter(line => {
    const t = line.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join(LF);

describe("the readiness probe cannot see the temporary init server", () => {
  it("probes over TCP, not the unix socket", () => {
    // The temporary server runs with listen_addresses='' and therefore has no
    // TCP listener at all. This is the whole fix: it is not a longer wait, it
    // is asking a question that server cannot answer.
    expect(CODE).toMatch(/pg_isready[^\n]*"-h",\s*"127\.0\.0\.1"/);
  });

  it("requires more than one success before declaring the server usable", () => {
    // Covers the narrower race between the real server binding its port and
    // finishing startup.
    expect(CODE).toMatch(/streak/);
    expect(CODE).toMatch(/streak\s*<\s*2/);
  });

  it("resets the count on a failed probe, so two successes mean CONSECUTIVE", () => {
    // Counting cumulative successes would accept one hit on the temporary
    // server plus one on the real one — the very sequence that failed.
    expect(CODE).toMatch(/catch\s*\{\s*streak\s*=\s*0;?\s*\}/);
  });

  it("still fails closed when the server never becomes reachable", () => {
    expect(CODE).toContain("disposable postgres did not become ready");
    expect(CODE).toMatch(/if\s*\(streak\s*<\s*2\)\s*throw new Error/);
  });

  it("keeps the bound on how long it will wait", () => {
    // A probe that waits forever turns a dead container into a hung job.
    expect(CODE).toMatch(/i\s*<\s*120/);
  });
});
