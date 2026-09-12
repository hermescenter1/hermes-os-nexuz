/**
 * PHASE 110-A2.0 — turning a data-layer refusal into an HTTP answer, once.
 *
 * The two repaired layers no longer answer `[]` or a mock when something goes
 * wrong. They throw, with a stable code. Their routes therefore need a mapping,
 * and it belongs in one place: twenty route handlers each inventing their own
 * would drift, and the drift is invisible until an operator reads two of them
 * side by side.
 *
 * WHAT IT REPLACES. Every create route answered
 *
 *     if (!record) return NextResponse.json(
 *       { error: "Could not persist — mock mode" }, { status: 202 });
 *
 * That line was honest when the layer really did fall back to a mock. It is now
 * a lie in two directions: 202 Accepted tells the caller the request was taken
 * and will be processed, and "mock mode" names a fallback that no longer exists.
 * A cross-tenant write attempt would have received it.
 *
 * The vocabulary is the repository's own `ContextRefusal`, so these statuses are
 * the same ones the platform routes already return for the same conditions.
 */

import { NextResponse } from "next/server";
import type { ZodError } from "zod";

import { REFUSAL_MESSAGE, REFUSAL_STATUS } from "@/lib/auth/context-result";
import { describeErrorSafely } from "@/lib/logger/safe-error";
import { logInfraFailure } from "@/lib/logger/security-events";

import { isInvalidRelationError, isRefusableField, isUnsupportedFieldError } from "./relation-ownership";
import { isDataScopeError, safeRead } from "./tenant-scope";

/**
 * PHASE 110-A2.3 (F3) — the codes this mapping will answer with.
 *
 * Frozen and checked by membership, because the code decides the status and the
 * sentence. A value that merely CLAIMS to be a refusal cannot name a status: it
 * names a code, the code is looked up here, and an unrecognised one is not
 * answered at all.
 */
const ANSWERABLE = Object.freeze([
  "AUTHENTICATION_REQUIRED",
  "ORGANIZATION_CONTEXT_REQUIRED",
  "ORGANIZATION_SELECTION_REQUIRED",
  "ORGANIZATION_CONTEXT_UNAVAILABLE",
  "ORGANIZATION_CONTEXT_CONFLICT",
  "ORGANIZATION_PRECONDITION_REQUIRED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
] as const);

type AnswerableCode = (typeof ANSWERABLE)[number];

const isAnswerable = (v: unknown): v is AnswerableCode =>
  typeof v === "string" && (ANSWERABLE as readonly string[]).includes(v);

/**
 * A correlation id for a refusal we could not read, so the log line and the
 * response can be joined without the response describing anything.
 */
const newLocalId = (): string => Math.random().toString(36).slice(2, 10);

/**
 * The answer for a value that claimed to be a refusal and then could not be
 * read, or named a code this mapping does not answer with.
 *
 * A controlled 500 with a local id — never the caller's status, never the
 * caller's sentence, never the raw value. It is deliberately NOT a success, NOT
 * an empty list and NOT a 503: inventing an outage for a malformed error object
 * would tell an operator to retry something that will never work.
 */
function unreadableRefusal(reason: string): NextResponse {
  const correlationId = newLocalId();
  try {
    /*
     * `"database"` because that is the closest of the four subsystems this sink
     * accepts — `"database" | "cache" | "email" | "startup"` — and the value
     * being described came out of a data-layer call. Adding a fifth subsystem
     * would change a logging contract that is not this slice's to change, and
     * the operation string says exactly what happened.
     */
    logInfraFailure("database", `refusal.unreadable#${correlationId} ${reason}`, new Error(reason));
  } catch {
    /*
     * A LOGGER FAILURE MUST NOT BECOME A SECOND EXCEPTION.
     *
     * The sink is an I/O boundary and can fail on its own. If it does, the
     * caller still gets the controlled answer below — losing the log line is bad,
     * losing the response is worse.
     */
  }
  return NextResponse.json(
    { error: REFUSAL_MESSAGE.INTERNAL_ERROR, code: "INTERNAL_ERROR", correlationId },
    { status: REFUSAL_STATUS.INTERNAL_ERROR },
  );
}

/** A string field copied only if it really is a short, plain string. */
function safeString(err: unknown, key: string): string | undefined {
  const v = safeRead(err, key);
  return typeof v === "string" && v.length > 0 && v.length <= 64 ? v : undefined;
}

/**
 * The most names an UNSUPPORTED_FIELD refusal can legitimately carry is the size
 * of the contract itself; anything longer is not one of ours.
 */
const MAX_FIELD_NAMES = 16;

