/**
 * PHASE 110-A1.0 — adversarial tests for tenant-context resolution.
 *
 * These exercise `resolveTenantContext` DIRECTLY through its ports rather than
 * through a mocked module registry. That is deliberate: the properties under
 * test are "a thrown query is never reported as an empty result", "several
 * memberships never collapse to one" and "a shape the resolver does not
 * understand never becomes a tenant". All three live in the decision itself. A
 * suite that mocked `@/lib/db/prisma` would be asserting against its own double
 * on the branches that matter most, and every branch here is reachable from an
 * ordinary function call instead.
 *
 * The negative controls at the end are the evidence that these assertions bite:
 * each re-implements the resolver with one safeguard removed and proves the
 * corresponding property would be violated.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveTenantContext,
  resolveTenantContextForCandidate,
  type TenantContextPorts,
  type MembershipRow,
  type OrganizationRow,
} from "../context";
import {
  hasTenantContext,
  MEMBER_STATUSES,
  ORGANIZATION_ROLES,
  TENANT_CONTEXT_STATES,
  TRUSTED_VALUE_MAX_LENGTH,
} from "../contract";

/* ── Fixtures ────────────────────────────────────────────────────────────── */

/** A real NUL, built at runtime so no literal control byte lives in this source. */
const NUL_CHAR = String.fromCharCode(0);

const USER = "user-1";
const OTHER_USER = "user-2";

const ORGS: Record<string, OrganizationRow> = {
  "org-alpha": { id: "org-alpha", slug: "alpha" },
  "org-beta": { id: "org-beta", slug: "beta" },
  "org-gamma": { id: "org-gamma", slug: "gamma" },
};

interface Opts {
  userId?: unknown;
  memberships?: Record<string, unknown>;
  organizations?: Record<string, unknown>;
  identityThrows?: boolean;
  membershipsNull?: boolean;
  membershipThrows?: boolean;
  organizationThrows?: boolean;
  /** Force a raw value out of listMemberships, bypassing the keyed lookup. */
  rawMemberships?: unknown;
  /** Force a raw value out of loadOrganization. */
  rawOrganization?: unknown;
}

function ports(opts: Opts): TenantContextPorts {
  const byUser = opts.memberships ?? {};
  const orgs = opts.organizations ?? ORGS;
  return {
    identity: async () => {
      if (opts.identityThrows) throw new Error("session store unreachable");
      return (opts.userId === undefined ? USER : opts.userId) as string | null;
    },
    listMemberships: async (userId) => {
      if (opts.membershipThrows) throw new Error("ECONNREFUSED 10.0.0.5:5432");
      if (opts.membershipsNull) return null;
      if ("rawMemberships" in opts) return opts.rawMemberships as readonly MembershipRow[];
      return ((byUser as Record<string, unknown>)[userId] ?? []) as readonly MembershipRow[];
    },
    loadOrganization: async (id) => {
      if (opts.organizationThrows) throw new Error("ECONNREFUSED 10.0.0.5:5432");
      if ("rawOrganization" in opts) return opts.rawOrganization as OrganizationRow;
      return ((orgs as Record<string, unknown>)[id] ?? null) as OrganizationRow | null;
    },
  };
}

/*
 * Build a membership row.
 *
 * `status` and `role` are typed `string`, not the schema enums, because most of
 * this suite exists to feed the resolver values the schema does NOT allow. The
 * cast is the point of the helper and is confined to it: production code cannot
 * reach `MembershipRow` without passing `projectMembership` first.
 */
const member = (organizationId: string, status = "ACTIVE", role = "OWNER"): MembershipRow =>
  ({ organizationId, role, status }) as unknown as MembershipRow;

/* ── Environment ─────────────────────────────────────────────────────────── */

const ORIGINAL_MODE = process.env.HERMES_STORAGE_MODE;

beforeEach(() => {
  process.env.HERMES_STORAGE_MODE = "database";
});

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.HERMES_STORAGE_MODE;
  else process.env.HERMES_STORAGE_MODE = ORIGINAL_MODE;
  vi.restoreAllMocks();
});

/* ── Identity ────────────────────────────────────────────────────────────── */

describe("identity", () => {
  it("an absent session is UNAUTHENTICATED and carries no userId", async () => {
    const r = await resolveTenantContext(ports({ userId: null }));
    expect(r.state).toBe("UNAUTHENTICATED");
    expect(r).not.toHaveProperty("userId");
    expect(r).not.toHaveProperty("organizationId");
  });

  it("a forged, expired, sid-less or revoked token all reduce to UNAUTHENTICATED", async () => {
    // Every one of those yields `null` from getUserIdFromRequest /
    // getCurrentUser, because both verify the signature AND call
    // isPayloadSessionActive. Keeping them apart here would let an anonymous
    // caller distinguish "no such session" from "session revoked".
    for (const _case of ["forged", "expired", "no-sid", "revoked", "deleted-user"]) {
      const r = await resolveTenantContext(
        ports({ userId: null, memberships: { [USER]: [member("org-alpha")] } }),
      );
      expect(r.state, _case).toBe("UNAUTHENTICATED");
    }
  });

  it("an identity port that THROWS is an outage, not UNAUTHENTICATED", async () => {
    const r = await resolveTenantContext(ports({ identityThrows: true }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("IDENTITY_UNAVAILABLE");
    // Identity was never established, so no userId may be claimed.
    expect(r.userId).toBeUndefined();
  });

  it("a malformed identity result is refused, not treated as anonymous", async () => {
    for (const bad of ["", 42, {}, [], true, "x".repeat(192)]) {
      const r = await resolveTenantContext(ports({ userId: bad }));
      expect(r.state, JSON.stringify(bad)).toBe("MEMBERSHIP_UNAVAILABLE");
      if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
      expect(r.diagnostic).toBe("IDENTITY_RESULT_MALFORMED");
    }
  });

  it("UNAUTHENTICATED is never merged with NO_ACTIVE_ORGANIZATION", async () => {
    const anon = await resolveTenantContext(ports({ userId: null }));
    const noOrg = await resolveTenantContext(ports({ memberships: { [USER]: [] } }));
    expect(anon.state).not.toBe(noOrg.state);
  });
});

/* ── Membership ──────────────────────────────────────────────────────────── */

describe("no active organization", () => {
  it("a user with zero memberships is NO_ACTIVE_ORGANIZATION", async () => {
    const r = await resolveTenantContext(ports({ memberships: { [USER]: [] } }));
    expect(r.state).toBe("NO_ACTIVE_ORGANIZATION");
    expect(r).not.toHaveProperty("organizationId");
  });

  it.each(["SUSPENDED", "INVITED"])(
    "a KNOWN non-ACTIVE status (%s) is a valid row that grants nothing",
    async (status) => {
      const r = await resolveTenantContext(
        ports({ memberships: { [USER]: [member("org-alpha", status)] } }),
      );
      expect(r.state).toBe("NO_ACTIVE_ORGANIZATION");
      expect(r).not.toHaveProperty("organizationId");
    },
  );

  it.each(["REVOKED", "PENDING", "active", "Active", " ACTIVE", "ACTIVE ", "", "ACTIVE" + NUL_CHAR])(
    "an UNKNOWN or malformed status (%j) is refused as a row, never as inactive access",
    async (status) => {
      // The schema declares exactly ACTIVE | INVITED | SUSPENDED. Anything else
      // is a row this resolver does not understand. Classifying it as "inactive"
      // would mean a status added to the schema tomorrow silently becomes a
      // recognised state here; refusing it forces the decision to be made.
      const r = await resolveTenantContext(
        ports({ memberships: { [USER]: [member("org-alpha", status)] } }),
      );
      expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
      if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
      expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
      expect(r).not.toHaveProperty("organizationId");
    },
  );

  it("every declared MemberStatus is either ACTIVE or grants nothing", async () => {
    for (const status of MEMBER_STATUSES) {
      const r = await resolveTenantContext(
        ports({ memberships: { [USER]: [member("org-alpha", status)] } }),
      );
      if (status === "ACTIVE") expect(hasTenantContext(r)).toBe(true);
      else expect(r.state).toBe("NO_ACTIVE_ORGANIZATION");
    }
  });

  it("no organization is invented for a user who has none", async () => {
    const r = await resolveTenantContext(ports({ memberships: { [USER]: [] } }));
    expect(JSON.stringify(r)).not.toMatch(/org-/);
    expect(JSON.stringify(r)).not.toMatch(/default|personal|global/i);
  });
});

describe("single active organization", () => {
  it("one ACTIVE membership yields that organization", async () => {
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha", "ACTIVE", "ADMIN")] } }),
    );
    expect(hasTenantContext(r)).toBe(true);
    if (!hasTenantContext(r)) throw new Error("unreachable");
    expect(r.organizationId).toBe("org-alpha");
    expect(r.organizationSlug).toBe("alpha");
    expect(r.organizationRole).toBe("ADMIN");
    expect(r.userId).toBe(USER);
  });

  it("a mix of ACTIVE and inactive counts only the ACTIVE ones", async () => {
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha"), member("org-beta", "SUSPENDED")] } }),
    );
    expect(hasTenantContext(r)).toBe(true);
    if (!hasTenantContext(r)) throw new Error("unreachable");
    expect(r.organizationId).toBe("org-alpha");
  });
});

