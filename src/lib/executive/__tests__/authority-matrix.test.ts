/**
 * Executive Management Center — the role × axis matrix, pinned.
 *
 * `resolveExecutiveScope` turns four organization permissions into four
 * authority axes, and those axes decide what every surface of this centre will
 * show. That makes the ROLE TABLE part of the executive security contract even
 * though it lives in `@/lib/org/rbac` — a grant added there, for a reason that
 * has nothing to do with this centre, silently changes who sees management
 * figures.
 *
 * So the whole matrix is pinned here, and three properties are asserted on top
 * of it. The point is not that today's numbers are right; it is that nobody
 * can widen this surface WITHOUT a failing test forcing them to say so.
 *
 * Slice J added the fourth axis (`customers`, from `view_customers`). The
 * escalation question it raised, and that these tests answer for every future
 * change, is: did adding an axis let anybody reach something they could not
 * reach before?
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { can as orgCan } from "@/lib/org/rbac";
import { ORGANIZATION_ROLES, type OrganizationRole } from "@/lib/tenant/contract";

type AxisName = "operations" | "financial" | "industrial" | "customers";

/** Exactly the mapping `scope.ts` performs — kept in step with it by hand. */
const AXIS_PERMISSION = {
  operations: "view_erp",
  financial: "view_erp_compensation",
  industrial: "view_industrial",
  customers: "view_customers",
} as const satisfies Record<AxisName, string>;

const AXES = Object.keys(AXIS_PERMISSION) as AxisName[];

const axesOf = (role: OrganizationRole): Record<AxisName, boolean> =>
  Object.fromEntries(
    AXES.map(a => [a, orgCan(role, AXIS_PERMISSION[a] as Parameters<typeof orgCan>[1])]),
  ) as Record<AxisName, boolean>;

/**
 * The matrix as it stands. Measured from the role table, not hand-written:
 * every row was printed from `rbac.ts` and then frozen here.
 *
 * `o` = operations, `f` = financial, `i` = industrial, `c` = customers.
 */
const MATRIX: Readonly<Record<OrganizationRole, readonly AxisName[]>> = {
  OWNER: ["operations", "financial", "industrial", "customers"],
  ADMIN: ["operations", "industrial", "customers"],
  MANAGER: ["industrial", "customers"],
  ENGINEER: ["industrial"],
  VIEWER: ["industrial"],
  BILLING_ADMIN: ["industrial"],
  MEMBER: [],
  HR_MANAGER: [],
  RECRUITER: [],
  HIRING_MANAGER: [],
  INTERVIEWER: [],
  ACADEMY_ADMIN: [],
  CUSTOMER_SUCCESS_MANAGER: [],
  STUDENT: [],
  COMPLIANCE_MANAGER: [],
};

/**
 * LIVE, not the pin above.
 *
 * The properties below must be read off the real role table, because the
 * natural reaction to a red pin is to update the pin. If these helpers read
 * `MATRIX`, that single edit would make the escalation checks agree with
 * whatever was just granted — a control that re-points at the new reality is
 * not a control. The pin catches "something moved"; these catch "and it moved
 * in a direction nobody may take silently".
 */
const holds = (role: OrganizationRole, axis: AxisName) => axesOf(role)[axis];

/** The gate refuses a reader holding none of the axes (`NO_ACCESSIBLE_AXIS`). */
const reachesThePage = (role: OrganizationRole) => AXES.some(a => holds(role, a));

describe("executive authority — the role matrix is pinned, so widening it cannot be silent", () => {
  it("covers every organization role, with none left out", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...ORGANIZATION_ROLES].sort());
  });

  it.each(ORGANIZATION_ROLES)("resolves %s to exactly the pinned axes", role => {
    const expected = Object.fromEntries(AXES.map(a => [a, MATRIX[role].includes(a)]));
    expect(axesOf(role)).toEqual(expected);
  });
});

describe("executive authority — the fourth axis widened nobody's reach", () => {
  /** The three axes that existed before slice J. */
  const OLD_AXES: readonly AxisName[] = ["operations", "financial", "industrial"];

  it("lets no role reach the page that could not reach it before the customers axis", () => {
    // The refusal `NO_ACCESSIBLE_AXIS` is now computed over four axes instead
    // of three. If any role held `view_customers` and none of the old three,
    // that role would have gained the whole management centre — not just the
    // customer figures — which is exactly the escalation to catch.
    const gained = ORGANIZATION_ROLES.filter(
      role => holds(role, "customers") && !OLD_AXES.some(a => holds(role, a)),
    );
    expect(gained).toEqual([]);
  });

  it("takes the customer figures from nobody: view_customers covers every holder of view_erp", () => {
    // Before slice J the customer section was gated on `view_erp`. The change
    // is non-reducing only while this holds.
    const lost = ORGANIZATION_ROLES.filter(
      role => holds(role, "operations") && !holds(role, "customers"),
    );
    expect(lost).toEqual([]);
  });

  it("gives the customer figures to exactly one role that did not have them: MANAGER", () => {
    // The intended widening, named. A second role appearing here is a decision
    // somebody has to make deliberately, not a diff nobody read.
    const gainedFigures = ORGANIZATION_ROLES.filter(
      role => holds(role, "customers") && !holds(role, "operations"),
    );
    expect(gainedFigures).toEqual(["MANAGER"]);
  });
});

