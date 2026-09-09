// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import { AdministrationCommandSurface, type AdminSectionStatus } from "../AdministrationCommandSurface";
import { buildLimitRows } from "../logic";
import type { MemberRecord, InvitationRecord } from "@/lib/org/types";
import type { SubscriptionRecord } from "@/lib/billing/types";

/**
 * PHASE 110-A1.0b R3 (R3-3) — a failed read must not render as an empty
 * success, and a refused one must not render as either.
 *
 * WHY THIS IS A RENDER TEST AND NOT A SOURCE ASSERTION
 * The defect was never in the shape of the code; it was in the SENTENCE the
 * reader ends up looking at. `listMembers` throwing and the organization
 * genuinely having no members both produced "No members on this organization
 * yet." Only a rendered assertion can tell those apart, so these cases render
 * the real component through the real English catalogue and read the text.
 *
 * The three outcomes must be three different sentences:
 *
 *   ok + empty    "No members on this organization yet."   — a fact
 *   unavailable   "…could not be loaded. It is unavailable, not empty."
 *   forbidden     "Your role … does not include access to this information."
 */

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/en/dashboard/organization",
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    getTranslations: async (ns: string) =>
      actual.createTranslator({ locale: "en", messages: en as never, namespace: ns as never }),
  };
});

function withEn(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
      <div dir="ltr">{ui}</div>
    </NextIntlClientProvider>
  );
}

const member = (over: Partial<MemberRecord> = {}): MemberRecord =>
  ({
    id: "m1", userId: "u1", organizationId: "org_a", role: "MEMBER", status: "ACTIVE",
    joinedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z",
    user: { id: "u1", name: "Ada", email: "ada@example.test" },
    ...over,
  }) as MemberRecord;

