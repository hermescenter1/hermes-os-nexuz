/**
 * PHASE 110-A1.0b R2 (F5) — the organization overview page authorizes before it
 * reads anything.
 *
 * WHY THIS TEST EXISTS AND WHY IT COUNTS CALLS
 * The four sibling pages hand an `orgId` to CLIENT components, which fetch
 * through `/api/organizations/[orgId]/...`; those routes call `requireOrgActor`,
 * which enforces session revocation and `status === "ACTIVE"` and answers 403
 * otherwise. A suspended member therefore saw chrome, not data.
 *
 * This page is different. It calls `listMembers`, `listInvitations`,
 * `getSubscription` and `getUsageSummary` DIRECTLY, server-side. Those are
 * unguarded service functions — each takes an organization id and returns rows,
 * and `listMembers` returns every member's name and email. `<RequireCapability>`
 * cannot gate them, because it only decides what to render after the page body
 * has already run.
 *
 * So the assertion here is a COUNT: on every state but `resolved`, the number of
 * sensitive service calls must be zero. A test that only checked the rendered
 * output would pass while four queries ran and their results were thrown away.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  organizationId: string;
  role: string;
  status: string;
}

type Service = "members" | "invitations" | "subscription" | "usage";

interface Harness {
  user: { id: string; role: string } | null;
  capable: boolean;
  rows: Row[] | null;
  membershipThrows?: boolean;
  db: boolean;
  /** Sensitive domain reads, counted. */
  serviceCalls: number;
  /** Which of the four were actually called, by name. */
  called: Service[];
  /** Which of the four throw when called. */
  failing: Service[];
  /** The `sections` prop the page hands the command surface. */
  sections: Record<Service, string> | null;
}

let h: Harness;

function reset(over: Partial<Harness> = {}): void {
  h = {
    user: { id: "user_1", role: "admin" },
    capable: true,
    rows: [{ organizationId: "org_a", role: "OWNER", status: "ACTIVE" }],
    db: true,
    serviceCalls: 0,
    called: [],
    failing: [],
    sections: null,
    ...over,
  };
}

/** One counted, optionally failing, sensitive read. */
function service<T>(name: Service, value: T): () => Promise<T> {
  return async () => {
    h.serviceCalls += 1;
    h.called.push(name);
    if (h.failing.includes(name)) throw new Error("prisma: ECONNREFUSED 127.0.0.1:5432");
    return value;
  };
}

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/auth/roles", () => ({ can: () => h.capable }));
vi.mock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () =>
    h.db
      ? {
          organizationMember: {
            findMany: async () => {
              if (h.membershipThrows) throw new Error("store down");
              return h.rows;
            },
          },
          organization: {
            findUnique: async (a: { where: { id: string } }) => ({
              id: a.where.id,
              slug: `slug-${a.where.id}`,
            }),
          },
        }
      : null,
}));

/* The four sensitive reads, counted rather than executed. */
vi.mock("@/lib/org/members", () => ({ listMembers: () => service("members", [])() }));
vi.mock("@/lib/org/invitations", () => ({ listInvitations: () => service("invitations", [])() }));
vi.mock("@/lib/billing/subscriptions", () => ({
  getSubscription: () => service("subscription", null)(),
}));
vi.mock("@/lib/billing/usage", () => ({ getUsageSummary: () => service("usage", {})() }));

/*
 * PHASE 110-A1.0b R3 (R3-3) — the command surface is stubbed, and its PROPS are
 * what this file inspects.
 *
 * The page hands it a per-section outcome. Reading that prop off the returned
 * element tree is how this file checks the PAGE's half of the contract — which
 * reads were permitted and which failed — while
 * `organization-administration/__tests__/section-states.test.tsx` renders the
 * real component and checks that each outcome becomes a different sentence.
 * Neither test alone would prove the chain, and the page test cannot render:
 * `AppShell` is stubbed to `null` here precisely so no presentation runs.
 */
vi.mock("@/components/organization-administration", () => ({
  AdministrationCommandSurface: () => null,
  buildLimitRows: () => [],
}));

/* next-intl's server helpers, reduced to identity so the body can run. */
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (k: string) => k,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k, useLocale: () => "en" }));

/*
 * `@/i18n/navigation` cannot be imported under vitest at all — next-intl's
 * client navigation factory resolves `next/navigation` in a way this runner
 * rejects. It is stubbed rather than worked around, because this test is about
 * the ORDER of authorization and reads, and nothing here navigates.
 */
vi.mock("@/i18n/navigation", () => ({
  Link: () => null,
  redirect: () => undefined,
  usePathname: () => "/",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  getPathname: () => "/",
}));

