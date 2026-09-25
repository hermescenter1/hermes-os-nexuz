/**
 * ATS-M1 — the browser side of the management API.
 *
 * Every mutation:
 *   * carries the page's rendered organization (`withTenantPrecondition`), so a
 *     second tab that switched organization cannot write into the other one —
 *     the server answers 409/428 instead;
 *   * carries a fresh `Idempotency-Key` per user action, so a double click or
 *     a retried request is replayed by the server, never applied twice;
 *   * resolves to an explicit outcome — never throws into a `.catch` that
 *     swallows it — so no action can fail silently.
 *
 * Nothing here decides who may do what. The server re-checks every request;
 * the UI only reflects what the server said the actor may attempt.
 */

import { withTenantPrecondition } from "@/lib/client/resource-request";

export interface ApiOutcome<T> {
  ok: boolean;
  status: number;
  /** Stable machine code on refusal (e.g. FORBIDDEN, NOT_READY, STALE). */
  code: string | null;
  data: T | null;
  /** The server's correlation id, shown to the user on failure for support. */
  correlationId: string | null;
  /** Refusal details the UI renders (missing readiness items, field issues…). */
  detail: Record<string, unknown> | null;
}

function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return `ui-${c.randomUUID()}`;
  return `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function parse<T>(res: Response): Promise<ApiOutcome<T>> {
  let body: Record<string, unknown> | null = null;
  try {
    const text = await res.text();
    body = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  const correlationId =
    (typeof body?.correlationId === "string" ? body.correlationId : null) ?? res.headers.get("x-request-id");
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      code: typeof body?.code === "string" ? body.code : null,
      data: null,
      correlationId,
      detail: body,
    };
  }
  return { ok: true, status: res.status, code: null, data: body as T | null, correlationId, detail: null };
}

function offline<T>(): ApiOutcome<T> {
  return { ok: false, status: 0, code: "OFFLINE", data: null, correlationId: null, detail: null };
}

export async function atsRead<T>(url: string, signal?: AbortSignal): Promise<ApiOutcome<T>> {
  try {
    const res = await fetch(url, { credentials: "same-origin", cache: "no-store", signal });
    return parse<T>(res);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return offline<T>();
  }
}

export async function atsMutate<T>(url: string, method: "POST" | "PATCH" | "PUT", body: unknown): Promise<ApiOutcome<T>> {
  try {
    const res = await fetch(
      url,
      withTenantPrecondition({
        method,
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": newIdempotencyKey() },
        body: JSON.stringify(body),
      }),
    );
    return parse<T>(res);
  } catch {
    return offline<T>();
  }
}
