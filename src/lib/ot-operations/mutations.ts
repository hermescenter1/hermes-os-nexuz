// PHASE 94C2 — the browser's only door to the OT WRITE endpoints.
//
// WHY A SEPARATE MODULE FROM `api.ts`
// Reads and writes have genuinely different requirements, and mixing them hides
// that. A write must declare `Content-Type: application/json` or the bounded
// body reader answers 415 before the handler runs; a write can return 409
// CONFLICT, which no read can; and a write's failure vocabulary includes
// outcomes a list never produces. Keeping them apart means neither borrows the
// other's assumptions.
//
// WHAT IS NEVER SENT
// The tenant. Every schema is `.strict()` and none accepts `organizationId`,
// `siteId` or any actor field — the server derives all three from the session.
// The payload builders in `write-contract.ts` name every key explicitly, so a
// forbidden field cannot arrive here by being spread out of a fetched DTO.

import { OtRequestError, type OtFailureCode } from "./api";
import type { DeviceRow, GatewayRow } from "./contract";
import type {
  CreateDeviceBody,
  CreateGatewayBody,
  UpdateDeviceBody,
  UpdateGatewayBody,
} from "./write-contract";

/**
 * The write-side failure vocabulary.
 *
 * A superset of the read one, and the additions matter operationally:
 *   - `CONFLICT` — the record already exists (a gateway profile is 1:1 with its
 *     registry row, and an engineering identifier is unique per organization);
 *   - `INVALID_INPUT` — a 422 the server will not attribute to a field;
 *   - `UNSUPPORTED_MEDIA` — a 415, which means the request was built wrongly
 *     rather than filled in wrongly, and is therefore never the operator's
 *     fault to fix.
 */
export type OtWriteFailureCode =
  | OtFailureCode
  | "CONFLICT"
  | "INVALID_INPUT"
  | "UNSUPPORTED_MEDIA"
  | "PAYLOAD_TOO_LARGE";

export class OtWriteError extends Error {
  readonly code: OtWriteFailureCode;
  readonly status: number;

  constructor(code: OtWriteFailureCode, status: number) {
    // For a developer reading a stack trace. The UI renders a localized string
    // chosen by `code`; the server's own English `message` is never surfaced.
    super(`OT write failed (${code})`);
    this.name = "OtWriteError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Map a response onto the write vocabulary.
 *
 * The CODE decides, not the status. `withOtRoute` can answer 401 carrying
 * `FORBIDDEN`, and a create that fails site authorization answers `FORBIDDEN`
 * rather than 404 — branching on status alone would tell an authorized operator
 * their session had expired.
 */
function classifyWrite(status: number, code: unknown): OtWriteFailureCode {
  switch (code) {
    case "UNAUTHENTICATED":
      return "UNAUTHENTICATED";
    case "FORBIDDEN":
    case "CAPABILITY_NOT_ALLOWED":
      return "FORBIDDEN";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "CONFLICT":
      return "CONFLICT";
    case "VALIDATION_FAILED":
      return "INVALID_INPUT";
    case "UNSUPPORTED_FORMAT":
      return "UNSUPPORTED_MEDIA";
    case "PAYLOAD_TOO_LARGE":
      return "PAYLOAD_TOO_LARGE";
    case "MALFORMED_JSON":
      return "INVALID_INPUT";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "TRANSIENT_FAILURE":
      return "UNAVAILABLE";
    default:
      break;
  }
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 415) return "UNSUPPORTED_MEDIA";
  if (status === 422 || status === 400) return "INVALID_INPUT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "UNAVAILABLE";
  return "FAILED";
}

async function write<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        // MANDATORY. Without it the bounded body reader answers 415 before the
        // handler is ever reached, because a bare fetch sends text/plain.
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(body),
    });
  } catch {
    // A network failure, not a decision by the server. Deliberately not
    // retried here: a create that timed out may or may not have been applied,
    // and silently re-sending it could register the same record twice.
    throw new OtWriteError("FAILED", 0);
  }

  const parsed = (await response.json().catch(() => null)) as
    | { ok?: boolean; data?: unknown; code?: unknown }
    | null;

  if (!response.ok || parsed?.ok !== true) {
    throw new OtWriteError(classifyWrite(response.status, parsed?.code), response.status);
  }
  return parsed.data as T;
}

