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

import { isInvalidRelationError, isUnsupportedFieldError } from "./relation-ownership";
import { isDataScopeError } from "./tenant-scope";

/**
 * Map a thrown value to a response, or rethrow it.
 *
 * Rethrowing is the important half. Only the two error classes this slice
 * defines are converted; anything else is a programming error and must keep
 * travelling to the error boundary, where it is visible. Swallowing unknown
 * errors here would rebuild, one layer up, exactly the silent catch this slice
 * removed from the data layers.
 */
export function refusalResponse(err: unknown): NextResponse {
  if (isUnsupportedFieldError(err)) {
    return NextResponse.json(
      { error: err.message, code: err.code, fields: err.fields },
      { status: err.status },
    );
  }

  if (isInvalidRelationError(err)) {
    return NextResponse.json(
      { error: err.message, code: err.code, field: err.field },
      { status: err.status },
    );
  }

  if (isDataScopeError(err)) {
    /*
     * The message is the fixed English sentence the refusal vocabulary defines,
     * never anything a driver authored. The UI branches on `code`; the sentence
     * is a fallback for a client that does not.
     */
    return NextResponse.json(
      {
        error: err.message,
        code: err.code,
        // Opaque and random: it identifies the log line, never the failure.
        ...(err.correlationId ? { correlationId: err.correlationId } : {}),
      },
      { status: err.status },
    );
  }

  throw err;
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