/* The shell and the heavy presentation components are not under test here. */
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/components/auth/RequireCapability", () => ({ RequireCapability: () => null }));

const OrgPage = (await import("../page")).default;
const { getOrgPageContext } = await import("../org-page-context");

const params = Promise.resolve({ locale: "en" });

/**
 * Find the `sections` prop the page handed the command surface.
 *
 * A React element is a plain object, so the tree the page RETURNS can be read
 * without rendering anything — which is the point: this file must observe the
 * page's decisions, not a presentation layer's interpretation of them.
 */
function sectionsOf(node: unknown): Record<Service, string> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = sectionsOf(child);
      if (found) return found;
    }
    return null;
  }
  const el = node as { props?: Record<string, unknown> };
  if (el.props && typeof el.props === "object") {
    if (el.props.sections && typeof el.props.sections === "object") {
      return el.props.sections as Record<Service, string>;
    }
    return sectionsOf(el.props.children);
  }
  return null;
}

beforeEach(() => reset());

describe("no sensitive read happens before authorization", () => {
  it("an unauthenticated caller causes zero service calls", async () => {
    reset({ user: null });
    await OrgPage({ params });
    expect(h.serviceCalls).toBe(0);
  });

  it("an ACTIVE member WITHOUT the capability causes zero service calls", async () => {
    /*
     * The case Codex asked for explicitly. This reader has a perfectly good
     * ACTIVE membership — the context resolves — and still may not see this
     * surface. Before R2 the capability was only a JSX wrapper, so all four
     * reads had already run by the time it decided to render an access notice.
     */
    reset({ capable: false });
    await OrgPage({ params });
    expect(h.serviceCalls, "capability must precede the reads").toBe(0);
  });

  it("a SUSPENDED-only or INVITED-only member causes zero service calls", async () => {
    for (const status of ["SUSPENDED", "INVITED"]) {
      reset({ rows: [{ organizationId: "org_a", role: "OWNER", status }] });
      await OrgPage({ params });
      expect(h.serviceCalls, `${status} must read nothing`).toBe(0);
    }
  });

  it("several memberships with no selection cause zero service calls", async () => {
    reset({
      rows: [
        { organizationId: "org_a", role: "OWNER", status: "ACTIVE" },
        { organizationId: "org_b", role: "MEMBER", status: "ACTIVE" },
      ],
    });
    await OrgPage({ params });
    expect(h.serviceCalls).toBe(0);
  });

  it("an outage causes zero service calls and is not a zero-member success", async () => {
    reset({ membershipThrows: true });
    await OrgPage({ params });
    expect(h.serviceCalls).toBe(0);

    reset({ db: false });
    await OrgPage({ params });
    expect(h.serviceCalls).toBe(0);
  });

  it("an authorized reader with one ACTIVE membership reads exactly four times", async () => {
    reset();
    await OrgPage({ params });
    expect(h.serviceCalls, "the happy path must still load the page").toBe(4);
  });
});

describe("R3-3 — each read is gated by the permission ITS OWN API enforces", () => {
  /*
   * The platform capability and the organization role are unrelated axes. R2
   * gated this page on the platform capability alone, so a reader who is an
   * ACTIVE VIEWER of the organization — and a platform admin, which staff
   * accounts are — read here what three APIs would answer 403 for.
   *
   * The policies below are read off the routes, not invented:
   *   members       requireOrgActor only
   *   invitations   invite_member   OWNER / ADMIN / MANAGER
   *   subscription  view_billing    OWNER / ADMIN / BILLING_ADMIN
   *   usage         view_billing    OWNER / ADMIN / BILLING_ADMIN
   */
  const asRole = (role: string) =>
    reset({ rows: [{ organizationId: "org_a", role, status: "ACTIVE" }] });

  it("an OWNER reads all four", async () => {
    asRole("OWNER");
    const tree = await OrgPage({ params });
    expect(h.called.sort()).toEqual(["invitations", "members", "subscription", "usage"]);
    expect(sectionsOf(tree)).toEqual({
      members: "ok", invitations: "ok", subscription: "ok", usage: "ok",
    });
  });

  it("a VIEWER reads members only — the other three are never called", async () => {
    asRole("VIEWER");
    const tree = await OrgPage({ params });

    expect(h.called, "the invitation roster and the billing record are refused").toEqual([
      "members",
    ]);
    expect(sectionsOf(tree)).toEqual({
      members: "ok",
      invitations: "forbidden",
      subscription: "forbidden",
      usage: "forbidden",
    });
  });

  it("an ENGINEER is refused billing and the invitation roster", async () => {
    asRole("ENGINEER");
    const tree = await OrgPage({ params });
    expect(h.called).toEqual(["members"]);
    expect(sectionsOf(tree)?.subscription).toBe("forbidden");
  });

  it("a MANAGER may see invitations but not billing", async () => {
    asRole("MANAGER");
    const tree = await OrgPage({ params });
    expect(h.called.sort()).toEqual(["invitations", "members"]);
    expect(sectionsOf(tree)).toEqual({
      members: "ok",
      invitations: "ok",
      subscription: "forbidden",
      usage: "forbidden",
    });
  });

  it("a BILLING_ADMIN may see billing but not the invitation roster", async () => {
    asRole("BILLING_ADMIN");
    const tree = await OrgPage({ params });
    expect(h.called.sort()).toEqual(["members", "subscription", "usage"]);
    expect(sectionsOf(tree)).toEqual({
      members: "ok",
      invitations: "forbidden",
      subscription: "ok",
      usage: "ok",
    });
  });

  it("a role the matrix does not list is denied everything but members", async () => {
    asRole("STUDENT");
    const tree = await OrgPage({ params });
    expect(h.called).toEqual(["members"]);
    expect(sectionsOf(tree)?.invitations).toBe("forbidden");
  });
});

