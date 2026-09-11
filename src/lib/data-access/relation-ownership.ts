/**
 * PHASE 110-A2.0 — a foreign key is a tenant boundary too.
 *
 * Stamping `organizationId` on the row being written is not enough. Every write
 * path in these layers takes its `data` from a request body, and those bodies
 * carry foreign keys:
 *
 *     MaintenanceTask      planId assetId workCenterId failureId
 *                          technicianId teamId vendorId
 *     MaintenancePlan      assetId workCenterId
 *     MaintenanceFailure   assetId taskId failureCodeId
 *     MaintenanceDowntime  assetId taskId
 *
 * A caller in Alpha can therefore create a row that is correctly owned by Alpha
 * and points at Beta's asset. The row passes every `where: { organizationId }`
 * ever written, and the moment any read `include`s that relation, Beta's data
 * arrives in an Alpha response. The leak is in the edge, not in the node.
 *
 * WHAT THIS GUARANTEES, AND WHAT IT DOES NOT
 *
 * It checks that each supplied id belongs to the caller's organization, and it
 * does so INSIDE the same interactive transaction as the write, at
 * `Serializable`, so the check and the insert see one snapshot.
 *
 * It is still a CHECK-THEN-WRITE, and an earlier version of this comment
 * OVERSTATED what the isolation level buys. The claim was that a concurrent
 * move of the referenced row "becomes a serialization failure rather than a
 * silent success". That is wrong, and the counter-example is not even
 * concurrent: create the child while the parent is still in Alpha, COMMIT, then
 * move the parent to Beta in a second transaction. Neither transaction conflicts
 * with the other, both commit, and the relation is left inconsistent.
 * `Serializable` prevents anomalies between OVERLAPPING transactions; it says
 * nothing about a legal sequence of two.
 *
 * WHAT ACTUALLY MAKES THAT SEQUENCE UNREACHABLE HERE is not this module — it is
 * that the product has no such path, measured rather than assumed:
 *
 *   - no route under `src/app/api/cmms` or `src/app/api/assets` writes
 *     `organizationId` at all;
 *   - nothing anywhere reparents these models (`parentAssetId` appears only in
 *     a type declaration, never in a write);
 *   - these two data layers are the ONLY writers of these models in the
 *     repository, and the single `update` they expose strips `organizationId`
 *     from the patch before it reaches the database.
 *
 * So the inconsistency cannot be produced through a supported operation TODAY.
 * That is a statement about the current call graph, not a guarantee about the
 * data: a row could already be inconsistent from before this change, and a
 * future feature that moves rows between organizations would reopen it with
 * nothing here to object.
 *
 * The durable fix is a composite foreign key `(organizationId, id)`, which this
 * repository already uses elsewhere — see the
 * `phase102_tenant_composite_foreign_keys` migration — and which is a schema
 * change this slice forbids. It is recorded as the real remedy, not quietly
 * substituted by this one.
 */



/** A foreign key on the row being written, and the model it points at. */
export interface RelationCheck {
  /** The column on the row being written, e.g. "assetId". */
  readonly field: string;
  /** The Prisma model delegate name the id must exist in, e.g. "registryAsset". */
  readonly model: string;
  /**
   * How that model reaches its organization.
   *
   * `own`     the row carries `organizationId` itself
   * `viaTask` the row reaches it through its task
   * `global`  the row has no tenant at all and is shared by design
   */
  readonly scope: "own" | "viaTask" | "global";
}

/** The foreign keys a body may set, per write path. Read from the schema. */
export const TASK_RELATIONS: readonly RelationCheck[] = [
  { field: "planId", model: "maintenancePlan", scope: "own" },
  { field: "assetId", model: "registryAsset", scope: "own" },
  { field: "workCenterId", model: "maintenanceWorkCenter", scope: "own" },
  { field: "failureId", model: "maintenanceFailure", scope: "own" },
  { field: "technicianId", model: "maintenanceTechnician", scope: "own" },
  { field: "teamId", model: "maintenanceTeam", scope: "own" },
];

export const PLAN_RELATIONS: readonly RelationCheck[] = [
  { field: "assetId", model: "registryAsset", scope: "own" },
  { field: "workCenterId", model: "maintenanceWorkCenter", scope: "own" },
];

export const FAILURE_RELATIONS: readonly RelationCheck[] = [
  { field: "assetId", model: "registryAsset", scope: "own" },
  { field: "taskId", model: "maintenanceTask", scope: "own" },
  { field: "failureCodeId", model: "failureCode", scope: "global" },
];

export const DOWNTIME_RELATIONS: readonly RelationCheck[] = [
  { field: "assetId", model: "registryAsset", scope: "own" },
  { field: "taskId", model: "maintenanceTask", scope: "own" },
];

interface Finder {
  findFirst: (args: unknown) => Promise<unknown | null>;
}

/**
 * A foreign key that does not resolve inside this organization.
 *
 * 400, not 503 and not 409: the request is understood, and what is wrong is a
 * value in it. A MISSING id and a FOREIGN id raise the identical error naming
 * only the FIELD — never the id, never whether it exists elsewhere — so a
 * caller cannot use this to discover which ids live in another organization.
 */
