/**
 * Same-origin JSON requests for the customer forms. The browser adds the
 * Origin header the API checks; the organization is never sent — the server
 * takes it from the session.
 */
export interface ApiAnswer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export async function sendJson(method: "POST" | "PATCH" | "PUT", url: string, payload: unknown): Promise<ApiAnswer> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  } catch {
    return { status: 0, body: {} };
  }
}

/** "2026-10-13T09:30" in the browser's own zone -> ISO instant, or null for empty. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** ISO instant -> "YYYY-MM-DDTHH:mm" in the browser's own zone, for a datetime-local input. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The validation problems of a 422, keyed by field. */
export function problemsOf(body: Record<string, unknown>): Record<string, string> {
  const list = Array.isArray(body.problems) ? (body.problems as Array<{ field?: unknown; problem?: unknown }>) : [];
  const out: Record<string, string> = {};
  for (const p of list) if (typeof p.field === "string") out[p.field] = String(p.problem ?? "INVALID");
  return out;
}