const invitation = (over: Partial<InvitationRecord> = {}): InvitationRecord =>
  ({
    id: "i1", organizationId: "org_a", email: "invitee@example.test", role: "MEMBER",
    status: "PENDING", expiresAt: "2027-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  }) as InvitationRecord;

const SUB = {
  id: "s1", organizationId: "org_a", status: "ACTIVE", billingCycle: "MONTHLY",
  plan: { id: "p1", name: "Scale", limits: { members: 10, projects: -1 } },
  startsAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z",
  autoRenew: true, createdAt: "2026-01-01T00:00:00.000Z",
} as unknown as SubscriptionRecord;

type Sections = NonNullable<
  Parameters<typeof AdministrationCommandSurface>[0]["sections"]
>;

const ALL_OK: Sections = {
  members: "ok", invitations: "ok", subscription: "ok", usage: "ok",
};

/** The sentences that must never describe a failed or refused read. */
const EMPTY_SUCCESS = {
  members: en.orgAdministration.states.noMembers,
  invitations: en.orgAdministration.states.noInvitations,
  subscription: en.orgAdministration.states.noSubscription,
  usage: en.orgAdministration.states.noUsage,
};
const UNAVAILABLE = en.orgAdministration.states.sectionUnavailable;
const FORBIDDEN = en.orgAdministration.states.sectionForbidden;
const INCOMPLETE = en.orgAdministration.states.summaryIncomplete;

async function render(
  sections: Partial<Record<keyof Sections, AdminSectionStatus>> = {},
  over: {
    members?: MemberRecord[];
    invitations?: InvitationRecord[];
    subscription?: SubscriptionRecord | null;
  } = {},
) {
  const state = { ...ALL_OK, ...sections };
  const resolved = "members" in over ? over.members! : [member()];
  const el = await AdministrationCommandSurface({
    members: state.members === "ok" ? resolved : [],
    invitations: state.invitations === "ok" ? (over.invitations ?? [invitation()]) : [],
    subscription:
      state.subscription === "ok" ? ("subscription" in over ? over.subscription! : SUB) : null,
    limitRows:
      state.subscription === "ok" && state.usage === "ok"
        ? buildLimitRows({ members: 10, projects: -1 }, { members: 4 }, ["members", "projects"])
        : [],
    sections: state,
    now: Date.parse("2026-07-18T00:00:00.000Z"),
    locale: "en",
  });
  return mount(withEn(el));
}

describe("R3-3 — a failed section is not an empty section", () => {
  it("all four resolved: the ordinary surface, unchanged", async () => {
    const { container, unmount } = await render();
    const text = container.textContent ?? "";
    expect(text).not.toContain(UNAVAILABLE);
    expect(text).not.toContain(FORBIDDEN);
    expect(text).not.toContain(INCOMPLETE);
    expect(container.querySelector('[data-admin-section="members"]')).not.toBeNull();
    await unmount();
  });

  it("a genuinely empty organization still says so", async () => {
    const { container, unmount } = await render({}, { members: [], invitations: [] });
    const text = container.textContent ?? "";
    expect(text, "empty is a real answer when the read succeeded").toContain(
      EMPTY_SUCCESS.members,
    );
    expect(text).not.toContain(UNAVAILABLE);
    await unmount();
  });

  for (const section of ["members", "invitations", "subscription", "usage"] as const) {
    it(`${section} failing alone reads as unavailable, and the others still render`, async () => {
      const { container, unmount } = await render({ [section]: "unavailable" });
      const text = container.textContent ?? "";

      expect(text, "the failure must be stated").toContain(UNAVAILABLE);
      expect(
        text,
        `a failed ${section} read must never render as "${EMPTY_SUCCESS[section]}"`,
      ).not.toContain(EMPTY_SUCCESS[section]);
      expect(text, "an incomplete summary must say it is incomplete").toContain(INCOMPLETE);

      const node = container.querySelector(`[data-admin-section="${section}"]`);
      expect(node?.getAttribute("data-admin-section-status")).toBe("unavailable");

      // A partial dashboard: every other section kept its own outcome.
      for (const other of (["members", "invitations", "subscription", "usage"] as const).filter(
        (s) => s !== section,
      )) {
        expect(
          container
            .querySelector(`[data-admin-section="${other}"]`)
            ?.getAttribute("data-admin-section-status"),
          `${other} must be unaffected by a failure in ${section}`,
        ).toBe("ok");
      }

      /*
       * Usage is the one section with a second input. Its limits come from the
       * subscription, so when the SUBSCRIPTION read failed the usage panel must
       * borrow that refusal rather than draw an empty table — "no usage
       * recorded" would be a claim built from a plan nobody could read.
       */
      if (section === "subscription") {
        const usagePanel = container.querySelector('[data-admin-section="usage"]');
        expect(usagePanel?.textContent).toContain(UNAVAILABLE);
        expect(usagePanel?.textContent).not.toContain(EMPTY_SUCCESS.usage);
      }
      await unmount();
    });

    it(`${section} refused reads as forbidden, not as empty and not as failed`, async () => {
      const { container, unmount } = await render({ [section]: "forbidden" });
      const text = container.textContent ?? "";

      expect(text).toContain(FORBIDDEN);
      expect(text).not.toContain(UNAVAILABLE);
      expect(
        text,
        `a refused ${section} read must never render as "${EMPTY_SUCCESS[section]}"`,
      ).not.toContain(EMPTY_SUCCESS[section]);
      await unmount();
    });
  }

  it("all four failing renders four refusals and no empty-success sentence", async () => {
    const { container, unmount } = await render({
      members: "unavailable",
      invitations: "unavailable",
      subscription: "unavailable",
      usage: "unavailable",
    });
    const text = container.textContent ?? "";

    for (const sentence of Object.values(EMPTY_SUCCESS)) {
      expect(text, `"${sentence}" is a claim nobody can make here`).not.toContain(sentence);
    }
    expect(text).toContain(INCOMPLETE);
    await unmount();
  });

  it("the refusal text never carries a driver, host or query detail", async () => {
    const { container, unmount } = await render({
      members: "unavailable",
      subscription: "unavailable",
    });
    const html = container.innerHTML;
    for (const leak of ["prisma", "Prisma", "ECONNREFUSED", "postgres", "5432", "SELECT", "stack"]) {
      expect(html, `"${leak}" must not reach an administration surface`).not.toContain(leak);
    }
    await unmount();
  });

  it("a member email is still never rendered, in any section state", async () => {
    const { container, unmount } = await render({ invitations: "unavailable" });
    expect(container.innerHTML).not.toContain("ada@example.test");
    expect(container.innerHTML).not.toContain("invitee@example.test");
    await unmount();
  });

  it("attention is not derived from a section that did not resolve", async () => {
    /*
     * The subscription here is PAST_DUE, which `deriveAdminAttention` turns
     * into an attention item. With the subscription read marked unavailable the
     * item must NOT appear — and, just as importantly, the panel must not read
     * as a calm "nothing needs attention", which is why the incomplete notice
     * is asserted alongside it.
     */
    const pastDue = { ...(SUB as object), status: "PAST_DUE" } as unknown as SubscriptionRecord;

    const ok = await render({}, { subscription: pastDue });
    const okText = ok.container.textContent ?? "";
    await ok.unmount();

    const failed = await render({ subscription: "unavailable" }, { subscription: pastDue });
    const failedText = failed.container.textContent ?? "";
    expect(failedText).toContain(INCOMPLETE);
    expect(failedText).toContain(UNAVAILABLE);
    await failed.unmount();

    // The two renders must not read the same; the second knows strictly less.
    expect(failedText).not.toBe(okText);
  });
});
