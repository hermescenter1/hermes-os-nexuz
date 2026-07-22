# OT List API Contract

Phase 94B.1. Covers the two Phase 94 OT **list** endpoints only:

- `GET /api/ot/gateways`
- `GET /api/ot/devices`

The other two Phase 94 OT route files (`/api/ot/gateways/[id]`,
`/api/ot/devices/[id]`) expose `GET` and `PATCH` for a single record and take no
query parameters. Machine ingestion
(`POST /api/ot/gateways/[id]/envelopes`) is a separate, cryptographically
authenticated surface and is not part of this document.

Every statement below is covered by a test. Parsing, validation and
parameter-forwarding are covered by suites that run in `npm run test`
(`src/lib/ot-edge/http/__tests__/list-filters.test.ts`,
`src/app/api/ot/__tests__/ot-routes.test.ts`,
`src/lib/ot-edge/__tests__/dto-and-scope.test.ts`). Everything that depends on
the generated SQL — which rows a filter returns, filter-before-pagination,
tenant and site isolation — is covered by
`src/lib/ot-edge/services/__tests__/services.integration.test.ts`, which needs a
real PostgreSQL database and therefore runs under `node scripts/ot-db-integration.mjs`
rather than in the default test run.

---

## Authorization and scope

Both endpoints run through `withOtRoute`, in this order:

1. resolve the authenticated organization,
2. require an ACTIVE membership,
3. require the org permission (`view_ot_gateway` / `view_ot_device`),
4. rate limit (`ot-read`, 120 requests / 60 s),
5. resolve the actor's allowed sites,
6. build the trusted service context,
7. run the handler.

Filters are applied **after** all of the above and **inside** the tenant-scoped
query. A filter is a narrowing predicate composed with `AND` beside the
organization and site scope, so it can only ever reduce a result set. Neither
endpoint reads an organization, user, role or site allow-list from the query
string; a query parameter with such a name is ignored like any other unknown
parameter.

---

## Pagination and sorting (unchanged by this phase)

| Parameter | Accepted values | Default |
|---|---|---|
| `page` | integer ≥ 1; malformed input falls back to the default | `1` |
| `pageSize` | integer, clamped to 1..200 | `50` |
| `sortBy` | see below; an unrecognised value falls back silently to the first allowed field | first allowed field |
| `sortDir` | `asc` \| `desc`; anything else falls back | `desc` |

Allowed `sortBy`:

- gateways: `createdAt`, `updatedAt`, `lifecycle`
- devices: `createdAt`, `updatedAt`, `category`

`total` in the response counts the rows **visible to this actor after
filtering** — never an organization-wide total.

---

## `GET /api/ot/gateways` — filters

| Parameter | Accepted values | Matches |
|---|---|---|
| `lifecycle` | `REGISTERED`, `ACTIVE`, `STALE`, `DISABLED`, `REVOKED`, `SIMULATOR` | the profile's lifecycle |
| `siteId` | `^[A-Za-z0-9_-]{1,191}$` | the site of the related gateway registry record |
| `capability` | `PROJECT_METADATA_IMPORT`, `TAG_METADATA_IMPORT`, `ALARM_METADATA_IMPORT`, `NETWORK_METADATA_IMPORT`, `READ_ONLY_TELEMETRY`, `SIMULATION` | profiles **declaring** that capability |
| `search` | free text, 1..120 characters | case-insensitive substring of the gateway's name **or** its hardware identifier |

**No `category` parameter exists.** `EdgeGatewayProfile` has no category column;
the parameter is ignored rather than accepted, because accepting it would
advertise a filter that could never do anything.

The hardware identifier is *searchable* but is still never *returned*. This
phase adds no field to `GatewayProfileDto`.

## `GET /api/ot/devices` — filters