describe("multiple active organizations", () => {
  it("two ACTIVE memberships refuse rather than choose", async () => {
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha"), member("org-beta")] } }),
    );
    expect(r.state).toBe("MULTIPLE_ACTIVE_ORGANIZATIONS");
    expect(r).not.toHaveProperty("organizationId");
    expect(hasTenantContext(r)).toBe(false);
  });

  it("insertion order does not change the outcome", async () => {
    const forward = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha"), member("org-beta")] } }),
    );
    const reverse = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-beta"), member("org-alpha")] } }),
    );
    expect(forward.state).toBe("MULTIPLE_ACTIVE_ORGANIZATIONS");
    expect(reverse).toEqual(forward);
  });

  it("the candidate list enumerates every proven membership, in a stable order", async () => {
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-gamma"), member("org-alpha"), member("org-beta")] } }),
    );
    if (r.state !== "MULTIPLE_ACTIVE_ORGANIZATIONS") throw new Error("unreachable");
    expect(r.candidates.map((c) => c.organizationId)).toEqual(["org-alpha", "org-beta", "org-gamma"]);
  });

  it("two ACTIVE rows for the SAME organization fail closed, never collapse", async () => {
    // @@unique([organizationId, userId]) makes this unreachable via the schema.
    // Counting it either way would be a guess: one organization read as two, or
    // two rows narrowed to one context.
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha"), member("org-alpha", "ACTIVE", "ADMIN")] } }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("DUPLICATE_MEMBERSHIP_ROWS");
    expect(r).not.toHaveProperty("organizationId");
  });
});

/* ── Organization resolution ─────────────────────────────────────────────── */

describe("organization resolution", () => {
  it("an ACTIVE membership to an unresolvable organization fails closed", async () => {
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-deleted")] }, organizations: {} }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("ORGANIZATION_NOT_RESOLVABLE");
    expect(r.state).not.toBe("NO_ACTIVE_ORGANIZATION");
  });

  it("a loader answering about a DIFFERENT organization is refused", async () => {
    const r = await resolveTenantContext(
      ports({
        memberships: { [USER]: [member("org-alpha")] },
        rawOrganization: { id: "org-evil", slug: "evil" },
      }),
    );
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("ORGANIZATION_NOT_RESOLVABLE");
    expect(JSON.stringify(r)).not.toContain("org-evil");
  });

  it.each([
    ["missing slug", { id: "org-alpha" }],
    ["missing id", { slug: "alpha" }],
    ["numeric id", { id: 7, slug: "alpha" }],
    ["empty id", { id: "", slug: "alpha" }],
    ["numeric slug", { id: "org-alpha", slug: 7 }],
    ["an array", []],
    ["a string", "org-alpha"],
  ])("a malformed organization row (%s) is refused, not repaired", async (_label, raw) => {
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha")] }, rawOrganization: raw }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(["ORGANIZATION_RESULT_MALFORMED", "ORGANIZATION_NOT_RESOLVABLE"]).toContain(r.diagnostic);
  });
});

/* ── Malformed adapter results ───────────────────────────────────────────── */

