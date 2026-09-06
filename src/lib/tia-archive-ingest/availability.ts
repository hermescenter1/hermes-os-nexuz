/**
 * PHASE 109-C2.1 — is archive ingestion available on this host at all?
 *
 * WINDOWS IS EXPLICITLY UNAVAILABLE, and says so rather than failing later with
 * a connection error that reads like a transient fault.
 *
 * The reason is structural, not a missing feature. The parser is a Linux
 * container with `network_mode: none`; the only channel to it is a Unix domain
 * socket on a shared volume. A socket inside a Linux container's volume cannot
 * be reached by a process running on a Windows host — and a direct probe on
 * this machine confirmed the narrower point too: `listen()` on an AF_UNIX path
 * returned `EACCES`. There is no configuration that makes it work, so the
 * honest answer is "unavailable here", not "try again".
 *
 * Ingestion is a container-deployed capability. Refusing it on a Windows
 * developer host is a correct fail-closed outcome, not a degradation.
 */

import { INGEST_DIAGNOSTIC_CODES, type IngestDiagnosticCode } from "./diagnostics";

export type Availability =
  | { readonly available: true; readonly socketPath: string }
  | { readonly available: false; readonly code: IngestDiagnosticCode; readonly reason: string };

/** Default socket path. Matches the compose volume mount, and is not configurable. */
export const PARSER_SOCKET_PATH = "/ipc/parser.sock";

/**
 * Decide availability from the platform.
 *
 * `platform` is a parameter so the Windows branch is testable from any host —
 * a test that could only assert this on Windows would never run in CI, which is
 * exactly where the guarantee matters least and the coverage gap matters most.
 */
export function ingestAvailability(platform: string = process.platform): Availability {
  if (platform === "win32") {
    return {
      available: false,
      code: INGEST_DIAGNOSTIC_CODES.PARSER_UNAVAILABLE,
      reason:
        "archive ingestion requires the Linux parser sidecar and its Unix domain socket; " +
        "it is unavailable on win32 and is refused rather than attempted",
    };
  }
  return { available: true, socketPath: PARSER_SOCKET_PATH };
}

/** Convenience predicate for callers that only need the boolean. */
export function ingestIsAvailable(platform: string = process.platform): boolean {
  return ingestAvailability(platform).available;
}