| Parameter | Accepted values | Matches |
|---|---|---|
| `lifecycle` | `PLANNED`, `COMMISSIONING`, `OPERATIONAL`, `MAINTENANCE`, `DECOMMISSIONED`, `UNKNOWN` | the profile's `lifecycleState` column |
| `siteId` | `^[A-Za-z0-9_-]{1,191}$` | the site of the related asset |
| `category` | `PLC`, `HMI`, `SCADA_SERVER`, `VFD`, `MCC`, `REMOTE_IO`, `INDUSTRIAL_PC`, `SAFETY_CONTROLLER`, `NETWORK_SWITCH`, `GATEWAY`, `SENSOR_AGGREGATOR`, `OTHER` | the profile's category |
| `search` | free text, 1..120 characters | case-insensitive substring of the related asset's name **or** the engineering identifier |

**No `vendor` / `manufacturer` parameter exists.** `OtDeviceProfile` persists no
manufacturer, model or protocol column, so such a filter could only ever match
nothing. See *Known limitations*.

---

## Combination, pagination and sorting behaviour

- Multiple filters combine as a **conjunction** (AND). `?lifecycle=ACTIVE&siteId=s1`
  returns only gateways that are both.
- `search` is internally a disjunction across its two target fields, and that
  disjunction is one conjunct of the overall predicate.
- Filtering happens **before** pagination, in the database. `total` reflects the
  filtered set, and page *n* is page *n* **of the filtered set**.
- Filtering composes with sorting; sort behaviour is unchanged.
- A filter that matches nothing returns `200` with `items: []` and `total: 0` —
  it is not an error.

---

## Invalid values

An **unrecognised value for a supported parameter** is refused:

```
HTTP 400
Cache-Control: no-store, max-age=0
{ "ok": false, "code": "INVALID_QUERY_PARAMETER", "message": "The value supplied for \"<parameter>\" is not accepted." }
```

The response names the parameter but never repeats the submitted value, so the
endpoint cannot be used to probe or reflect input.

A refused request runs **no list query**: validation happens at the top of the
handler, before any repository call. It is not free of database work — the
authorization chain (`withOtRoute`) has already resolved the membership and the
site scope before the handler runs, which is the correct order and is unchanged
by this phase. Refused requests are bounded by the same `ot-read` rate limit as
successful ones.

Rules:

- enum comparison is **case-sensitive** — `?lifecycle=active` is refused;
- an absent or blank value (`?lifecycle=`) means "no filter", not "match
  nothing", so a cleared dropdown is not an error;
- a `search` term longer than 120 characters is **refused, not truncated** — a
  silently shortened term would return rows that do not match what was typed;
- an **unsupported parameter name** is ignored, consistent with the pre-existing
  behaviour of the shared query parser. A *supported* parameter is never
  silently ignored: it is honoured or refused.

---

## `lastSeenAt` semantics

`GatewayProfileDto.lastSeenAt` is the time the gateway's **most recent signed
envelope was accepted** (`EdgeGatewayProfile.lastEnvelopeAt`), serialised as an
ISO-8601 UTC string.

- `null` means no envelope has ever been accepted. It is never synthesised from
  `createdAt` or `updatedAt` — "never seen" and "seen" stay distinguishable.
- It is unrelated to `IndustrialGateway.lastSeenAt`, which is a separate
  heartbeat field on the registry record and is not exposed here.

Before Phase 94B.1 this field was always `null` on every route because the
mapper read a key the record does not carry. The public field name is unchanged.

---

## Known limitations (deliberately not solved in this phase)

- **Device display name.** `OtDeviceProfileDto` provides no name. The related
  asset's name is not part of the DTO.
- **Device vendor data.** `manufacturer`, `model`, `protocols` and
  `lastImportSource` exist on the DTO but no column backs them and no write path
  populates them; they are always `null` / `[]`. No filter or search targets
  them.
- **`gatewayId` is a system identifier.** `GatewayProfileDto.gatewayId` is the
  primary key of the related `IndustrialGateway` row. It is **not** a hardware
  serial number, a public gateway identifier or a device identity, and must not
  be presented as one. The hardware identifier lives on the registry record and
  is not returned by this API.
- **No site or asset names.** The DTOs carry `siteId` / `assetId` only.
- **Navigation visibility is not authorization.** Application-shell visibility
  uses the application capability policy; OT access is enforced server-side by
  the org permissions listed above. A direct request from an actor lacking the
  permission is rejected regardless of what the navigation shows.
