/**
 * PHASE 110-A1.0b — reading and writing the stored organization selection.
 *
 * SERVER ONLY. The value is `HttpOnly`, so the browser cannot read it and this
 * module has no client counterpart.
 *
 * WHAT THE COOKIE IS FOR, AND WHAT IT IS NOT
 * It answers one question: "last time this reader chose, which organization did
 * they choose?" It is a hint about intent, never evidence of access. Every
 * consumer re-resolves the caller's proven memberships and then checks that the
 * stored id is still one of them.
 *
 * PHASE 110-A1.0b R3 (R3-5) — that guarantee, stated precisely, because R2
 * stated it too strongly. It is NOT true that a forged cookie "selects nothing
 * at all": a forged value naming an organization the CURRENT user is genuinely
 * an ACTIVE member of is honoured, and that is exactly what a hint is for. What
 * a cookie can never do is WIDEN the set. It cannot name an organization the
 * caller does not belong to, cannot revive a suspended or invited membership,
 * cannot survive a change of user, and cannot manufacture a tenant during an
 * outage. The membership check is the boundary; the cookie only chooses inside
 * it. Written that way, the property is both weaker and true.
 *
 * WHY THE USER ID IS INSIDE IT
 * Cookies are per-origin, not per-account. Sign out of A and in as B in the
 * same browser and B inherits A's cookie jar. Without a binding, B's first
 * request would carry A's selection, and — if B happens to be a member of that
 * same organization — B would silently start in a tenant they never chose. So
 * the envelope names the user it was written for, and a mismatch discards it.
 * That id is not a secret and grants nothing; it is a label used to decide
 * whether the hint belongs to the person asking.
 */

/*
 * There is deliberately no `import "server-only"` here.
 *
 * That package is not a dependency of this repository, and adding one is
 * outside this slice. The boundary is enforced the way Phase 110-A1.0 enforces
 * it for the resolver instead: `__tests__/tenant-selection-static.test.ts` runs
 * the repository's own client-import graph walker with this module as the
 * forbidden target, so a `"use client"` component that reaches it fails a test
 * rather than shipping a server module to a browser.
 */

import type { NextRequest, NextResponse } from "next/server";

import {
  TENANT_SELECTION_COOKIE,
  TENANT_SELECTION_COOKIE_VERSION,
} from "./contract";

/** One year. A language-like preference should outlast a session. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The largest envelope this module will accept, DERIVED rather than guessed.
 *
 * R1 set this to 512 and the writer had no matching bound at all, so the writer
 * could produce a value its own reader threw away on the next request: two ids
 * of the contract's maximum length encode to 538 characters, and the read came
 * back `null`. A selection would appear to succeed and then quietly not exist.
 *
 * PHASE 110-A1.0b R3 (R3-5) — THE R2 DERIVATION HERE WAS WRONG, twice, and the
 * numbers below are measured rather than reasoned:
 *
 *   1. `TRUSTED_VALUE_MAX_LENGTH` bounds `v.length`, which counts UTF-16 CODE
 *      UNITS, not code points. R2 called them code points.
 *   2. R2 argued "at most 4 UTF-8 bytes per code point, and JSON escaping is
 *      never worse". JSON escaping IS worse. `isUsableId` rejects C0/C1, DEL,
 *      bidi and whitespace but says nothing about surrogates, so an id of 191
 *      UNPAIRED surrogates is admissible, and `JSON.stringify` renders each one
 *      as the six-byte escape `\udXXX`.
 *
 * Measured on this runtime, for two ids at the contract maximum:
 *
 *   ASCII                    403 envelope bytes ->   538 base64url characters
 *   3-byte BMP (U+6F22)     1167                 ->  1556
 *   non-BMP (U+1D11E)        781                 ->  1042
 *   all `"` (JSON-doubled)   785                 ->  1047
 *   unpaired surrogates     2313                 ->  3084   <- the real worst case
 *
 * R2 claimed a 2068-character worst case. The true one is 3084, half again as
 * large. 4000 still clears it, so the constant does not change — but it now
 * rests on a measurement instead of on an argument that happened to be false.
 *
 * On the browser side: 4000 characters plus `hermes_org=` and the attributes
 * stays inside the ~4096-byte per-cookie limit that mainstream browsers
 * implement. That is the common implemented limit, not a specification
 * guarantee, and this comment does not claim every browser enforces it.
 *
 * The limit is RAISED to fit the contract, not removed: a 64 KB value is still
 * refused without being parsed.
 */
const MAX_ENCODED_LENGTH = 4000;

interface SelectionEnvelope {
  readonly v: number;
  readonly u: string;
  readonly o: string;
}