describe("R3-3 — a failed read is unavailable, never an empty success", () => {
  const owner = () => reset({ rows: [{ organizationId: "org_a", role: "OWNER", status: "ACTIVE" }] });

  for (const failing of ["members", "invitations", "subscription", "usage"] as const) {
    it(`${failing} failing marks only ${failing} unavailable`, async () => {
      owner();
      h.failing = [failing];
      const tree = await OrgPage({ params });
      const sections = sectionsOf(tree);

      expect(sections?.[failing]).toBe("unavailable");
      for (const other of (["members", "invitations", "subscription", "usage"] as const).filter(
        (s) => s !== failing,
      )) {
        expect(sections?.[other], `${other} still resolved`).toBe("ok");
      }
    });
  }

  it("all four failing does not crash the page and marks all four unavailable", async () => {
    owner();
    h.failing = ["members", "invitations", "subscription", "usage"];
    const tree = await OrgPage({ params });

    expect(sectionsOf(tree)).toEqual({
      members: "unavailable",
      invitations: "unavailable",
      subscription: "unavailable",
      usage: "unavailable",
    });
  });

  it("the driver message never reaches the tree", async () => {
    owner();
    h.failing = ["members", "subscription"];
    const tree = await OrgPage({ params });
    const serialized = JSON.stringify(tree, (_k, v) =>
      typeof v === "function" || typeof v === "symbol" ? undefined : v,
    );
    expect(serialized).not.toContain("ECONNREFUSED");
    expect(serialized).not.toContain("5432");
    expect(serialized).not.toContain("prisma");
  });

  it("a retry after a failure makes a REAL request and recovers", async () => {
    owner();
    h.failing = ["subscription"];
    expect(sectionsOf(await OrgPage({ params }))?.subscription).toBe("unavailable");
    const afterFirst = h.called.length;

    // The store comes back. A fresh render must call again — not reuse the
    // failure, and not reuse a cached empty.
    h.failing = [];
    const tree = await OrgPage({ params });
    expect(h.called.length, "the retry must actually re-read").toBeGreaterThan(afterFirst);
    expect(sectionsOf(tree)?.subscription).toBe("ok");
  });
});

describe("the context helper distinguishes every refusal", () => {
  it("reports forbidden separately from every context state", async () => {
    reset({ capable: false });
    await expect(getOrgPageContext("org_admin")).resolves.toEqual({ state: "forbidden" });
  });

  it("reports the four context states unchanged", async () => {
    reset({ user: null });
    await expect(getOrgPageContext("org_admin")).resolves.toEqual({ state: "unauthenticated" });

    reset({ rows: [] });
    await expect(getOrgPageContext("org_admin")).resolves.toEqual({ state: "none" });

    reset({
      rows: [
        { organizationId: "org_a", role: "OWNER", status: "ACTIVE" },
        { organizationId: "org_b", role: "MEMBER", status: "ACTIVE" },
      ],
    });
    await expect(getOrgPageContext("org_admin")).resolves.toEqual({ state: "selection" });

    reset({ membershipThrows: true });
    await expect(getOrgPageContext("org_admin")).resolves.toEqual({ state: "unavailable" });
  });

  it("every non-resolved state has its own message key", async () => {
    const { ORG_PAGE_STATE_KEY } = await import("../org-page-context");
    const keys = Object.values(ORG_PAGE_STATE_KEY);
    expect(new Set(keys).size, "no two states may share a sentence").toBe(keys.length);
    expect(keys).toContain("noOrg");
    expect(keys).toContain("stateForbidden");
  });
});