/** Register a gateway profile against an existing registry record. */
export function createGateway(body: CreateGatewayBody): Promise<GatewayRow> {
  return write<GatewayRow>("/api/ot/gateways", "POST", body);
}

/** Update the supported profile fields of one gateway. */
export function updateGateway(id: string, body: UpdateGatewayBody): Promise<GatewayRow> {
  return write<GatewayRow>(`/api/ot/gateways/${encodeURIComponent(id)}`, "PATCH", body);
}

/** Register a device profile against an existing asset. */
export function createDevice(body: CreateDeviceBody): Promise<DeviceRow> {
  return write<DeviceRow>("/api/ot/devices", "POST", body);
}

/** Update the supported profile fields of one device. */
export function updateDevice(id: string, body: UpdateDeviceBody): Promise<DeviceRow> {
  return write<DeviceRow>(`/api/ot/devices/${encodeURIComponent(id)}`, "PATCH", body);
}

/* ── Parent records for the pickers ─────────────────────────────────────── */

/**
 * A candidate parent: an `IndustrialGateway` or an `IndustrialAsset`.
 *
 * `id` is what the create body carries; `label` and `reference` are what the
 * operator reads. They are kept apart on purpose — the reference is the
 * human-facing hardware identifier, and confusing it with `id` is precisely the
 * mistake that produces an unattributable 422.
 */
export interface ParentOption {
  id: string;
  label: string;
  /** The operator-facing identifier, shown but never submitted. */
  reference: string | null;
  siteId: string;
}

/**
 * Read a parent list from the industrial registry.
 *
 * A DIFFERENT envelope from the OT API (`{ gateways: [...] }` / `{ assets: [...] }`,
 * with no `ok` wrapper), so it cannot share the unwrapper above. It is also
 * separately authorized (`view_industrial`), which holds exactly the same org
 * roles as `view_ot_gateway` — so anyone who can reach the form can populate it.
 *
 * A failure THROWS rather than degrading to an empty list: an empty picker is
 * indistinguishable from "your organization has no gateways", and an operator
 * must not be told there is nothing to register against when the truth is that
 * the list could not be read.
 */
async function fetchParents(
  path: string,
  key: "gateways" | "assets",
  signal?: AbortSignal,
): Promise<ParentOption[]> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new OtWriteError("FAILED", 0);
  }

  if (!response.ok) {
    throw new OtWriteError(classifyWrite(response.status, null), response.status);
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const rows = body && Array.isArray(body[key]) ? (body[key] as unknown[]) : [];

  return rows
    .map((raw) => raw as { id?: unknown; name?: unknown; gatewayId?: unknown; siteId?: unknown })
    .filter((row): row is { id: string; name: string; siteId: string; gatewayId?: string } =>
      typeof row.id === "string" && row.id.length > 0 && typeof row.siteId === "string",
    )
    .map((row) => ({
      id: row.id,
      label: typeof row.name === "string" && row.name.length > 0 ? row.name : row.id,
      reference: typeof row.gatewayId === "string" && row.gatewayId.length > 0 ? row.gatewayId : null,
      siteId: row.siteId,
    }));
}

/** Registry gateways a profile can be attached to. */
export function fetchGatewayParents(signal?: AbortSignal): Promise<ParentOption[]> {
  return fetchParents("/api/industrial/gateways", "gateways", signal);
}

/** Industrial assets a device profile can be attached to. */
export function fetchAssetParents(signal?: AbortSignal): Promise<ParentOption[]> {
  return fetchParents("/api/industrial/assets", "assets", signal);
}

export { OtRequestError };