type FieldNames =
  | { readonly ok: true; readonly fields: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/**
 * PHASE 110-A2.3-R1 — read `fields` off a hostile value WITHOUT running its code.
 *
 * MEASURED BEFORE THIS CHANGE, on the real recognisers. The previous line was
 * `Array.isArray(fields) ? fields.filter(...) : []`, and `safeRead` had guarded
 * only the outer property. Everything after it touched the value directly:
 *
 *   a revoked Proxy over an array   `Array.isArray` ITSELF threw —
 *                                    "Cannot perform 'IsArray' on a proxy that
 *                                    has been revoked" — out of the mapper
 *   a getter on a member            `.filter` ran it, and it threw out
 *   a tampered `filter`             called, and it threw out
 *   a `get` trap                    fired on `filter`, and it threw out
 *   a `filter` returning garbage    answered 400 with `fields: {"length":1}`
 *   100 000 names                   all echoed; a 1 000 000-char name too
 *   names outside the contract      `<script>`, `password` echoed back
 *
 * So this reads by CONSTRUCTION. Nothing is invoked on the value — not `filter`,
 * not an iterator, not `join`. `Array.isArray` is wrapped, because for a revoked
 * Proxy it is the throwing call. `length` is read through `safeRead`, coerced to
 * a small integer and capped. Each index is read through `safeRead`. Every member
 * must be a string that is a member of the error's own published contract
 * (`REFUSABLE_FIELDS`), so a name that is not one of ours is not repeated to the
 * caller. Member LENGTH needs no separate guard and none is claimed: equality
 * with a contract name bounds it at 14 characters. The result is a fresh local
 * array; the caller's object is never returned, spread or iterated.
 *
 * A value that fails any of that is MALFORMED, and malformed is an internal
 * error with a local id — not a 400 carrying a fabricated empty list, because an
 * `UnsupportedFieldError` is only ever constructed with at least one offending
 * contract field, so "none" is not a state the real error can be in.
 *
 * NOT CLAIMED: that a `get` trap never runs. `safeRead` still performs an
 * access, so a trap executes; it just cannot make this function raise, and its
 * return value cannot reach the response unless it is a contract field name.
 */
function readFieldNames(err: unknown): FieldNames {
  const raw = safeRead(err, "fields");

  let isArray = false;
  try {
    isArray = Array.isArray(raw);
  } catch {
    return { ok: false, reason: "fields: Array.isArray threw" };
  }
  if (!isArray) return { ok: false, reason: `fields: not an array (${typeof raw})` };

  const rawLength = safeRead(raw, "length");
  if (typeof rawLength !== "number" || !Number.isInteger(rawLength) || rawLength < 1) {
    return { ok: false, reason: "fields: length is not a positive integer" };
  }
  if (rawLength > MAX_FIELD_NAMES) {
    return { ok: false, reason: `fields: ${rawLength} names exceeds the contract` };
  }

  const fields: string[] = [];
  for (let i = 0; i < rawLength; i += 1) {
    const member = safeRead(raw, String(i));
    if (!isRefusableField(member)) {
      return { ok: false, reason: `fields[${i}]: not a contract field name` };
    }
    if (!fields.includes(member)) fields.push(member);
  }
  return { ok: true, fields };
}

/**
 * Map a thrown value to a response. Never throws.
 *
 * Every branch reads its input defensively and builds its answer from fixed
 * tables. A recognised refusal answers with its own code; an unrecognised or
 * unreadable value answers a controlled INTERNAL_ERROR with a locally generated
 * id, after a safe log line. Nothing is turned into a success, an empty list or
 * a fabricated outage. See the tail of this function for why an unknown error is
 * answered here rather than rethrown.
 */
export function refusalResponse(err: unknown): NextResponse {
  /*
   * PHASE 110-A2.3 (F3) — EVERY FIELD IS READ DEFENSIVELY AND VALIDATED.
   *
   * Recognising the brand is not the same as trusting what carries it. Measured
   * before this change: an ordinary object literal carrying
   * `Symbol.for("hermes.dataScopeError")` was recognised, and its own
   * `status: 401` was echoed onto the response; a Proxy answering `true` to
   * every key was recognised too; and a value that claimed the brand and then
   * threw on `.message` made THIS function raise, from inside the catch that
   * called it.
   *
   * So: the brand selects a BRANCH, and nothing more. The status and the
   * sentence come from the frozen tables, keyed by a code that must be a member
   * of a frozen list. Extra fields are copied only after they are checked. A
   * value that cannot be read produces a controlled INTERNAL_ERROR with a local
   * id rather than an echo or an escape.
   */
  if (isUnsupportedFieldError(err)) {
    const read = readFieldNames(err);
    if (!read.ok) return unreadableRefusal(`UNSUPPORTED_FIELD ${read.reason}`);
    return NextResponse.json(
      {
        error: `This operation does not support: ${read.fields.join(", ")}`,
        code: "UNSUPPORTED_FIELD",
        fields: read.fields,
      },
      { status: 400 },
    );
  }

  if (isInvalidRelationError(err)) {
    const field = safeString(err, "field");
    if (field === undefined) return unreadableRefusal("INVALID_RELATION without a readable field");
    return NextResponse.json(
      {
        error: `The value supplied for ${field} is not available in this organization.`,
        code: "INVALID_RELATION",
        field,
      },
      { status: 400 },
    );
  }

  if (isDataScopeError(err)) {
    const code = safeRead(err, "code");
    if (!isAnswerable(code)) {
      // Branded, but naming a code this mapping does not answer with. Not
      // rethrown: the brand says the value came from this slice, so answering
      // is right — answering with ITS status would not be.
      return unreadableRefusal(`data-scope refusal with an unanswerable code: ${typeof code}`);
    }

    /*
     * The sentence and the status come from the vocabulary's own frozen tables,
     * never from the object. `correlationId` is copied only when it is a short
     * plain string, because it is echoed to the caller.
     */
    const correlationId = safeString(err, "correlationId");
    return NextResponse.json(
      {
        error: REFUSAL_MESSAGE[code],
        code,
        ...(correlationId ? { correlationId } : {}),
      },
      { status: REFUSAL_STATUS[code] },
    );
  }

  /*
   * PHASE 110-A2.3-R1 — UNKNOWN IS ANSWERED HERE, AND LOGGED SAFELY, BOTH.
   *
   * The previous tail rethrew, on the argument that an unrecognised error
   * belongs to the outer boundary. Measured: the outer boundary for these
   * routes is Next's own handler, and in development it renders the raw
   * message — a plain `Error` carrying a connection-string-shaped value came
   * back verbatim. Whether production strips it is a property of a framework
   * this slice does not control, so the mapper does not lean on it.
   *
   * Two things are required and neither substitutes for the other:
   *
   *   1. a SAFE log line — class and driver code by construction through
   *      `describeErrorSafely`, never `err.message`, and a FRESH `Error` handed
   *      to the sink so that its own `instanceof` can never touch the value;
   *   2. a controlled 500 with a local id that joins the two.
   *
   * This is not the silent catch the data layers used to have: nothing here
   * becomes a success, an empty list or an outage, and the log line is the
   * thing a silent catch never wrote.
   */
  const correlationId = newLocalId();
  try {
    logInfraFailure("database", `refusal.unknown#${correlationId}`, new Error(describeErrorSafely(err)));
  } catch {
    // A failing sink must not become the second exception; the answer still goes out.
  }
  return NextResponse.json(
    { error: REFUSAL_MESSAGE.INTERNAL_ERROR, code: "INTERNAL_ERROR", correlationId },
    { status: REFUSAL_STATUS.INTERNAL_ERROR },
  );
}

/**
 * Run a data-layer read and answer with its refusal if it raises one.
 *
 * PHASE 110-A2.1 — THE DEFECT THIS CLOSES. The write paths mapped refusals; the
 * four CMMS collection reads did not. They called the layer and returned its
 * rows, so a refusal escaped the handler and the caller met the framework's
 * unhandled-error page: no `code`, no `correlationId`, and 500 for all five
 * refusals — including AUTHENTICATION_REQUIRED and ORGANIZATION_SELECTION_REQUIRED,
 * which are not server faults. Measured before the fix in
 * `loop1-get-refusal-BEFORE.log`: 20 of 24 assertions failed.
 *
 * The mapping lives HERE and not in each route on purpose. Four handlers each
 * writing their own try/catch is four chances to drift, and the drift is
 * invisible until an operator compares two of them side by side.
 *
 * `refusalResponse` rethrows anything it does not recognise, so an unmapped
 * error still reaches the error boundary rather than being turned into a
 * plausible-looking answer.
 */
export async function readOrRefuse<T>(read: () => Promise<T>): Promise<NextResponse> {
  let rows: T;
  try {
    rows = await read();
  } catch (err) {
    return refusalResponse(err);
  }
  return NextResponse.json(rows);
}

/**
 * A rejected request body, with a stable machine-readable label.
 *
 * PHASE 110-A2.0 — measured in `http-scenarios-run3.log`: sending
 * `organizationId` was correctly refused with 400, but the answer carried no
 * `code`, so a client could tell a validation refusal from a tenancy refusal
 * only by parsing English. The four statuses this slice can answer are now each
 * labelled: VALIDATION_FAILED (400), UNSUPPORTED_FIELD (400),
 * INVALID_RELATION (400), NOT_FOUND (404), and the scope codes from the refusal
 * vocabulary (401/403/409/500/503).
 *
 * The body is Zod's own report about the CALLER'S OWN request. It names keys
 * and constraints; it never contains a stored row, another tenant's value, a
 * driver message or a connection string.
 */
export function validationResponse(error: ZodError): NextResponse {
  /*
   * Zod 4 reports an unknown key as a bare "Invalid input" in `flatten()` —
   * measured in `http-scenarios-run4.log`, where sending `organizationId`
   * produced `formErrors: ["Invalid input"]`. Correct, and useless to whoever
   * has to fix the caller. The keys are in the issue itself, so they are named.
   *
   * These are the CALLER'S OWN key names, echoed back. Nothing stored, nothing
   * belonging to another tenant, and no value — only the names of keys the
   * request itself contained.
   */
  const unrecognized = error.issues.flatMap((i) =>
    i.code === "unrecognized_keys" ? (i as { keys?: string[] }).keys ?? [] : [],
  );

  return NextResponse.json(
    {
      error: error.flatten(),
      code: "VALIDATION_FAILED",
      ...(unrecognized.length > 0 ? { unrecognizedKeys: unrecognized } : {}),
    },
    { status: 400 },
  );
}

/** 404 for "no such row, or not yours" — the two are deliberately one answer. */
export const notFoundResponse = (): NextResponse =>
  NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

