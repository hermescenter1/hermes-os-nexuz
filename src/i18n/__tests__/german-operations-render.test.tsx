// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../messages/en.json";
import de from "../../../messages/de.json";
import { AssetCommandSurface } from "@/components/asset-maintenance/AssetCommandSurface";
import { EdmsCommandSurface } from "@/components/engineering-documents/EdmsCommandSurface";
import { AdministrationCommandSurface } from "@/components/organization-administration/AdministrationCommandSurface";
import { buildLimitRows } from "@/components/organization-administration/logic";
import type { AssetDashboard } from "@/lib/assets/types";
import type { EdmsDashboard, EdmsDocument } from "@/lib/document/types";
import type { MemberRecord, InvitationRecord } from "@/lib/org/types";
import type { SubscriptionRecord } from "@/lib/billing/types";

/**
 * PHASE 87L.6C — the translated command surfaces actually RENDER German
 * through next-intl (not just catalog assertions). Also proves no English
 * sentence leaks into a /de workspace page and no Persian contaminates it.
 *
 * These are the authenticated surfaces, so a real browser session is not
 * available; this jsdom render against the real de catalog is the honest
 * substitute and is reported as such.
 */

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/de/assets",
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    getTranslations: async (ns: string) =>
      actual.createTranslator({ locale: "de", messages: de as never, namespace: ns as never }),
  };
});

function withDe(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="de" messages={de as never} timeZone="Europe/Berlin">
      <div dir="ltr">{ui}</div>
    </NextIntlClientProvider>
  );
}

const ASSETS: AssetDashboard = {
  totalAssets: 40, criticalAssets: 3, degradedAssets: 2, atRiskAssets: 1,
  assetsWithOpenWO: 5, assetsMissingDocs: 2,
  assetsByType: {}, assetsByStatus: { IN_SERVICE: 30, DEGRADED: 2, UNDER_MAINTENANCE: 8 },
  assetsByCriticality: { CRITICAL: 3, HIGH: 7, LOW: 30 },
  lifecycleDistribution: {},
  recentLifecycleEvents: [{
    id: "e1", assetId: "a1", eventType: "STATE_CHANGE", fromState: "COMMISSIONING",
    toState: "IN_SERVICE", performedBy: null, notes: null, documents: [], metadata: {},
    occurredAt: "2026-07-01T00:00:00.000Z", createdAt: "2026-07-01T00:00:00.000Z",
  }],
  topCriticalAssets: [{
    id: "a1", assetNumber: "PMP-204", name: "Feed Pump P-204", siteId: "SITE-B",
    criticality: "CRITICAL", status: "DEGRADED",
  } as unknown as AssetDashboard["topCriticalAssets"][number]],
  healthDistribution: { healthy: 30, monitor: 5, atRisk: 3, critical: 1, unknown: 1 },
};

const EDMS: EdmsDashboard = {
  totalDocuments: 12, draftCount: 2, reviewCount: 3, approvedCount: 6,
  rejectedCount: 1, archivedCount: 0, pendingApprovals: 4, activeCheckouts: 2,
  recentDocuments: [{
    id: "d1", organizationId: null, folderId: null, categoryId: null, templateId: null,
    title: "P&ID — Speiseleitung", description: null, documentType: "PID", status: "APPROVED",
    currentRevision: "P01", language: "de", keywords: [], ownerId: "u1",
    erpProjectId: "PRJ-1", workOrderId: null, crmAccountId: null, vendorId: null,
    siteId: "SITE-B", equipmentId: "PMP-204", filePath: "/private/x.pdf",
    fileSize: 1, mimeType: "application/pdf", checksum: "sha256:x",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: null,
    createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-02T00:00:00.000Z",
  } as EdmsDocument],
  recentAudit: [{ id: "a1", action: "DOCUMENT_APPROVED", createdAt: "2026-07-03T00:00:00.000Z" } as unknown as EdmsDashboard["recentAudit"][number]],
  documentsByType: { PID: 4, MANUAL: 3 },
  documentsByStatus: { APPROVED: 6, DRAFT: 2, REVIEW: 3, REJECTED: 1 },
};

const member = (o: Partial<MemberRecord> = {}): MemberRecord => ({
  id: "m1", organizationId: "o1", userId: "u1", role: "MEMBER", status: "ACTIVE",
  departmentId: null, invitedById: null, joinedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...o,
});
const invitation = (o: Partial<InvitationRecord> = {}): InvitationRecord => ({
  id: "i1", organizationId: "o1", email: "a@b.de", role: "MEMBER", status: "PENDING",
  invitedById: null, expiresAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z", ...o,
});
const SUB: SubscriptionRecord = {
  id: "s1", organizationId: "o1", planId: "p1",
  plan: { id: "p1", name: "Professional", slug: "pro", description: "", monthlyPrice: "0",
    yearlyPrice: "0", currency: "EUR", features: [], limits: { members: 10 } as never, isActive: true },
  status: "PAST_DUE", billingCycle: "MONTHLY", startsAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z", autoRenew: true, createdAt: "2026-01-01T00:00:00.000Z",
};