export class InvalidRelationError extends Error {
  readonly code = "INVALID_RELATION" as const;
  readonly status = 400;
  readonly field: string;

  constructor(field: string) {
    super(`The value supplied for ${field} is not available in this organization.`);
    this.name = "InvalidRelationError";
    this.field = field;
  }
}

export const isInvalidRelationError = (e: unknown): e is InvalidRelationError =>
  e instanceof InvalidRelationError;

/**
 * Refuse the whole write unless every supplied foreign key belongs here.
 *
 * `tx` is the transaction client, so these lookups and the write that follows
 * are one unit. A missing id and a foreign id get the SAME refusal: a caller
 * must not be able to learn that an id exists in another organization by
 * comparing two error messages.
 *
 * `vendorId` and `erpWorkOrderId` are deliberately absent from the lists above:
 * they point outside these two layers, at models this slice has not inventoried.
 * They are STRIPPED by the caller rather than validated here, because accepting
 * a foreign key this module cannot check would be the same hole with a longer
 * path.
 */
export async function assertRelationsOwned(
  tx: Record<string, unknown>,
  organizationId: string,
  data: Record<string, unknown>,
  relations: readonly RelationCheck[],
): Promise<void> {
  for (const rel of relations) {
    const value = data[rel.field];
    if (typeof value !== "string" || value.length === 0) continue;

    if (rel.scope === "global") {
      // A shared taxonomy row: it exists or it does not, and it belongs to
      // nobody. Existence is still checked so a bad id fails here rather than
      // as a driver constraint error further down.
      const found = await (tx[rel.model] as unknown as Finder).findFirst({
        where: { id: value },
        select: { id: true },
      });
      if (!found) throw new InvalidRelationError(rel.field);
      continue;
    }

    const where =
      rel.scope === "own"
        ? { id: value, organizationId }
        : { id: value, task: { organizationId } };

    const found = await (tx[rel.model] as unknown as Finder).findFirst({
      where,
      select: { id: true },
    });
    if (!found) throw new InvalidRelationError(rel.field);
  }
}

/**
 * A field this slice does not support, sent with a value.
 *
 * Silently deleting it would be the same defect the layer is being repaired for:
 * the caller asked for something, nothing objected, and the result looks like
 * success while the request was quietly not honoured. `MaintenanceTask` carries
 * `vendorId` and `erpWorkOrderId`, both pointing at models this slice has NOT
 * inventoried and whose ownership it therefore cannot verify. Accepting them
 * unverified would be a cross-tenant hole with a longer path; dropping them in
 * silence would be a lie. So they are refused, by name, with a 400.
 *
 * The four CMMS create schemas ARE `.strict()` since the run-2 rehearsal, so
 * over HTTP an unknown key is refused by the route before the layer sees it —
 * `http-scenarios-run4.log` shows that outer refusal, 400 VALIDATION_FAILED.
 * This one is the SECOND boundary: it holds for a server action, a script or
 * any future caller that does not go through that schema, and it is what a
 * direct-call test exercises.
 */
export class UnsupportedFieldError extends Error {
  readonly code = "UNSUPPORTED_FIELD" as const;
  readonly status = 400;
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`This operation does not support: ${fields.join(", ")}`);
    this.name = "UnsupportedFieldError";
    this.fields = fields;
  }
}

export const isUnsupportedFieldError = (e: unknown): e is UnsupportedFieldError =>
  e instanceof UnsupportedFieldError;

/** Foreign keys these layers cannot verify, and therefore will not accept. */
const UNSUPPORTED_FIELDS = ["vendorId", "erpWorkOrderId"] as const;

/** Fields only the server may decide. A body that names one is refused. */
const SERVER_OWNED_FIELDS = ["organizationId", "id"] as const;

/**
 * Refuse a body that tries to set what it may not, then hand back the rest.
 *
 * `organizationId` is refused rather than ignored: a caller that sends one is
 * trying to choose a tenant, and answering "fine" while resolving a different
 * organization from the session would hide the attempt. `id` is refused on a
 * create for the same reason — it is not the caller's to choose.
 *
 * OMISSION AND NULL ARE DIFFERENT, and that difference is the route's contract
 * rather than this function's invention. The PATCH schema declares its relation
 * fields `.optional().nullable()`: an absent key means "leave it alone" and
 * never reaches the patch, while an explicit `null` means "clear this relation"
 * and is passed through. `assertRelationsOwned` skips non-string values, so a
 * `null` clears the foreign key and has no owner to verify.
 */
export function rejectUnsupportedFields(data: Record<string, unknown>): Record<string, unknown> {
  const offending = [...UNSUPPORTED_FIELDS, ...SERVER_OWNED_FIELDS].filter(
    (f) => Object.prototype.hasOwnProperty.call(data, f) && data[f] !== undefined,
  );
  if (offending.length > 0) throw new UnsupportedFieldError(offending);
  return { ...data };
}
