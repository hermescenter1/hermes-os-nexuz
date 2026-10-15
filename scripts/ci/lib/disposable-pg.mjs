/**
 * PHASE 98 — disposable PostgreSQL container helper (rehearsals only).
 *
 * Starts a throwaway `pgvector/pgvector:pg16` container with a GUARDED name that
 * must begin with the disposable prefix `hermes98_`, so it can never collide with
 * or destroy the canonical Production `hermes` stack. Publishes to a random host
 * port. Runs pg_dump/pg_restore/psql INSIDE the container via `docker exec`,
 * exactly like the operator scripts. Always force-removes the container on exit.
 *
 * Never prints connection strings, credentials or row payloads.
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

export const DISPOSABLE_PREFIX = "hermes98_";
const IMAGE = "pgvector/pgvector:pg16";

function docker(args, opts = {}) {
  return execFileSync("docker", args, { encoding: "utf8", ...opts });
}

/**
 * @param {string} tag short label (letters/digits/underscore)
 * @param {(ctx: DisposablePgCtx) => Promise<void>} fn
 */
export async function withDisposablePg(tag, fn) {
  if (!/^[a-z0-9_]+$/.test(tag)) throw new Error("tag must be [a-z0-9_]");
  const name = `${DISPOSABLE_PREFIX}pg_${tag}_${randomBytes(4).toString("hex")}`;
  if (!name.startsWith(DISPOSABLE_PREFIX)) throw new Error("DISPOSABLE_PROJECT_GUARD violated");

  const user = "hermes_ci";
  const password = `disposable_${randomBytes(9).toString("hex")}`; // CI-only, throwaway
  const db = "hermes_ci";

  console.log(`[disposable-pg] starting ${name} (${IMAGE})`);
  docker([
    "run", "-d", "--name", name,
    "-e", `POSTGRES_USER=${user}`,
    "-e", `POSTGRES_PASSWORD=${password}`,
    "-e", `POSTGRES_DB=${db}`,
    "-p", "127.0.0.1::5432",
    IMAGE,
  ]);

  const ctx = /** @type {DisposablePgCtx} */ ({});
  try {
    // Wait for readiness — over TCP, and twice.
    //
    // WHY NOT THE UNIX SOCKET. During initialisation the official entrypoint
    // starts a SOCKET-ONLY server to run its setup, with
    //
    //   set -- "$@" -c listen_addresses='' -p "${PGPORT:-5432}"
    //
    // (docker-entrypoint.sh, docker_temp_server_start), then stops it and
    // starts the real one. `pg_isready` over the socket answers "ready" for
    // that temporary server, so the caller proceeds and the next statement
    // meets `FATAL: the database system is shutting down` or a closed socket.
    //
    // Measured against this exact image on 2026-10-15: the socket answered
    // ready at 10.8 s while TCP was still refused, and only became reachable
    // over TCP at 22.3 s — an 11.5-second window in which this helper would
    // have handed a doomed server to its caller. Three CI rehearsals failed
    // that way in one afternoon.
    //
    // The temporary server does not listen on TCP at all, so `-h 127.0.0.1`
    // cannot see it. Two consecutive successes then cover the narrower case
    // of probing in the instant between the real server binding and finishing
    // its own startup.
    let streak = 0;
    for (let i = 0; i < 120 && streak < 2; i += 1) {
      try {
        docker(["exec", name, "pg_isready", "-U", user, "-d", db, "-h", "127.0.0.1"], { stdio: "pipe" });
        streak += 1;
      } catch {
        streak = 0;
      }
      if (streak < 2) await sleep(1000);
    }
    if (streak < 2) throw new Error("disposable postgres did not become ready");

    // Resolve the published host port.
    const portLine = docker(["port", name, "5432/tcp"]).trim().split("\n")[0];
    const hostPort = portLine.split(":").pop().trim();

    ctx.name = name;
    ctx.user = user;
    ctx.db = db;
    ctx.hostPort = hostPort;
    ctx.dbUrl = `postgresql://${user}:${password}@127.0.0.1:${hostPort}/${db}`;
    ctx.maintUrl = `postgresql://${user}:${password}@127.0.0.1:${hostPort}/postgres`;
    ctx.urlForDb = (dbName) => `postgresql://${user}:${password}@127.0.0.1:${hostPort}/${dbName}`;

    // psql against the maintenance DB (create/drop rehearsal databases).
    ctx.psql = (sql, targetDb = "postgres") =>
      docker(["exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", targetDb, "-tAc", sql], { stdio: "pipe" });

    // pg_dump a database to a host file (custom format), via docker exec (operator path).
    ctx.dumpTo = (targetDb, hostFile) => {
      const out = execFileSync("docker", ["exec", name, "pg_dump", "-U", user, "--no-password", "--format=custom", "--no-acl", "--no-owner", targetDb]);
      // out is a Buffer of the dump; write to hostFile
      return out;
    };

    // pg_restore a host dump buffer into a database (via docker exec -i).
    ctx.restoreFrom = (targetDb, dumpBuffer) => {
      execFileSync("docker", ["exec", "-i", name, "pg_restore", "--no-acl", "--no-owner", "-U", user, "-d", targetDb], { input: dumpBuffer });
    };

    // pg_restore --list from a host dump buffer (verification).
    ctx.listToc = (dumpBuffer) =>
      execFileSync("docker", ["exec", "-i", name, "pg_restore", "--list"], { input: dumpBuffer, encoding: "utf8" });

    await fn(ctx);
  } finally {
    try {
      docker(["rm", "-f", name], { stdio: "pipe" });
      console.log(`[disposable-pg] removed ${name}`);
    } catch {
      /* best effort */
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @typedef {Object} DisposablePgCtx
 * @property {string} name
 * @property {string} user
 * @property {string} db
 * @property {string} hostPort
 * @property {string} dbUrl
 * @property {string} maintUrl
 * @property {(dbName:string)=>string} urlForDb
 * @property {(sql:string, targetDb?:string)=>string} psql
 * @property {(targetDb:string, hostFile:string)=>Buffer} dumpTo
 * @property {(targetDb:string, dumpBuffer:Buffer)=>void} restoreFrom
 * @property {(dumpBuffer:Buffer)=>string} listToc
 */