/** English sentences that must never appear on a German workspace page. */
const ENGLISH_LEAK = /\b(Requires attention|Action needed|Next actions|Loading|Asset Registry|Work orders|Document register|Members on the organization|Not measured|Unlimited)\b/;

describe("German render — Asset Registry command surface", () => {
  it("renders German labels, no English sentence, no Persian", async () => {
    const el = await AssetCommandSurface({ data: ASSETS, locale: "de" });
    const { container, unmount } = await mount(withDe(el));
    const text = container.textContent ?? "";
    expect(text).toContain("Erfordert Aufmerksamkeit");
    expect(text).toContain("Anlagenregister");
    expect(text).toContain("In Betrieb");             // assetStatus.IN_SERVICE
    expect(text).toContain("In Instandhaltung");      // UNDER_MAINTENANCE
    expect(text).toContain("Kritisch");
    expect(text).not.toMatch(ENGLISH_LEAK);
    expect(text).not.toMatch(/[؀-ۿ]/);
    await unmount();
  });
});

describe("German render — EDMS command surface", () => {
  it("renders gelenkte-Dokumente terminology and keeps P&ID verbatim", async () => {
    const el = await EdmsCommandSurface({ dashboard: EDMS, locale: "de" });
    const { container, unmount } = await mount(withDe(el));
    const text = container.textContent ?? "";
    expect(text).toContain("Erfordert Aufmerksamkeit");
    expect(text).toContain("Freigegeben");            // status.APPROVED
    expect(text).toContain("P&ID");                   // docType preserved
    expect(text).toContain("Gelenktes Engineering-Dokument");
    expect(text).not.toMatch(ENGLISH_LEAK);
    expect(text).not.toMatch(/[؀-ۿ]/);
    // storage internals still never reach the DOM
    expect(container.innerHTML).not.toContain("/private/x.pdf");
    await unmount();
  });
});

describe("German render — Organization Administration command surface", () => {
  it("renders Abrechnung/Abonnement terminology and localized limits", async () => {
    const el = await AdministrationCommandSurface({
      members: [member(), member({ id: "m2", status: "SUSPENDED" })],
      invitations: [invitation()],
      subscription: SUB,
      limitRows: buildLimitRows({ members: 10, projects: -1 }, { members: 10 }, ["members", "projects"]),
      now: Date.parse("2026-07-18T00:00:00.000Z"),
      locale: "de",
    });
    const { container, unmount } = await mount(withDe(el));
    const text = container.textContent ?? "";
    expect(text).toContain("Erfordert Aufmerksamkeit");
    expect(text).toContain("Überfällig");             // subscriptionStatus.PAST_DUE
    expect(text).toContain("Gesperrt");               // memberStatus.SUSPENDED
    expect(text).toContain("Unbegrenzt");             // -1 limit
    expect(text).toContain("Nicht erfasst");          // unmeasured metric
    expect(text).not.toMatch(ENGLISH_LEAK);
    expect(text).not.toMatch(/[؀-ۿ]/);
    // member email still never rendered
    expect(container.innerHTML).not.toContain("a@b.de");
    await unmount();
  });
});

describe("German render — long-label safety on narrow layouts", () => {
  it("no rendered German chip label exceeds the mobile budget", async () => {
    const el = await AssetCommandSurface({ data: ASSETS, locale: "de" });
    const { container, unmount } = await mount(withDe(el));
    // badges are the tightest containers in these surfaces
    for (const badge of container.querySelectorAll("span.inline-flex")) {
      const label = (badge.textContent ?? "").trim();
      expect(label.length, `badge "${label}" too long for 320px`).toBeLessThanOrEqual(28);
    }
    await unmount();
  });
});

describe("German render — ICU plural/interpolation actually resolves", () => {
  it("count interpolation renders a German sentence with the number substituted", () => {
    const translate = (locale: "de" | "en", messages: unknown) =>
      createTranslator({
        locale,
        messages: messages as never,
        namespace: "assetMaintenance" as never,
      }) as unknown as (key: string, values?: Record<string, unknown>) => string;

    const s = translate("de", de)("attention.criticalAssets", { count: 3 });
    expect(s).toContain("3");
    expect(s).not.toContain("{count}");
    expect(s).toMatch(/Anlage/);
    expect(s).not.toBe(translate("en", en)("attention.criticalAssets", { count: 3 }));
  });
});