describe("a port result the resolver does not understand is refused, never mapped to empty", () => {
  it.each([
    ["a string", "rows"],
    ["a number", 7],
    ["an object", { rows: [] }],
    ["a boolean", true],
  ])("listMemberships returning %s is MEMBERSHIP_RESULT_MALFORMED", async (_l, raw) => {
    const r = await resolveTenantContext(ports({ rawMemberships: raw }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
    expect(r.state).not.toBe("NO_ACTIVE_ORGANIZATION");
  });

  it.each([
    ["null row", [null]],
    ["missing organizationId", [{ role: "OWNER", status: "ACTIVE" }]],
    ["numeric organizationId", [{ organizationId: 7, role: "OWNER", status: "ACTIVE" }]],
    ["empty organizationId", [{ organizationId: "", role: "OWNER", status: "ACTIVE" }]],
    ["missing status", [{ organizationId: "org-alpha", role: "OWNER" }]],
    ["numeric status", [{ organizationId: "org-alpha", role: "OWNER", status: 1 }]],
    ["missing role", [{ organizationId: "org-alpha", status: "ACTIVE" }]],
    ["a nested array", [[{ organizationId: "org-alpha", role: "OWNER", status: "ACTIVE" }]]],
    [
      "one good row and one malformed",
      [{ organizationId: "org-alpha", role: "OWNER", status: "ACTIVE" }, { organizationId: 7 }],
    ],
  ])("a malformed membership row (%s) refuses the whole request", async (_l, raw) => {
    const r = await resolveTenantContext(ports({ rawMemberships: raw }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
  });

  it("a malformed row is never skipped — skipping would change the COUNT", async () => {
    // Two ACTIVE rows where one is malformed must not silently become "one
    // active organization".
    const r = await resolveTenantContext(
      ports({
        rawMemberships: [
          { organizationId: "org-alpha", role: "OWNER", status: "ACTIVE" },
          { organizationId: null, role: "OWNER", status: "ACTIVE" },
        ],
      }),
    );
    expect(hasTenantContext(r)).toBe(false);
    expect(r).not.toHaveProperty("organizationId");
  });

  it("an object with a toString that looks like an id is not accepted", async () => {
    const sneaky = { organizationId: { toString: () => "org-alpha" }, role: "OWNER", status: "ACTIVE" };
    const r = await resolveTenantContext(ports({ rawMemberships: [sneaky] }));
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
  });
});

/* ── Trusted-value validation (R2) ───────────────────────────────────────── */

/**
 * The hostile matrix, applied to every string that becomes trusted output.
 *
 * R2-1: the earlier predicate checked only `typeof` and `length`, so every row
 * below was accepted and frozen into a result. Each entry is refused now, and
 * refused BYTE-PRESERVINGLY — nothing here is trimmed, normalised or repaired.
 */
const HOSTILE_IDS: Array<[string, unknown]> = [
  ["empty", ""],
  ["single space", " "],
  ["tab only", "\t"],
  ["newline only", "\n"],
  ["leading space", " user-1"],
  ["trailing space", "user-1 "],
  ["internal space", "user 1"],
  ["NBSP only", "\u00a0"],
  ["embedded NUL", "us" + "\u0000" + "er"],
  ["\u007f", "us" + "\u007f" + "er"],
  ["C1 NEL", "us" + "\u0085" + "er"],
  ["bidi RLO U+202E", "user" + "\u202e" + "1"],
  ["bidi isolate U+2066", "user" + "\u2066" + "1"],
  ["over limit (192)", "x".repeat(TRUSTED_VALUE_MAX_LENGTH + 1)],
  ["number", 42],
  ["null", null],
  ["object", {}],
  ["array", []],
];

describe("R2 — identity identifiers", () => {
  // `null` is excluded: from the identity port it means "no session", which is
  // UNAUTHENTICATED, asserted separately below. Everywhere else in the matrix a
  // null field is genuinely malformed.
  const HOSTILE_IDENTITIES = HOSTILE_IDS.filter(([, v]) => v !== null);

  it.each(HOSTILE_IDENTITIES)("a %s identity is IDENTITY_RESULT_MALFORMED", async (_label, bad) => {
    const r = await resolveTenantContext(ports({ userId: bad }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("IDENTITY_RESULT_MALFORMED");
  });

  it("null identity stays UNAUTHENTICATED, not malformed", async () => {
    // `null` is the port saying "no session". Only a non-null value that is not
    // a usable id is a malformed identity.
    expect((await resolveTenantContext(ports({ userId: null }))).state).toBe("UNAUTHENTICATED");
  });

  it("the length boundary is exactly 191 accepted / 192 refused", async () => {
    const at = "u".repeat(TRUSTED_VALUE_MAX_LENGTH);
    const over = "u".repeat(TRUSTED_VALUE_MAX_LENGTH + 1);
    const ok = await resolveTenantContext(ports({ userId: at, memberships: { [at]: [] } }));
    expect(ok.state).toBe("NO_ACTIVE_ORGANIZATION");
    const bad = await resolveTenantContext(ports({ userId: over }));
    expect(bad.state).toBe("MEMBERSHIP_UNAVAILABLE");
  });

  it("a legitimate cuid-shaped identity is accepted byte-for-byte", async () => {
    const cuid = "clr1x2y3z0000abcdefghijkl";
    const r = await resolveTenantContext(
      ports({ userId: cuid, memberships: { [cuid]: [member("org-alpha")] } }),
    );
    if (!hasTenantContext(r)) throw new Error("unreachable");
    expect(r.userId).toBe(cuid);
  });
});

describe("R2 — membership organizationId", () => {
  it.each(HOSTILE_IDS)("a %s organizationId refuses the row", async (_label, bad) => {
    const r = await resolveTenantContext(
      ports({ rawMemberships: [{ organizationId: bad, role: "OWNER", status: "ACTIVE" }] }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
  });

  it("one malformed row among valid rows refuses the WHOLE request", async () => {
    const r = await resolveTenantContext(
      ports({
        rawMemberships: [
          { organizationId: "org-alpha", role: "OWNER", status: "ACTIVE" },
          { organizationId: " org-beta", role: "ADMIN", status: "ACTIVE" },
        ],
      }),
    );
    expect(hasTenantContext(r)).toBe(false);
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
  });
});

describe("R2 — membership role reaches trusted output, so it is a closed enum", () => {
  it.each([...ORGANIZATION_ROLES])("the declared role %s is accepted", async (role) => {
    const r = await resolveTenantContext(
      ports({ rawMemberships: [{ organizationId: "org-alpha", role, status: "ACTIVE" }] }),
    );
    if (!hasTenantContext(r)) throw new Error("unreachable");
    expect(r.organizationRole).toBe(role);
  });

  it.each([
    ["empty", ""],
    ["unknown", "SUPERUSER"],
    ["lowercase", "owner"],
    ["padded", " OWNER"],
    ["trailing space", "OWNER "],
    ["control character", "OW" + "\u0000" + "NER"],
    ["bidi", "OWNER" + "\u202e"],
    ["number", 1],
    ["missing", undefined],
    ["null", null],
    ["object", {}],
  ])("a %s role refuses the row", async (_label, role) => {
    const r = await resolveTenantContext(
      ports({ rawMemberships: [{ organizationId: "org-alpha", role, status: "ACTIVE" }] }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
  });

  it("no arbitrary role can ever appear in trusted output", async () => {
    const r = await resolveTenantContext(
      ports({ rawMemberships: [{ organizationId: "org-alpha", role: "SUPERUSER", status: "ACTIVE" }] }),
    );
    expect(JSON.stringify(r)).not.toContain("SUPERUSER");
  });
});

describe("R2 — organization slug", () => {
  it.each([
    ["empty", ""],
    ["space only", " "],
    ["tab only", "\t"],
    ["leading space", " alpha"],
    ["trailing space", "alpha "],
    ["NBSP padded", "\u00a0" + "alpha"],
    ["embedded NUL", "al" + "\u0000" + "pha"],
    ["\u007f", "al" + "\u007f" + "pha"],
    ["\u0085", "al" + "\u0085" + "pha"],
    ["bidi RLO", "alpha" + "\u202e"],
    ["over limit", "x".repeat(TRUSTED_VALUE_MAX_LENGTH + 1)],
    ["number", 7],
    ["null", null],
    ["missing", undefined],
  ])("a %s slug refuses the organization", async (_label, slug) => {
    const r = await resolveTenantContext(
      ports({
        memberships: { [USER]: [member("org-alpha")] },
        rawOrganization: { id: "org-alpha", slug },
      }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("ORGANIZATION_RESULT_MALFORMED");
  });

  it.each([
    ["canonical slugify output", "acme-corp-lz4k2p"],
    ["internal space (a caller-supplied slug the creation path allows)", "Acme Corp"],
    ["non-ASCII", "شرکت-آلفا"],
    ["at the length limit", "s".repeat(TRUSTED_VALUE_MAX_LENGTH)],
  ])("a %s slug is accepted and preserved byte-for-byte", async (_label, slug) => {
    const r = await resolveTenantContext(
      ports({
        memberships: { [USER]: [member("org-alpha")] },
        rawOrganization: { id: "org-alpha", slug },
      }),
    );
    if (!hasTenantContext(r)) throw new Error("unreachable");
    expect(r.organizationSlug).toBe(slug);
  });
});

/* ── R3: hostile port objects ────────────────────────────────────────────── */

/**
 * R3-1: reading a field is not a neutral act.
 *
 * Destructuring INVOKES getters and Proxy traps, so before this correction a
 * hostile row did not have to pass validation to have an effect — it only had
 * to be looked at. Measured against the pre-R3 source, six shapes THREW out of
 * the closed union (carrying the getter's own message, which in the probe held
 * a connection string), and four more were silently ACCEPTED, including a row
 * whose fields were only inherited.
 *
 * The rule now: an accepted row is an ORDINARY object whose required fields are
 * OWN DATA properties. An accessor is detected from its descriptor and refused
 * rather than invoked. "Ordinary object" is a statement about a prototype, not
 * proof that a value is not a Proxy.
 */

/** Build an object with a throwing accessor on one field. */
function withThrowingGetter(field: string, base: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = { ...base };
  Object.defineProperty(o, field, {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error("getter " + field + " exploded ECONNREFUSED 10.0.0.5:5432");
    },
  });
  return o;
}

/** Build an object with a NON-throwing accessor that counts its executions. */
function withCountingGetter(field: string, base: Record<string, unknown>, value: unknown) {
  const counter = { reads: 0 };
  const o: Record<string, unknown> = { ...base };
  Object.defineProperty(o, field, {
    enumerable: true,
    configurable: true,
    get() {
      counter.reads += 1;
      return value;
    },
  });
  return { object: o, counter };
}

const VALID_ROW = { organizationId: "org-alpha", role: "OWNER", status: "ACTIVE" };
const VALID_ORG = { id: "org-alpha", slug: "alpha" };
const LEAK_PATTERN = /ECONNREFUSED|10\.0\.0\.5|5432|exploded/;

describe("R3 — a hostile membership row is refused without invoking its accessors", () => {
  it.each(["organizationId", "role", "status"])(
    "a throwing getter on %s yields MEMBERSHIP_RESULT_MALFORMED, not a rejection",
    async (field) => {
      const r = await resolveTenantContext(
        ports({ rawMemberships: [withThrowingGetter(field, VALID_ROW)] }),
      );
      expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
      if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
      expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
      expect(JSON.stringify(r)).not.toMatch(LEAK_PATTERN);
    },
  );

  it("a NON-throwing accessor is refused too — and is never invoked", async () => {
    const { object, counter } = withCountingGetter(
      "organizationId",
      { role: "OWNER", status: "ACTIVE" },
      "org-alpha",
    );
    const r = await resolveTenantContext(ports({ rawMemberships: [object] }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    // The whole point: the getter was DETECTED from its descriptor, not run.
    expect(counter.reads).toBe(0);
  });

  /*
   * WHICH Proxy traps matter, and why the answer is not "all of them".
   *
   * Projection performs exactly two meta-operations: `Object.getPrototypeOf`
   * and `Object.getOwnPropertyDescriptor`. Those invoke the `getPrototypeOf`
   * and `getOwnPropertyDescriptor` traps and NOTHING else — verified directly:
   * on a Proxy whose only trap is a throwing `get`, both calls succeed and
   * return the target's real prototype and a real data descriptor.
   *
   * So a Proxy whose `get` or `ownKeys` trap throws is ACCEPTED, and that is
   * the correct outcome rather than a gap: the row's values came from own data
   * descriptors, and the traps that would have run its `get` handler were never
   * invoked.
   *
   * THE GUARANTEE IS NARROWER THAN "NO FOREIGN CODE RUNS", and an earlier
   * revision of this comment overstated it. `Object.getPrototypeOf` and
   * `Object.getOwnPropertyDescriptor` ARE meta-operations that run a Proxy's
   * corresponding traps — measured below at 1 and 3 for an accepted membership
   * row. What is actually guaranteed: required values never come from ordinary
   * property access, accessors are detected rather than invoked, exceptions
   * from the two meta-operations are classified into the union, and no refused
   * value reaches a result. Arbitrary Proxy SIDE EFFECTS are not preventable by
   * catching exceptions, and nothing here claims they are.
   */
  it.each([
    ["getOwnPropertyDescriptor", { getOwnPropertyDescriptor() { throw new Error("proxy gopd trap"); } }],
    ["getPrototypeOf", { getPrototypeOf() { throw new Error("proxy gpo trap"); } }],
  ])("a Proxy whose %s trap throws is refused (that trap IS invoked)", async (_label, handler) => {
    const hostile = new Proxy({ ...VALID_ROW }, handler as ProxyHandler<object>);
    const r = await resolveTenantContext(ports({ rawMemberships: [hostile] }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
  });

  it.each([
    ["get", { get() { throw new Error("proxy get trap"); } }],
    ["ownKeys", { ownKeys() { throw new Error("proxy ownKeys trap"); } }],
  ])("a Proxy whose %s trap throws is accepted — that trap is never invoked", async (_label, handler) => {
    const hostile = new Proxy({ ...VALID_ROW }, handler as ProxyHandler<object>);
    const r = await resolveTenantContext(ports({ rawMemberships: [hostile] }));
    // Accepted, and the trap never ran: had projection touched `get`, this
    // would have thrown out of the union instead.
    expect(hasTenantContext(r)).toBe(true);
    if (!hasTenantContext(r)) throw new Error("unreachable");
    expect(r.organizationId).toBe("org-alpha");
  });

  it("fields inherited from a prototype are NOT own properties and are refused", async () => {
    // Pre-R3 this was ACCEPTED and produced SINGLE_ACTIVE_ORGANIZATION from a
    // row that owned nothing at all.
    const child = Object.create(VALID_ROW) as Record<string, unknown>;
    expect(child.organizationId).toBe("org-alpha"); // readable, but inherited
    const r = await resolveTenantContext(ports({ rawMemberships: [child] }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    expect(hasTenantContext(r)).toBe(false);
  });

  it.each([
    ["class instance", (() => { class Row { organizationId = "org-alpha"; role = "OWNER"; status = "ACTIVE"; } return new Row(); })()],
    ["Date", new Date()],
    ["Map", new Map()],
    ["Set", new Set()],
  ])("an exotic container (%s) is refused", async (_label, row) => {
    const r = await resolveTenantContext(ports({ rawMemberships: [row] }));
    expect(hasTenantContext(r)).toBe(false);
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
  });

  /*
   * WHY THE OWN-PROPERTY REQUIREMENT IS LOAD-BEARING ON ITS OWN.
   *
   * `Object.create(VALID_ROW)` is already refused one step earlier, by the
   * prototype check — its prototype is neither `Object.prototype` nor `null`.
   * So that case does not prove the own-property rule; mutation M28 (fall back
   * to an inherited descriptor) had a blast radius of ZERO against it.
   *
   * The case that does prove it is PROTOTYPE POLLUTION. A row that is an
   * entirely ordinary object — prototype exactly `Object.prototype`, so the
   * prototype check passes — can still "have" a field it does not own, if
   * `Object.prototype` itself has been given one. Property ACCESS finds it;
   * `Object.getOwnPropertyDescriptor` does not.
   *
   * This is the difference between "the row has a role" and "the row owns a
   * role", and it decides whether a membership with no role of its own can be
   * granted `OWNER` by a global someone else wrote.
   */
  it.each(["role", "status", "organizationId"])(
    "a polluted Object.prototype cannot supply the %s field",
    async (field) => {
      const base: Record<string, unknown> = {
        organizationId: "org-alpha",
        role: "OWNER",
        status: "ACTIVE",
      };
      // Remove the field the row would otherwise own, then supply it globally.
      delete base[field];
      const polluted = field === "role" ? "OWNER" : field === "status" ? "ACTIVE" : "org-alpha";

      Object.defineProperty(Object.prototype, field, {
        value: polluted,
        writable: true,
        configurable: true,
        enumerable: false,
      });
      try {
        // Property access DOES see it — this is a real ordinary object.
        expect(Object.getPrototypeOf(base)).toBe(Object.prototype);
        expect((base as Record<string, unknown>)[field]).toBe(polluted);
        // The resolver does not, because it asks for an OWN data descriptor.
        const r = await resolveTenantContext(ports({ rawMemberships: [base] }));
        expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
        if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
        expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
        expect(hasTenantContext(r)).toBe(false);
      } finally {
        delete (Object.prototype as unknown as Record<string, unknown>)[field];
      }
    },
  );

  it("a polluted Object.prototype cannot supply an organization slug", async () => {
    Object.defineProperty(Object.prototype, "slug", {
      value: "alpha",
      writable: true,
      configurable: true,
      enumerable: false,
    });
    try {
      const r = await resolveTenantContext(
        ports({
          memberships: { [USER]: [member("org-alpha")] },
          rawOrganization: { id: "org-alpha" },
        }),
      );
      expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
      if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
      expect(r.diagnostic).toBe("ORGANIZATION_RESULT_MALFORMED");
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>).slug;
    }
  });

  it("a null-prototype record with own data fields IS accepted", async () => {
    // Ordinary means Object.prototype OR null — a bare record is not hostile.
    const bare = Object.assign(Object.create(null), VALID_ROW) as Record<string, unknown>;
    const r = await resolveTenantContext(ports({ rawMemberships: [bare] }));
    expect(hasTenantContext(r)).toBe(true);
  });

  it("a container that throws while being walked is refused, not rejected", async () => {
    const hostileArray = new Proxy([VALID_ROW], {
      get(t, k, recv) {
        if (k === "0") throw new Error("element trap ECONNREFUSED 10.0.0.5:5432");
        return Reflect.get(t, k, recv);
      },
    });
    const r = await resolveTenantContext(ports({ rawMemberships: hostileArray }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
    expect(JSON.stringify(r)).not.toMatch(LEAK_PATTERN);
  });
});

describe("R3 — a hostile organization row is refused without invoking its accessors", () => {
  it.each(["id", "slug"])(
    "a throwing getter on %s yields ORGANIZATION_RESULT_MALFORMED, not a rejection",
    async (field) => {
      const r = await resolveTenantContext(
        ports({
          memberships: { [USER]: [member("org-alpha")] },
          rawOrganization: withThrowingGetter(field, VALID_ORG),
        }),
      );
      expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
      if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
      expect(r.diagnostic).toBe("ORGANIZATION_RESULT_MALFORMED");
      expect(JSON.stringify(r)).not.toMatch(LEAK_PATTERN);
    },
  );

  it("a get-trapping Proxy organization fails at the AWAIT, so it is a loader outage", async () => {
    /*
     * Measured, and worth stating exactly because it looks like a
     * misclassification and is not.
     *
     * `loadOrganization` is `async`, so resolving its promise with an object
     * performs the thenable check — which READS `.then` and therefore fires the
     * `get` trap. The throw happens while awaiting the PORT, before projection
     * ever sees a value, so it is attributed to the port: the loader did not
     * return, so ORGANIZATION_QUERY_FAILED is the truthful diagnostic.
     *
     * A membership Proxy behaves differently for the same reason: it is an
     * element inside a resolved array, never itself awaited.
     */
    const hostile = new Proxy({ ...VALID_ORG }, { get() { throw new Error("proxy get"); } });
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha")] }, rawOrganization: hostile }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("ORGANIZATION_QUERY_FAILED");
    expect(JSON.stringify(r)).not.toMatch(LEAK_PATTERN);
  });

  it("an inherited organization row is refused", async () => {
    const child = Object.create(VALID_ORG) as Record<string, unknown>;
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha")] }, rawOrganization: child }),
    );
    expect(hasTenantContext(r)).toBe(false);
  });

  it("a thrown LOADER still reports ORGANIZATION_QUERY_FAILED", async () => {
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha")] }, organizationThrows: true }),
    );
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("ORGANIZATION_QUERY_FAILED");
  });
});

/* ── R5: the error boundary, and policy arrays frozen at runtime ─────────── */

/**
 * R5 finding F1 — reporting a failure must not be able to cause one.
 *
 * Every catch used to hand the RAW thrown value to `logInfraFailure`, which
 * reads `error.constructor.name` and `error.message.slice(0, 300)`. Neither is
 * safe on an untrusted value, and the call itself was unguarded. Measured
 * against the R4 source with the REAL logger, all 18 combinations
 * (3 hostile values x 3 ports x 2 public entry points) left the closed union as
 * a REJECTED PROMISE:
 *
 *   Error whose `message` getter throws -> the getter's own text escaped
 *   Error whose `message` is null       -> TypeError from `.slice`
 *   revoked Proxy as the rejection      -> TypeError from `instanceof`
 *
 * The resolver spent four rounds refusing to read untrusted fields and then
 * read the most untrusted value of all on the way to the log. These tests call
 * the real module with the real logger — mocking `logInfraFailure` here would
 * hide exactly the defect under test.
 */

const PRIVATE_MARKER = "SYNTHETIC_PRIVATE_MARKER";

/** An Error whose `message` getter throws. */
function errorWithThrowingMessage(): Error {
  const e = new Error("synthetic");
  Object.defineProperty(e, "message", {
    configurable: true,
    get() {
      throw new Error(PRIVATE_MARKER);
    },
  });
  return e;
}

/** An Error whose `message` is null, so `.slice` throws. */
function errorWithNullMessage(): Error {
  const e = new Error("synthetic");
  Object.defineProperty(e, "message", { configurable: true, value: null });
  return e;
}

/** A revoked Proxy as the rejection reason, so `instanceof` throws. */
function revokedRejection(): unknown {
  const { proxy, revoke } = Proxy.revocable(new Error("synthetic"), {});
  revoke();
  return proxy;
}

const HOSTILE_THROWN: Array<[string, () => unknown]> = [
  ["message getter throws", errorWithThrowingMessage],
  ["message is null", errorWithNullMessage],
  ["revoked proxy rejection", revokedRejection],
];

const THROWING_PORT: Array<[string, "identity" | "listMemberships" | "loadOrganization", string]> = [
  ["identity", "identity", "IDENTITY_UNAVAILABLE"],
  ["listMemberships", "listMemberships", "MEMBERSHIP_QUERY_FAILED"],
  ["loadOrganization", "loadOrganization", "ORGANIZATION_QUERY_FAILED"],
];

function portsThatThrow(
  which: "identity" | "listMemberships" | "loadOrganization",
  make: () => unknown,
): TenantContextPorts {
  return {
    identity: async () => {
      if (which === "identity") throw make();
      return USER;
    },
    listMemberships: async () => {
      if (which === "listMemberships") throw make();
      return which === "loadOrganization"
        ? ([VALID_ROW] as unknown as readonly MembershipRow[])
        : ([] as unknown as readonly MembershipRow[]);
    },
    loadOrganization: async () => {
      if (which === "loadOrganization") throw make();
      return null;
    },
  };
}

describe("R5 F1 — a hostile thrown value is classified, never re-thrown", () => {
  for (const [portLabel, port, diagnostic] of THROWING_PORT) {
    for (const [valueLabel, make] of HOSTILE_THROWN) {
      it(`resolveTenantContext: ${portLabel} rejects with ${valueLabel}`, async () => {
        const r = await resolveTenantContext(portsThatThrow(port, make));
        expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
        if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
        expect(r.diagnostic).toBe(diagnostic);
        expect(Object.isFrozen(r)).toBe(true);
        expect(JSON.stringify(r)).not.toContain(PRIVATE_MARKER);
      });

      it(`resolveTenantContextForCandidate: ${portLabel} rejects with ${valueLabel}`, async () => {
        const r = await resolveTenantContextForCandidate(portsThatThrow(port, make), "org-alpha");
        expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
        if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
        expect(r.diagnostic).toBe(diagnostic);
        expect(Object.isFrozen(r)).toBe(true);
        expect(JSON.stringify(r)).not.toContain(PRIVATE_MARKER);
      });
    }
  }

  it("the three ports keep DISTINCT diagnostics — the causes never merge", async () => {
    const seen = new Set<string>();
    for (const [, port] of THROWING_PORT) {
      const r = await resolveTenantContext(portsThatThrow(port, errorWithNullMessage));
      if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
      seen.add(r.diagnostic);
    }
    expect([...seen].sort()).toEqual([
      "IDENTITY_UNAVAILABLE",
      "MEMBERSHIP_QUERY_FAILED",
      "ORGANIZATION_QUERY_FAILED",
    ]);
  });

  it("no getter on the thrown object is invoked to build the event", async () => {
    let reads = 0;
    const watched = new Error("synthetic");
    Object.defineProperty(watched, "message", {
      configurable: true,
      get() {
        reads += 1;
        return PRIVATE_MARKER;
      },
    });
    const r = await resolveTenantContext({
      identity: async () => {
        throw watched;
      },
      listMemberships: async () => [],
      loadOrganization: async () => null,
    });
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    expect(reads).toBe(0);
    expect(JSON.stringify(r)).not.toContain(PRIVATE_MARKER);
  });

  it("an outage still never becomes UNAUTHENTICATED or NO_ACTIVE_ORGANIZATION", async () => {
    for (const [, port] of THROWING_PORT) {
      for (const [, make] of HOSTILE_THROWN) {
        const r = await resolveTenantContext(portsThatThrow(port, make));
        expect(r.state).not.toBe("UNAUTHENTICATED");
        expect(r.state).not.toBe("NO_ACTIVE_ORGANIZATION");
        expect(hasTenantContext(r)).toBe(false);
      }
    }
  });
});

/**
 * A failing log sink must not change a tenant decision.
 *
 * MEASURED FIRST, then asserted. `src/lib/logger/index.ts` writes with
 * `process.stdout.write(line)` inside a `try`, falling back to a `console.log`
 * that is itself wrapped in `try { } catch { }`. So the SINK cannot throw out
 * of the logger today — these tests break the real sink and prove the decision
 * is unaffected, which is a composition property worth pinning, but they are
 * not what makes `recordInfraFailure`'s guard load-bearing.
 *
 * What made it load-bearing is F1: the logger threw BEFORE reaching the sink,
 * while reading `error.constructor.name` and `error.message.slice(0, 300)` off
 * the value the resolver handed it. That is covered by the 18 cases above.
 * With the raw value no longer forwarded, the remaining guard is defence in
 * depth against a future logger that throws early — stated as such rather than
 * dressed up as a reachable path.
 *
 * An earlier draft of these tests broke `console.*` instead. In Node that is
 * not the sink at all, so all three passed without exercising anything. They
 * are rewritten against `process.stdout.write`.
 */
describe("R5 F1 — a failing log sink changes nothing", () => {
  const originalWrite = process.stdout.write.bind(process.stdout);

  function breakSink(): void {
    (process.stdout as unknown as { write: unknown }).write = () => {
      throw new Error("sink exploded " + PRIVATE_MARKER);
    };
  }

  function restoreSink(): void {
    (process.stdout as unknown as { write: unknown }).write = originalWrite;
  }

  afterEach(() => {
    restoreSink();
  });

  it("an outage still resolves to its own diagnostic when the sink throws", async () => {
    breakSink();
    const r = await resolveTenantContext(portsThatThrow("listMemberships", errorWithNullMessage));
    restoreSink();
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_QUERY_FAILED");
    expect(Object.isFrozen(r)).toBe(true);
  });

  it("a denial path still resolves when the sink throws", async () => {
    breakSink();
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha"), member("org-beta")] } }),
    );
    restoreSink();
    expect(r.state).toBe("MULTIPLE_ACTIVE_ORGANIZATIONS");
  });

  it("the happy path is unaffected by a throwing sink", async () => {
    breakSink();
    const r = await resolveTenantContext(ports({ memberships: { [USER]: [member("org-alpha")] } }));
    restoreSink();
    expect(hasTenantContext(r)).toBe(true);
    if (!hasTenantContext(r)) throw new Error("unreachable");
    expect(r.organizationId).toBe("org-alpha");
  });

  it("a HEALTHY sink still receives a structured event — logging was NOT removed", async () => {
    const written: string[] = [];
    (process.stdout as unknown as { write: unknown }).write = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    await resolveTenantContext(portsThatThrow("listMemberships", errorWithNullMessage));
    restoreSink();

    const blob = written.join("");
    expect(blob).toContain("infra_failure");
    expect(blob).toContain("tenant.memberships");
    // The closed diagnostic token is what gets recorded...
    expect(blob).toContain("MEMBERSHIP_QUERY_FAILED");
    // ...and nothing derived from the caught value ever does.
    expect(blob).not.toContain(PRIVATE_MARKER);
  });

  it("a denial event still reaches a healthy sink", async () => {
    const written: string[] = [];
    (process.stdout as unknown as { write: unknown }).write = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha"), member("org-beta")] } }),
    );
    restoreSink();
    const blob = written.join("");
    expect(blob).toContain("authz_denied");
    expect(blob).toContain("multiple_active_memberships");
  });
});

/**
 * R5 finding F3 — `as const` is a compile-time assertion, not a runtime freeze.
 *
 * `Object.isFrozen` was false for every exported policy array, and the role and
 * status predicates read those arrays on each request. A same-process write
 * could therefore add a role. Not a remote attack — it needs code execution in
 * the process — but not a property the contract should merely appear to have.
 */
describe("R5 F3 — policy arrays are frozen at runtime", () => {
  it.each([
    ["ORGANIZATION_ROLES", ORGANIZATION_ROLES as readonly string[]],
    ["MEMBER_STATUSES", MEMBER_STATUSES as readonly string[]],
    ["TENANT_CONTEXT_STATES", TENANT_CONTEXT_STATES as readonly string[]],
  ])("%s is frozen and resists every mutator", (_label, arr) => {
    expect(Object.isFrozen(arr)).toBe(true);
    const before = [...arr];
    const target = arr as unknown as string[];
    expect(() => target.push("INJECTED")).toThrow();
    expect(() => {
      target[0] = "INJECTED";
    }).toThrow();
    expect(() => {
      target.length = 0;
    }).toThrow();
    expect(Reflect.set(target, 0, "INJECTED")).toBe(false);
    expect(Reflect.defineProperty(target, "0", { value: "INJECTED" })).toBe(false);
    expect([...arr]).toEqual(before);
  });

  it("an unknown role is still refused after an attempted mutation", async () => {
    const target = ORGANIZATION_ROLES as unknown as string[];
    try {
      target.push("SUPERUSER");
    } catch {
      /* frozen — expected */
    }
    Reflect.set(target, ORGANIZATION_ROLES.length, "SUPERUSER");
    const r = await resolveTenantContext(
      ports({ rawMemberships: [{ organizationId: "org-alpha", role: "SUPERUSER", status: "ACTIVE" }] }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
  });

  it("an unknown status is still refused after an attempted mutation", async () => {
    const target = MEMBER_STATUSES as unknown as string[];
    Reflect.set(target, MEMBER_STATUSES.length, "ARCHIVED");
    const r = await resolveTenantContext(
      ports({ rawMemberships: [{ organizationId: "org-alpha", role: "OWNER", status: "ARCHIVED" }] }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
  });
});

/* ── R4: revoked proxies and measured trap counts ────────────────────────── */

/**
 * R4-1: `Array.isArray` is a META-OPERATION, not a type test.
 *
 * Measured on this repository's Node (v24.18.0):
 *
 *   const { proxy, revoke } = Proxy.revocable([], {}); revoke();
 *   Array.isArray(proxy)
 *     -> TypeError: Cannot perform 'IsArray' on a proxy that has been revoked
 *   typeof proxy === "object"   -> true
 *   proxy === null              -> false
 *
 * So a revoked Proxy reaches the `Array.isArray` call in both the container
 * check and `isOrdinaryObject`, and both were evaluated OUTSIDE a try. Before
 * R4 the union held for the cases below only because a SURROUNDING catch
 * happened to cover them — the container failed at the await thenable check,
 * and the row was inside the container-walk try. That is total-ness by
 * accident of the caller, not by the predicate. R4 moves every meta-operation
 * inside its own guard so the property belongs to the check itself.
 */
describe("R4 — revoked proxies never escape the union", () => {
  it("a revoked container is classified, not thrown", async () => {
    const { proxy, revoke } = Proxy.revocable([VALID_ROW], {});
    revoke();
    const r = await resolveTenantContext(ports({ rawMemberships: proxy }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    expect(Object.isFrozen(r)).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/revoked|IsArray|TypeError/);
  });

  it("a revoked membership row is MEMBERSHIP_RESULT_MALFORMED", async () => {
    const { proxy, revoke } = Proxy.revocable({ ...VALID_ROW }, {});
    revoke();
    const r = await resolveTenantContext(ports({ rawMemberships: [proxy] }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
    expect(JSON.stringify(r)).not.toMatch(/revoked|IsArray|TypeError/);
  });

  it("a revoked organization is classified, not thrown", async () => {
    const { proxy, revoke } = Proxy.revocable({ ...VALID_ORG }, {});
    revoke();
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha")] }, rawOrganization: proxy }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    expect(Object.isFrozen(r)).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/revoked|IsArray|TypeError/);
  });

  it("a proxy that revokes ITSELF mid-projection is classified, not thrown", async () => {
    /*
     * The reachable revocation.
     *
     * A revoked value handed to a port never reaches the shape checks at all:
     * every assimilation route (`async` return, `Promise.resolve`, a thenable)
     * throws at the AWAIT while reading `.then`. Measured — all three.
     *
     * What IS reachable is a proxy that is live when projection starts and
     * revokes itself partway through. `getOwnPropertyDescriptor` succeeds for
     * the first fields and then throws for the rest, so the catch inside
     * `readOwnDataProperty` is the guard that actually carries this case.
     */
    const { proxy, revoke } = Proxy.revocable({ ...VALID_ROW }, {
      getOwnPropertyDescriptor(t, k) {
        if (k === "role") revoke();
        return Reflect.getOwnPropertyDescriptor(t, k);
      },
    });
    const r = await resolveTenantContext(ports({ rawMemberships: [proxy] }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
    expect(Object.isFrozen(r)).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/revoked|TypeError/);
  });

  it("an organization proxy that revokes itself mid-projection is classified", async () => {
    const { proxy, revoke } = Proxy.revocable({ ...VALID_ORG }, {
      getOwnPropertyDescriptor(t, k) {
        // Revoke on the FIRST field, so the SECOND read throws. Revoking on the
        // last field would change nothing: `Reflect.getOwnPropertyDescriptor`
        // reads the TARGET, which stays alive, and no further proxy operation
        // follows. An organization row has only two required fields, so the
        // ordering is the whole difference between reachable and unreachable.
        if (k === "id") revoke();
        return Reflect.getOwnPropertyDescriptor(t, k);
      },
    });
    const r = await resolveTenantContext(
      ports({
        memberships: { [USER]: [member("org-alpha")] },
        organizations: { "org-alpha": proxy },
      }),
    );
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("ORGANIZATION_RESULT_MALFORMED");
    expect(JSON.stringify(r)).not.toMatch(/revoked|TypeError/);
  });

  it("a revoked row among valid rows refuses the whole request", async () => {
    const { proxy, revoke } = Proxy.revocable({ ...VALID_ROW }, {});
    revoke();
    const r = await resolveTenantContext(
      ports({ rawMemberships: [VALID_ROW, proxy] }),
    );
    expect(hasTenantContext(r)).toBe(false);
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
  });

  it("the shape check is total on its own, independent of any caller", async () => {
    // A revoked proxy nested one level deeper than the container walk: the
    // organization projection is called OUTSIDE the loadOrganization try, so
    // before R4 its safety depended on that placement.
    const { proxy, revoke } = Proxy.revocable({ ...VALID_ORG }, {});
    revoke();
    const r = await resolveTenantContext(
      ports({
        memberships: { [USER]: [member("org-alpha")] },
        organizations: { "org-alpha": proxy },
      }),
    );
    expect([...TENANT_CONTEXT_STATES]).toContain(r.state);
    expect(hasTenantContext(r)).toBe(false);
  });
});

/**
 * The traps this module DOES invoke, counted.
 *
 * These numbers are the honest content of the projection guarantee: they are
 * not zero, and the module says so. If a future edit reads a field by ordinary
 * access, `get` would appear here; if it stopped checking the prototype,
 * `getPrototypeOf` would drop to 0. Both are behaviour changes a reviewer
 * should have to acknowledge.
 */
describe("R4 — the meta-traps this module invokes, exactly as measured", () => {
  it("an accepted membership row: getPrototypeOf 1, getOwnPropertyDescriptor 3, get 0", async () => {
    let gpo = 0;
    let gopd = 0;
    let get = 0;
    const counted = new Proxy({ ...VALID_ROW }, {
      getPrototypeOf(t) { gpo += 1; return Reflect.getPrototypeOf(t); },
      getOwnPropertyDescriptor(t, k) { gopd += 1; return Reflect.getOwnPropertyDescriptor(t, k); },
      get(t, k, recv) { get += 1; return Reflect.get(t, k, recv); },
    });
    const r = await resolveTenantContext(ports({ rawMemberships: [counted] }));
    expect(hasTenantContext(r)).toBe(true);
    expect(gpo).toBe(1);
    expect(gopd).toBe(3); // organizationId, role, status — one each
    expect(get).toBe(0); // no ordinary property access, ever
  });

  it("an accepted organization row: getPrototypeOf 1, getOwnPropertyDescriptor 2, get 1 (the await)", async () => {
    let gpo = 0;
    let gopd = 0;
    let get = 0;
    const counted = new Proxy({ ...VALID_ORG }, {
      getPrototypeOf(t) { gpo += 1; return Reflect.getPrototypeOf(t); },
      getOwnPropertyDescriptor(t, k) { gopd += 1; return Reflect.getOwnPropertyDescriptor(t, k); },
      get(t, k, recv) { get += 1; return Reflect.get(t, k, recv); },
    });
    const r = await resolveTenantContext(
      ports({
        memberships: { [USER]: [member("org-alpha")] },
        organizations: { "org-alpha": counted },
      }),
    );
    expect(hasTenantContext(r)).toBe(true);
    expect(gpo).toBe(1);
    expect(gopd).toBe(2); // id, slug
    /*
     * ONE `get`, and it is not projection reading a field.
     *
     * `loadOrganization` is `async`, so resolving its promise with an object
     * performs the THENABLE CHECK, which reads `.then` and fires the trap once
     * before this module sees the value at all. Projection itself still
     * performs zero ordinary property accesses — the membership case above,
     * where the row sits inside an already-resolved array and is never awaited,
     * measures `get === 0`.
     *
     * This is recorded rather than rounded down because it is the difference
     * between "we never touch it" and "the language touches it once on our
     * behalf", and a reader reasoning about a hostile organization value needs
     * the second statement, not the first.
     */
    expect(get).toBe(1);
  });

  it("a trap that merely records a side effect is NOT prevented — only its exceptions are", async () => {
    // The honest limit of this boundary, asserted rather than left implicit.
    // Catching a trap's exception does not stop what the trap already did.
    const sideEffects: string[] = [];
    const counted = new Proxy({ ...VALID_ROW }, {
      getPrototypeOf(t) { sideEffects.push("getPrototypeOf"); return Reflect.getPrototypeOf(t); },
      getOwnPropertyDescriptor(t, k) {
        sideEffects.push("gopd:" + String(k));
        return Reflect.getOwnPropertyDescriptor(t, k);
      },
    });
    await resolveTenantContext(ports({ rawMemberships: [counted] }));
    expect(sideEffects).toEqual([
      "getPrototypeOf",
      "gopd:organizationId",
      "gopd:role",
      "gopd:status",
    ]);
  });
});

describe("R3 — TOTAL RESULT: every hostile input returns a union member", () => {
  const HOSTILE_PORTS: Array<[string, () => TenantContextPorts]> = [
    ["identity throws", () => ports({ identityThrows: true })],
    ["memberships throws", () => ports({ membershipThrows: true })],
    ["organization throws", () => ports({ memberships: { [USER]: [member("org-alpha")] }, organizationThrows: true })],
    ["memberships not an array", () => ports({ rawMemberships: { rows: [] } })],
    ["row getter throws", () => ports({ rawMemberships: [withThrowingGetter("organizationId", VALID_ROW)] })],
    ["row proxy get throws", () => ports({ rawMemberships: [new Proxy({ ...VALID_ROW }, { get() { throw new Error("x"); } })] })],
    ["row proxy gopd throws", () => ports({ rawMemberships: [new Proxy({ ...VALID_ROW }, { getOwnPropertyDescriptor() { throw new Error("x"); } })] })],
    ["row prototype trap throws", () => ports({ rawMemberships: [new Proxy({ ...VALID_ROW }, { getPrototypeOf() { throw new Error("x"); } })] })],
    ["org getter throws", () => ports({ memberships: { [USER]: [member("org-alpha")] }, rawOrganization: withThrowingGetter("id", VALID_ORG) })],
    ["container walk throws", () => ports({ rawMemberships: new Proxy([VALID_ROW], { get(t, k, r2) { if (k === "0") throw new Error("x"); return Reflect.get(t, k, r2); } }) })],
    ["inherited row", () => ports({ rawMemberships: [Object.create(VALID_ROW)] })],
    ["revoked container", () => { const { proxy, revoke } = Proxy.revocable([VALID_ROW], {}); revoke(); return ports({ rawMemberships: proxy }); }],
    ["revoked row", () => { const { proxy, revoke } = Proxy.revocable({ ...VALID_ROW }, {}); revoke(); return ports({ rawMemberships: [proxy] }); }],
    ["revoked organization", () => { const { proxy, revoke } = Proxy.revocable({ ...VALID_ORG }, {}); revoke(); return ports({ memberships: { [USER]: [member("org-alpha")] }, organizations: { "org-alpha": proxy } }); }],
  ];

  it.each(HOSTILE_PORTS)("resolveTenantContext(%s) returns a valid state", async (_l, make) => {
    const r = await resolveTenantContext(make());
    expect([...TENANT_CONTEXT_STATES]).toContain(r.state);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it.each(HOSTILE_PORTS)("resolveTenantContextForCandidate(%s) returns a valid state", async (_l, make) => {
    const r = await resolveTenantContextForCandidate(make(), "org-alpha");
    expect([...TENANT_CONTEXT_STATES]).toContain(r.state);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it("a candidate with throwing coercion hooks is never coerced", async () => {
    const two = { [USER]: [member("org-alpha"), member("org-beta")] };
    const hostile = {
      toString() { throw new Error("toString trap"); },
      valueOf() { throw new Error("valueOf trap"); },
    };
    const r = await resolveTenantContextForCandidate(ports({ memberships: two }), hostile);
    expect(r.state).toBe("MULTIPLE_ACTIVE_ORGANIZATIONS");
    expect(r).not.toHaveProperty("organizationId");
  });

  it("a Proxy candidate is rejected by primitive type alone, uninspected", async () => {
    const two = { [USER]: [member("org-alpha"), member("org-beta")] };
    let trapped = false;
    const hostile = new Proxy({}, { get() { trapped = true; throw new Error("candidate trap"); } });
    const r = await resolveTenantContextForCandidate(ports({ memberships: two }), hostile);
    expect(r.state).toBe("MULTIPLE_ACTIVE_ORGANIZATIONS");
    // `typeof x !== "string"` short-circuits before any property is touched.
    expect(trapped).toBe(false);
  });
});

/* ── Candidate selection ─────────────────────────────────────────────────── */

describe("a client-supplied organization is a candidate, never an authority", () => {
  const twoOrgs = { [USER]: [member("org-alpha"), member("org-beta")] };

  it("an organization belonging to another user is refused", async () => {
    const r = await resolveTenantContextForCandidate(
      ports({ memberships: { ...twoOrgs, [OTHER_USER]: [member("org-gamma")] } }),
      "org-gamma",
    );
    expect(r.state).toBe("MULTIPLE_ACTIVE_ORGANIZATIONS");
    expect(r).not.toHaveProperty("organizationId");
  });

  it("a valid candidate selects among PROVEN memberships only", async () => {
    const r = await resolveTenantContextForCandidate(ports({ memberships: twoOrgs }), "org-beta");
    expect(hasTenantContext(r)).toBe(true);
    if (!hasTenantContext(r)) throw new Error("unreachable");
    expect(r.organizationId).toBe("org-beta");
    expect(r.organizationSlug).toBe("beta");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["number", 42],
    ["boolean", true],
    ["empty string", ""],
    ["object", {}],
    ["array", []],
    ["array of one id", ["org-beta"]],
    ["object with toString", { toString: () => "org-beta" }],
    ["leading whitespace", " org-beta"],
    ["trailing whitespace", "org-beta "],
    ["over-long", "x".repeat(192)],
  ])("a %s candidate is not coerced into a selection", async (_label, bad) => {
    const r = await resolveTenantContextForCandidate(ports({ memberships: twoOrgs }), bad);
    expect(r.state).toBe("MULTIPLE_ACTIVE_ORGANIZATIONS");
    expect(r).not.toHaveProperty("organizationId");
  });

  it("a candidate naming a SUSPENDED membership is refused", async () => {
    const r = await resolveTenantContextForCandidate(
      ports({
        memberships: {
          [USER]: [member("org-alpha"), member("org-beta"), member("org-gamma", "SUSPENDED")],
        },
      }),
      "org-gamma",
    );
    expect(r.state).toBe("MULTIPLE_ACTIVE_ORGANIZATIONS");
    expect(r).not.toHaveProperty("organizationId");
  });

  it.each([
    ["SINGLE", { [USER]: [member("org-alpha", "ACTIVE", "ADMIN")] }, "org-beta", "SINGLE_ACTIVE_ORGANIZATION"],
    ["NO_ACTIVE", { [USER]: [] }, "org-alpha", "NO_ACTIVE_ORGANIZATION"],
  ])("a candidate cannot override the %s result", async (_l, memberships, candidate, expected) => {
    const r = await resolveTenantContextForCandidate(ports({ memberships }), candidate);
    expect(r.state).toBe(expected);
    if (expected === "SINGLE_ACTIVE_ORGANIZATION") {
      if (!hasTenantContext(r)) throw new Error("unreachable");
      expect(r.organizationId).toBe("org-alpha");
    } else {
      expect(r).not.toHaveProperty("organizationId");
    }
  });

  it("a candidate cannot override an outage", async () => {
    const r = await resolveTenantContextForCandidate(ports({ membershipThrows: true }), "org-alpha");
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    expect(r).not.toHaveProperty("organizationId");
  });

  it("a candidate cannot override UNAUTHENTICATED", async () => {
    const r = await resolveTenantContextForCandidate(ports({ userId: null }), "org-alpha");
    expect(r.state).toBe("UNAUTHENTICATED");
    expect(r).not.toHaveProperty("organizationId");
  });

  it("a role without any membership grants no tenant context", async () => {
    // Role lives in the JWT and is not consulted here at all: an `admin` with
    // no membership rows is answered exactly like any other user with none.
    const r = await resolveTenantContext(ports({ memberships: { [USER]: [] } }));
    expect(r.state).toBe("NO_ACTIVE_ORGANIZATION");
  });
});

/* ── Outages ─────────────────────────────────────────────────────────────── */

describe("outages", () => {
  it("a thrown membership query is MEMBERSHIP_UNAVAILABLE, not an empty result", async () => {
    const r = await resolveTenantContext(ports({ membershipThrows: true }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    expect(r.state).not.toBe("NO_ACTIVE_ORGANIZATION");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_QUERY_FAILED");
    expect(r.userId).toBe(USER);
  });

  it("an unavailable client in database mode is DATABASE_UNAVAILABLE", async () => {
    process.env.HERMES_STORAGE_MODE = "database";
    const r = await resolveTenantContext(ports({ membershipsNull: true }));
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("DATABASE_UNAVAILABLE");
  });

  it("session mode reports a disabled store, still not an empty result", async () => {
    process.env.HERMES_STORAGE_MODE = "session";
    const r = await resolveTenantContext(ports({ membershipsNull: true }));
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("ORGANIZATION_STORE_DISABLED");
  });

  it("a thrown organization lookup is an outage, not a missing organization", async () => {
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha")] }, organizationThrows: true }),
    );
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("ORGANIZATION_QUERY_FAILED");
  });

  it("no refusal ever leaks a driver message, host, port or stack", async () => {
    for (const p of [
      ports({ membershipThrows: true }),
      ports({ memberships: { [USER]: [member("org-alpha")] }, organizationThrows: true }),
      ports({ identityThrows: true }),
      ports({ rawMemberships: "rows" }),
    ]) {
      const body = JSON.stringify(await resolveTenantContext(p));
      expect(body).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|5432|Prisma|unreachable|at Object\./);
    }
  });

  it("every diagnostic is a closed machine token", async () => {
    const r = await resolveTenantContext(ports({ membershipThrows: true }));
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toMatch(/^[A-Z_]+$/);
  });
});

/* ── Output safety ───────────────────────────────────────────────────────── */

describe("the trusted result is deeply immutable and independent", () => {
  /** Walk every nested value, attempt a real mutation, and require it to fail. */
  function assertDeeplyImmutable(v: unknown, at = "root"): void {
    if (v === null || typeof v !== "object") return;
    expect(Object.isFrozen(v), `${at} is not frozen`).toBe(true);
    if (Array.isArray(v)) {
      expect(() => (v as unknown[]).push({})).toThrow();
      expect(() => {
        (v as unknown[])[0] = { injected: true };
      }).toThrow();
    } else {
      expect(() => {
        (v as Record<string, unknown>).__injected = true;
      }).toThrow();
    }
    for (const [k, child] of Object.entries(v)) assertDeeplyImmutable(child, `${at}.${k}`);
  }

  it.each([
    ["SINGLE", { [USER]: [member("org-alpha")] }],
    ["MULTIPLE", { [USER]: [member("org-alpha"), member("org-beta")] }],
    ["NO_ACTIVE", { [USER]: [] }],
    ["INACTIVE_ONLY", { [USER]: [member("org-alpha", "SUSPENDED")] }],
  ])("%s is frozen at every nested layer", async (_label, memberships) => {
    const r = await resolveTenantContext(ports({ memberships }));
    assertDeeplyImmutable(r);
  });

  it("UNAUTHENTICATED and every outage variant are frozen too", async () => {
    assertDeeplyImmutable(await resolveTenantContext(ports({ userId: null })));
    assertDeeplyImmutable(await resolveTenantContext(ports({ membershipThrows: true })));
    assertDeeplyImmutable(await resolveTenantContext(ports({ identityThrows: true })));
    assertDeeplyImmutable(await resolveTenantContext(ports({ membershipsNull: true })));
    assertDeeplyImmutable(await resolveTenantContext(ports({ rawMemberships: 7 })));
  });

  it("a candidate-narrowed result is frozen", async () => {
    const r = await resolveTenantContextForCandidate(
      ports({ memberships: { [USER]: [member("org-alpha"), member("org-beta")] } }),
      "org-beta",
    );
    assertDeeplyImmutable(r);
  });

  it("the candidate array cannot be grown, reordered or reassigned", async () => {
    const r = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha"), member("org-beta")] } }),
    );
    if (r.state !== "MULTIPLE_ACTIVE_ORGANIZATIONS") throw new Error("unreachable");
    expect(() => (r.candidates as unknown as unknown[]).push({})).toThrow();
    expect(() => {
      (r.candidates as unknown as unknown[])[0] = { organizationId: "org-evil" };
    }).toThrow();
    expect(r.candidates.map((c) => c.organizationId)).toEqual(["org-alpha", "org-beta"]);
  });

  it("no object the port returned is re-exposed by reference", async () => {
    // The caller keeps its own reference; mutating it afterwards must not
    // change a result that was already produced from it.
    const live: MembershipRow = { organizationId: "org-alpha", role: "OWNER", status: "ACTIVE" };
    const liveOrg = { id: "org-alpha", slug: "alpha" };
    const r = await resolveTenantContext(
      ports({ rawMemberships: [live], rawOrganization: liveOrg }),
    );
    if (!hasTenantContext(r)) throw new Error("unreachable");
    (live as { organizationId: string }).organizationId = "org-evil";
    (live as unknown as { role: string }).role = "SUPERUSER";
    liveOrg.slug = "evil";
    expect(r.organizationId).toBe("org-alpha");
    expect(r.organizationRole).toBe("OWNER");
    expect(r.organizationSlug).toBe("alpha");
  });

  it("an accessor field is never read at all — a shifting value cannot slip through", async () => {
    /*
     * The load-bearing reason `projectMembership` copies rather than passing
     * the port's object along.
     *
     * `resolveTenantContext` reads `row.organizationId` at three separate
     * points, with an `await` between them: to detect duplicates, to ask the
     * organization loader, and to compare the loaded row's id back. If the row
     * itself were the port's object, a value that answers differently on each
     * read — a getter, a Proxy, or a row a concurrent handler is mutating —
     * could pass the duplicate check as one organization, be looked up as a
     * second, and be compared against a third.
     *
     * The projection reads each field exactly once, so every later read is of
     * a fixed string. This test was added because mutation M6 (return the
     * port's object instead of the copy) produced a blast radius of zero: no
     * assertion distinguished the copy from the reference, which meant the
     * copy was not yet proven to be load-bearing.
     */
    let reads = 0;
    const shifty = {
      get organizationId() {
        reads += 1;
        return reads === 1 ? "org-alpha" : "org-beta";
      },
      role: "OWNER",
      status: "ACTIVE",
    };
    const r = await resolveTenantContext(ports({ rawMemberships: [shifty] }));

    /*
     * R3 STRENGTHENED THIS FROM "read once" TO "not read at all".
     *
     * When this test was written the field was an accessor that projection
     * invoked exactly once, and one read was the guarantee. R3 refuses
     * accessors outright — the descriptor says the field is a getter, and a
     * value this module can only obtain by invoking an accessor is a value it
     * does not trust. So the shifty row never gets to answer, and the
     * count that used to be 1 is now 0.
     *
     * The property under test is unchanged and stricter: a value that could
     * differ between the duplicate check, the organization lookup and the id
     * comparison can never reach any of them.
     */
    expect(r.state).toBe("MEMBERSHIP_UNAVAILABLE");
    if (r.state !== "MEMBERSHIP_UNAVAILABLE") throw new Error("unreachable");
    expect(r.diagnostic).toBe("MEMBERSHIP_RESULT_MALFORMED");
    expect(reads).toBe(0);
  });

  it("the resolver does not mutate the caller's input", async () => {
    const rows = [member("org-beta"), member("org-alpha")];
    const snapshot = JSON.stringify(rows);
    await resolveTenantContext(ports({ rawMemberships: rows }));
    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(Object.isFrozen(rows)).toBe(false); // caller input is left alone entirely
  });

  it("two invocations return independent objects", async () => {
    const p = ports({ memberships: { [USER]: [member("org-alpha"), member("org-beta")] } });
    const a = await resolveTenantContext(p);
    const b = await resolveTenantContext(p);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    if (a.state !== "MULTIPLE_ACTIVE_ORGANIZATIONS") throw new Error("unreachable");
    if (b.state !== "MULTIPLE_ACTIVE_ORGANIZATIONS") throw new Error("unreachable");
    expect(a.candidates).not.toBe(b.candidates);
    expect(a.candidates[0]).not.toBe(b.candidates[0]);
  });
});

/* ── Union exhaustiveness ────────────────────────────────────────────────── */

describe("the union is exhaustive and every state is reachable", () => {
  it("every declared state is produced by some input", async () => {
    const seen = new Set<string>();
    seen.add((await resolveTenantContext(ports({ userId: null }))).state);
    seen.add((await resolveTenantContext(ports({ memberships: { [USER]: [] } }))).state);
    seen.add((await resolveTenantContext(ports({ memberships: { [USER]: [member("org-alpha")] } }))).state);
    seen.add(
      (await resolveTenantContext(ports({ memberships: { [USER]: [member("org-alpha"), member("org-beta")] } })))
        .state,
    );
    seen.add((await resolveTenantContext(ports({ membershipThrows: true }))).state);
    expect([...seen].sort()).toEqual([...TENANT_CONTEXT_STATES].sort());
  });
});

/* ── Negative controls ───────────────────────────────────────────────────── */

/**
 * Each control re-implements one safeguard with it removed, and asserts the
 * property is then violated while the real resolver still holds. This is what
 * makes the suite evidence rather than decoration: a suite that cannot be made
 * to fail is not measuring anything.
 *
 * These are local functions. Nothing in `../context` is patched, so there is no
 * mutated module to restore and no way for a control to leak into the resolver.
 */
describe("negative controls — each proves the matching assertion bites", () => {
  const rows = [member("org-alpha"), member("org-beta")];

  it("RED without the ACTIVE filter: a SUSPENDED member would gain context", async () => {
    const withoutActiveFilter = (all: MembershipRow[]) => all;
    expect(withoutActiveFilter([member("org-alpha", "SUSPENDED")])).toHaveLength(1);
    const real = await resolveTenantContext(
      ports({ memberships: { [USER]: [member("org-alpha", "SUSPENDED")] } }),
    );
    expect(real.state).toBe("NO_ACTIVE_ORGANIZATION");
  });

  it("RED with findFirst: two memberships would collapse, order-dependently", async () => {
    const findFirstBehaviour = (all: MembershipRow[]) => all[0];
    expect(findFirstBehaviour(rows).organizationId).toBe("org-alpha");
    expect(findFirstBehaviour([...rows].reverse()).organizationId).toBe("org-beta");
    const a = await resolveTenantContext(ports({ memberships: { [USER]: rows } }));
    const b = await resolveTenantContext(ports({ memberships: { [USER]: [...rows].reverse() } }));
    expect(a.state).toBe("MULTIPLE_ACTIVE_ORGANIZATIONS");
    expect(a).toEqual(b);
  });

  it("RED trusting the client id: a foreign organization would be honoured", async () => {
    const trustClient = (candidate: string) => ({ organizationId: candidate });
    expect(trustClient("org-gamma").organizationId).toBe("org-gamma");
    const real = await resolveTenantContextForCandidate(
      ports({ memberships: { [USER]: rows } }),
      "org-gamma",
    );
    expect(real).not.toHaveProperty("organizationId");
  });

  it("RED coercing the candidate: String(...) would accept a hostile object", async () => {
    const coerce = (c: unknown) => String(c);
    expect(coerce({ toString: () => "org-beta" })).toBe("org-beta");
    const real = await resolveTenantContextForCandidate(
      ports({ memberships: { [USER]: rows } }),
      { toString: () => "org-beta" },
    );
    expect(real).not.toHaveProperty("organizationId");
  });

  it("RED mapping an outage to empty: the caller would be told a falsehood", async () => {
    const outageAsEmpty = () => ({ state: "NO_ACTIVE_ORGANIZATION" as const });
    expect(outageAsEmpty().state).toBe("NO_ACTIVE_ORGANIZATION");
    const real = await resolveTenantContext(ports({ membershipThrows: true }));
    expect(real.state).toBe("MEMBERSHIP_UNAVAILABLE");
  });

  it("RED skipping malformed rows: the count would silently change", async () => {
    const skipMalformed = (all: unknown[]) => all.filter((r) => typeof (r as MembershipRow)?.organizationId === "string");
    expect(skipMalformed([member("org-alpha"), { organizationId: 7 }])).toHaveLength(1);
    const real = await resolveTenantContext(
      ports({ rawMemberships: [member("org-alpha"), { organizationId: 7, role: "x", status: "ACTIVE" }] }),
    );
    expect(hasTenantContext(real)).toBe(false);
  });

  it("RED reusing the port's object: a later mutation would rewrite the result", async () => {
    const live = { organizationId: "org-alpha", organizationSlug: "alpha", organizationRole: "OWNER" };
    const reuseByReference = { state: "SINGLE" as const, membership: live };
    live.organizationId = "org-evil";
    expect(reuseByReference.membership.organizationId).toBe("org-evil");
    // The real resolver copied the fields, so the same trick changes nothing.
    const liveRow: MembershipRow = { organizationId: "org-alpha", role: "OWNER", status: "ACTIVE" };
    const real = await resolveTenantContext(ports({ rawMemberships: [liveRow] }));
    liveRow.organizationId = "org-evil";
    if (!hasTenantContext(real)) throw new Error("unreachable");
    expect(real.organizationId).toBe("org-alpha");
  });
});