/**
 * What the stored hint means for this request.
 *
 * `none` and a hint that no longer grants are DIFFERENT, and R1 collapsed them.
 * That collapse is what let a request whose stored intent was B be answered
 * with A: with no way to say "there was an intent and it is dead", the caller
 * had nothing to refuse on.
 */
export type StoredSelection =
  | { readonly kind: "none" }
  | { readonly kind: "selection"; readonly organizationId: string };

/**
 * Base64url, encoded by hand rather than with a delimiter.
 *
 * A `user|org` string would need a delimiter that can appear in neither half.
 * `isUsableId` in the tenant core admits every code point except control,
 * bidi and whitespace characters, so no printable delimiter is safe to assume.
 * Encoding the pair removes the question instead of answering it carefully.
 */
function encode(envelope: SelectionEnvelope): string {
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

/**
 * Decode, or refuse.
 *
 * Everything is validated: the envelope must parse, be an ordinary object,
 * carry the current version and hold two non-empty strings. A cookie that fails
 * any of these is not repaired — it is discarded, and the caller falls through
 * to the ordinary resolution path. There is no shape here worth guessing at.
 */
function decode(raw: string | undefined): SelectionEnvelope | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_ENCODED_LENGTH) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { v, u, o } = parsed as Record<string, unknown>;
  if (v !== TENANT_SELECTION_COOKIE_VERSION) return null;
  if (typeof u !== "string" || u.length === 0) return null;
  if (typeof o !== "string" || o.length === 0) return null;

  return { v, u, o };
}

/**
 * The organization this reader last chose, if the stored hint belongs to them.
 *
 * Returns `{ kind: "none" }` for absent, malformed, wrong-version and wrong-user
 * cookies alike. The caller cannot tell those apart and must not: all four mean
 * the same thing here, which is "there is no usable hint". (R2 rewrote the
 * return type to this union and left this paragraph saying `null`; corrected in
 * R3 under R3-5.)
 *
 * A returned id is still only a CANDIDATE. It has not been checked against any
 * membership at this point, and passing it anywhere but the resolver's
 * candidate parameter would be handing the client a tenant.
 */
export function readStoredSelection(
  req: Pick<NextRequest, "cookies">,
  userId: string,
): StoredSelection {
  return interpret(req.cookies.get(TENANT_SELECTION_COOKIE)?.value, userId);
}

/** The same read, for a server component, from an already-read cookie jar. */
export function readStoredSelectionFromJar(
  jar: { get: (name: string) => { value: string } | undefined },
  userId: string,
): StoredSelection {
  return interpret(jar.get(TENANT_SELECTION_COOKIE)?.value, userId);
}

function interpret(raw: string | undefined, userId: string): StoredSelection {
  const envelope = decode(raw);
  if (!envelope) return { kind: "none" };
  /*
   * Exact comparison. No trimming and no case folding: a value not
   * byte-identical to the current user's id was not written for them, and is
   * treated as absent rather than as a dead intent — user B never expressed an
   * intent, so there is nothing of theirs to preserve or refuse.
   */
  if (envelope.u !== userId) return { kind: "none" };
  return { kind: "selection", organizationId: envelope.o };
}

function cookieAttributes() {
  return {
    httpOnly: true,
    // Lax, not Strict: see the contract module. A normal inbound link must
    // still arrive with the selection applied.
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
  };
}

/**
 * Persist a selection that the server has ALREADY proven.
 *
 * The signature takes both ids deliberately. There is no overload that writes
 * "the current organization" from ambient state, because the only safe moment
 * to write this cookie is one where a proven `TenantContext` is in hand and its
 * `organizationId` can be passed explicitly.
 */
export function writeStoredSelection(
  res: NextResponse,
  userId: string,
  organizationId: string,
): void {
  res.cookies.set(
    TENANT_SELECTION_COOKIE,
    encode({ v: TENANT_SELECTION_COOKIE_VERSION, u: userId, o: organizationId }),
    cookieAttributes(),
  );
}

/*
 * PHASE 110-A1.0b R3 (R3-5) — `clearStoredSelection` was REMOVED.
 *
 * R1 cleared the cookie whenever a selection went stale, and that was the second
 * half of the F2 defect: the next request arrived with no hint at all, the
 * reader looked like somebody who had never chosen, and a surviving single
 * membership was granted automatically. R2 stopped calling it and kept the
 * export "for sign-out and for a future explicit clear action".
 *
 * It had no callers anywhere in the repository — not sign-out, not anything —
 * and a deletion helper for the one cookie whose whole R2 correction was "stop
 * deleting this cookie" is a hazard sitting in reach, not an affordance. When a
 * genuine "clear my selection" action exists it can be written then, with the
 * behaviour that action actually needs.
 *
 * A dead intent is KEPT and refused, every time, until an explicit `PUT`
 * replaces it. The cookie is only ever written by that explicit choice.
 */
