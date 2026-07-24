import { describe, it, expect } from "vitest";
import { can, requirePermission, type OrgPermission } from "@/lib/org/rbac";
import { ALL_ORG_ROLES, type OrgRole } from "@/lib/org/types";

/**
 * PHASE 94B2 — OT / engineering RBAC.
 *
 * The matrix is asserted for EVERY role × EVERY new permission, so a role can
 * never silently gain a capability. It also pins the separations that matter:
 * an ENGINEER may import and analyse but not administer gateway lifecycle, and
 * BILLING_ADMIN — a finance role — gets no engineering write capability.
 */

const OT_READ = [
  "view_ot_gateway",
  "view_ot_device",
  "view_engineering_project",
] as const satisfies readonly OrgPermission[];

const OT_WRITE = [
  "manage_ot_gateway",
  "manage_ot_device",
  "create_engineering_import",
  "run_engineering_analysis",
  "review_engineering_finding",
] as const satisfies readonly OrgPermission[];

const ALL_OT = [...OT_READ, ...OT_WRITE];

/** The specification, restated independently of the implementation. */
const EXPECTED: Record<(typeof ALL_OT)[number], OrgRole[]> = {
  view_ot_gateway: ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  view_ot_device: ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  view_engineering_project: ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"],
  manage_ot_gateway: ["OWNER", "ADMIN", "MANAGER"],
  manage_ot_device: ["OWNER", "ADMIN", "MANAGER"],
  create_engineering_import: ["OWNER", "ADMIN", "MANAGER", "ENGINEER"],
  run_engineering_analysis: ["OWNER", "ADMIN", "MANAGER", "ENGINEER"],
  review_engineering_finding: ["OWNER", "ADMIN", "MANAGER"],
};

describe("94B2 — the OT role matrix is exact", () => {
  it.each(ALL_OT)("%s grants exactly the specified roles", (permission) => {
    for (const role of ALL_ORG_ROLES) {
      const expected = EXPECTED[permission].includes(role);
      expect(can(role, permission), `${role} → ${permission}`).toBe(expected);
    }
  });

  it("covers every role × every new permission", () => {
    expect(ALL_ORG_ROLES).toHaveLength(6);
    expect(ALL_OT).toHaveLength(8);
  });
});

describe("94B2 — least privilege is preserved", () => {
  it("VIEWER can read the OT surface but write nothing", () => {
    for (const p of OT_READ) expect(can("VIEWER", p), p).toBe(true);
    for (const p of OT_WRITE) expect(can("VIEWER", p), `VIEWER must not ${p}`).toBe(false);
  });

  it("ENGINEER may import and analyse but not administer gateways or devices", () => {
    expect(can("ENGINEER", "create_engineering_import")).toBe(true);
    expect(can("ENGINEER", "run_engineering_analysis")).toBe(true);
    expect(can("ENGINEER", "manage_ot_gateway"), "lifecycle is administrative").toBe(false);
    expect(can("ENGINEER", "manage_ot_device")).toBe(false);
  });

  it("reviewing a finding is restricted to accountable roles", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER"] as const) {
      expect(can(role, "review_engineering_finding")).toBe(true);
    }
    for (const role of ["ENGINEER", "VIEWER", "BILLING_ADMIN"] as const) {
      expect(can(role, "review_engineering_finding"), `${role} must not review`).toBe(false);
    }
  });

  it("BILLING_ADMIN — a finance role — gets no engineering write capability", () => {
    for (const p of OT_WRITE) expect(can("BILLING_ADMIN", p), p).toBe(false);
  });

  it("OWNER and ADMIN hold every OT capability", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      for (const p of ALL_OT) expect(can(role, p), `${role} → ${p}`).toBe(true);
    }
  });

  it("a denial is a 403 with no capability disclosure", () => {
    const r = requirePermission("VIEWER", "create_engineering_import");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      // the message must not name the permission a prober lacks
      expect(r.error).not.toContain("create_engineering_import");
    }
  });
});

describe("94B2 — the existing RBAC system was extended, not replaced", () => {
  it("pre-existing permissions keep their exact role sets", () => {
    // A regression here would mean Phase 94 changed unrelated authorization.
    expect(can("VIEWER", "view_industrial")).toBe(true);
    expect(can("VIEWER", "manage_industrial")).toBe(false);
    expect(can("ENGINEER", "manage_industrial")).toBe(false);
    expect(can("OWNER", "delete_org")).toBe(true);
    expect(can("ADMIN", "delete_org")).toBe(false);
    expect(can("ENGINEER", "manage_knowledge")).toBe(true);
    expect(can("VIEWER", "manage_knowledge")).toBe(false);
  });

  it("OT read parity matches the established industrial read matrix", () => {
    // Same audience as view_industrial — no new information class is exposed
    // to a role that could not already see the industrial surface.
    for (const role of ALL_ORG_ROLES) {
      for (const p of OT_READ) {
        expect(can(role, p), `${role} → ${p}`).toBe(can(role, "view_industrial"));
      }
    }
  });
});