/* ── The real authorization path, of which this matrix is ONE stage ───────── */

describe("executive authority — the matrix is the third of five gates, not the whole of access", () => {
  // Reading the matrix as "who can see the management centre" would be wrong,
  // and the production observation that prompted these tests is exactly that
  // mistake made in the other direction: an account whose organization role
  // holds every axis still saw plants as refused, because SITE ACCESS is a
  // separate grant that no role implies.
  const scopeSource = readFileSync("src/lib/executive/scope.ts", "utf8");

  it("requires the PLATFORM capability before any organization role is consulted", () => {
    // `user.role` is the platform role and is a different system from
    // `OrganizationRole`. Holding platform admin grants ZERO axes; holding
    // OWNER in an organization grants nothing if this gate refuses first.
    expect(scopeSource).toMatch(/platformCan\(user\.role,\s*"admin"\)/);
    const platformGate = scopeSource.indexOf('platformCan(user.role, "admin")');
    const firstAxis = scopeSource.indexOf('orgCan(scope.role, "view_erp")');
    expect(platformGate).toBeGreaterThan(-1);
    expect(firstAxis).toBeGreaterThan(-1);
    // Order matters: the cheap, broad refusal comes first and no tenant query
    // is issued for a caller the platform does not admit.
    expect(platformGate).toBeLessThan(firstAxis);
  });

  it("maps each axis to one named organization permission and nothing else", () => {
    // Stated as an assertion rather than a comment, because the mapping is the
    // whole of what "operations" and "financial" MEAN on this surface:
    //   operations ← view_erp               (NOT a job title, NOT platform admin)
    //   financial  ← view_erp_compensation  (money figures only)
    expect(AXIS_PERMISSION).toEqual({
      operations: "view_erp",
      financial: "view_erp_compensation",
      industrial: "view_industrial",
      customers: "view_customers",
    });
    for (const axis of AXES) {
      expect(scopeSource).toContain(`orgCan(scope.role, "${AXIS_PERMISSION[axis]}")`);
    }
  });

  it("derives site access from a grant table, not from any role", () => {
    // `getAllowedSiteIds(userId, organizationId)` takes no role argument, and
    // an empty list is NOT widened to "the whole organization" — the industrial
    // section fails closed with `noSites`. So an OWNER with no site grant sees
    // the plants section refused, which is correct and is NOT a defect to be
    // fixed by assigning sites.
    expect(scopeSource).toMatch(/getAllowedSiteIds\(scope\.userId,\s*scope\.organizationId\)/);
    expect(scopeSource).not.toMatch(/getAllowedSiteIds\([^)]*role/);
  });

  it("refuses a member who holds no axis, instead of rendering an empty dashboard", () => {
    expect(scopeSource).toContain("NO_ACCESSIBLE_AXIS");
    // All four axes are in the condition — a reader holding only `customers`
    // must not be refused the page.
    const condition = /if \(!authority\.operations && !authority\.financial && !authority\.industrial && !authority\.customers\)/;
    expect(scopeSource).toMatch(condition);
  });
});

describe("executive authority — who is refused outright", () => {
  it("refuses the nine roles that hold no executive axis at all", () => {
    expect(ORGANIZATION_ROLES.filter(r => !reachesThePage(r))).toEqual([
      "MEMBER",
      "HR_MANAGER",
      "RECRUITER",
      "HIRING_MANAGER",
      "INTERVIEWER",
      "ACADEMY_ADMIN",
      "CUSTOMER_SUCCESS_MANAGER",
      "STUDENT",
      "COMPLIANCE_MANAGER",
    ]);
  });

  it("admits exactly six roles, and every one of them through the industrial axis", () => {
    const admitted = ORGANIZATION_ROLES.filter(reachesThePage);
    expect(admitted).toEqual(["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"]);
    // Worth stating because it explains why the page is reachable at all for
    // MANAGER and below: it is `view_industrial`, not anything this centre
    // introduced, that opens the door.
    expect(admitted.every(r => holds(r, "industrial"))).toBe(true);
  });

  it("gives money figures to OWNER alone", () => {
    expect(ORGANIZATION_ROLES.filter(r => holds(r, "financial"))).toEqual(["OWNER"]);
  });
});
