// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import { visibleAppNavGroups } from "@/lib/navigation/app-nav";
import { isAuthorizedForPath } from "@/lib/auth/rbac";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { EdmsCommandSurface } from "../EdmsCommandSurface";
import { EdmsSubNav } from "../EdmsSubNav";
import type { EdmsDashboard, EdmsDocument } from "@/lib/document/types";

/**
 * PHASE 87J runtime — the EDMS command surface renders real dashboard data
 * into the document-control IA, EN+FA, with localized document/approval
 * statuses, bidi-safe document numbers and revision codes, an unconditional
 * demo-source label, no fabricated compliance metrics and no raw errors.
 */

const h = vi.hoisted(() => ({ pathname: "/documents" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    getTranslations: async (ns: string) => {
      const locale = (globalThis as { __edmsLocale?: "en" | "fa" }).__edmsLocale ?? "en";
      const messages = locale === "en" ? en : fa;
      return actual.createTranslator({ locale, messages, namespace: ns as never });
    },
  };
});

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function doc(over: Partial<EdmsDocument> = {}): EdmsDocument {
  return {
    id: "d1", organizationId: null, folderId: null, categoryId: null, templateId: null,
    title: "P&ID — Feed Line", description: null, documentType: "PID", status: "APPROVED",
    currentRevision: "P01", language: "en", keywords: [], ownerId: "u1",
    erpProjectId: "PRJ-1", workOrderId: null, crmAccountId: null, vendorId: null,
    siteId: "SITE-B", equipmentId: "PMP-204", filePath: "/private/storage/key/abc.pdf",
    fileSize: 1024, mimeType: "application/pdf", checksum: "sha256:deadbeef",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: null,
    createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-02T00:00:00.000Z",
    ...over,
  };
}

function DASH(over: Partial<EdmsDashboard> = {}): EdmsDashboard {
  return {
    totalDocuments: 12, draftCount: 2, reviewCount: 3, approvedCount: 6,
    rejectedCount: 1, archivedCount: 0, pendingApprovals: 4, activeCheckouts: 2,
    recentDocuments: [doc(), doc({ id: "d2", title: "Pump manual", documentType: "MANUAL", status: "REVIEW", currentRevision: null, erpProjectId: null, siteId: null, equipmentId: null })],
    recentAudit: [{ id: "a1", action: "DOCUMENT_APPROVED", createdAt: "2026-07-03T00:00:00.000Z" } as unknown as EdmsDashboard["recentAudit"][number]],
    documentsByType: { PID: 4, MANUAL: 3, OTHER: 5 },
    documentsByStatus: { APPROVED: 6, DRAFT: 2, REVIEW: 3, REJECTED: 1 },
    ...over,
  };
}

async function mountSurface(locale: "en" | "fa", dashboard: EdmsDashboard) {
  (globalThis as { __edmsLocale?: "en" | "fa" }).__edmsLocale = locale;
  const el = await EdmsCommandSurface({ dashboard, locale });
  return mount(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fa} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{el}</div> : el}
    </NextIntlClientProvider>,
  );
}

describe("catalog + navigation + product-boundary invariants", () => {
  it("engineeringDocuments: en/fa/de parity, de = en verbatim, no Arabic yeh/kaf, ICU parity", () => {
    const paths = (o: Record<string, unknown>, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? paths(v as Record<string, unknown>, `${p}.${k}`) : [`${p}.${k}`]));
    const e = paths(en.engineeringDocuments as unknown as Record<string, unknown>);
    expect(paths((fa as unknown as typeof en).engineeringDocuments as unknown as Record<string, unknown>)).toEqual(e);
    expect(JSON.stringify((de as unknown as typeof en).engineeringDocuments)).toBe(JSON.stringify(en.engineeringDocuments));
    expect(JSON.stringify((fa as unknown as typeof en).engineeringDocuments)).not.toMatch(/[يك]/);
    for (const p of e) {
      const get = (o: unknown) => p.split(".").slice(1).reduce((x: unknown, k) => (x as Record<string, unknown>)[k], o);
      const args = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort().join(",");
      expect(args(String(get((fa as unknown as typeof en).engineeringDocuments)))).toBe(args(String(get(en.engineeringDocuments))));
    }
  });

  it("EDMS is discoverable for authorized roles only, and stays distinct from Asset Registry / CMMS / Knowledge", () => {
    for (const role of ["admin", "superadmin"] as const) {
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      expect(hrefs).toContain("/documents");
      // distinct sibling products, never merged into EDMS
      expect(hrefs).toContain("/assets");
      expect(hrefs).toContain("/cmms");
      expect(hrefs).toContain("/library"); // public knowledge stays separate
    }
    for (const role of ["engineer", "customer", "candidate", "viewer"] as const) {
      expect(visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href))).not.toContain("/documents");
    }
    // middleware policy itself untouched (known 87C layout/middleware mismatch)
    expect(isAuthorizedForPath("engineer", "/en/documents")).toBe(true);
  });

  it("the landing sits on the AppShell, keeps the admin gate, and never imports sibling-module data", () => {
    const layout = read("src/app/[locale]/documents/layout.tsx");
    expect(layout).toContain("AppShell");
    expect(layout).toContain("EdmsSubNav");
    expect(layout).toContain('capability="admin"');
    expect(layout).not.toMatch(/<aside/);
    for (const rel of [
      "src/components/engineering-documents/EdmsCommandSurface.tsx",
      "src/components/engineering-documents/logic.ts",
    ]) {
      const src = read(rel);
      expect(src).not.toContain("@/lib/cmms/");
      expect(src).not.toContain("@/lib/assets/");
      expect(src).not.toContain("@/lib/erp/");
    }
  });

  it("the demo-source label is UNCONDITIONAL because the service has no implemented Prisma path", () => {
    const service = read("src/lib/document/service.ts");
    expect(service).toMatch(/Prisma path — not implemented fully/);
    const page = read("src/app/[locale]/documents/page.tsx");
    // rendered without a conditional — never claims a database source
    expect(page).toMatch(/status=\{<PageStatusBadge label=\{ed\("header\.demoBadge"\)/);
    expect(page).not.toMatch(/demoData \?/);
    // the h1 now comes from the existing catalog key, not a hardcoded literal
    expect(page).toContain('t("dashboard.title")');
    expect(page).not.toContain('"EDMS — Document Management"</h1>');
  });
});

describe("EdmsCommandSurface — EN, real dashboard wiring", () => {
  it("renders the document-control IA in order with localized statuses and bidi-safe identifiers", async () => {
    const { container, unmount } = await mountSurface("en", DASH());
    const h2s = Array.from(container.querySelectorAll("h2")).map((x) => x.textContent);
    expect(h2s).toEqual([
      en.engineeringDocuments.attention.title,
      en.engineeringDocuments.sections.workflow,
      en.engineeringDocuments.sections.register,
      en.engineeringDocuments.sections.activity,
      en.engineeringDocuments.sections.actions,
    ]);
    expect(container.querySelectorAll("h1").length).toBe(0); // page owns the H1

    // attention counts come straight from the dashboard fields
    const attention = container.querySelector('section[aria-labelledby="edms-attention-title"]')!;
    expect(attention.textContent).toContain("4 approval(s) awaiting a decision");
    expect(attention.textContent).toContain("3 document(s) in review");
    expect(attention.textContent).toContain("1 document(s) returned for correction");
    // one recentDocuments entry has no currentRevision
    expect(attention.textContent).toContain("1 document(s) without a current revision");
    // NO overdue claim anywhere
    expect(container.textContent).not.toMatch(/overdue/i);

    // localized document statuses; raw enums never rendered
    expect(container.textContent).toContain(en.engineeringDocuments.status.REVIEW);
    expect(container.textContent).toContain(en.engineeringDocuments.status.REJECTED);
    expect(container.textContent).not.toMatch(/\bDRAFT\b|\bREVIEW\b|\bOBSOLETE\b|ENGINEERING_DRAWING|VENDOR_DATASHEET/);

    // revision code + linked identifiers are LTR-isolated and unmodified
    const bdis = Array.from(container.querySelectorAll('bdi[dir="ltr"]')).map((b) => b.textContent);
    expect(bdis).toContain("P01");   // exact casing/punctuation preserved
    expect(bdis).toContain("PRJ-1");
    expect(bdis).toContain("SITE-B");
    expect(bdis).toContain("PMP-204");
    // a document with no revision says so explicitly instead of implying one
    expect(container.textContent).toContain(en.engineeringDocuments.fields.noRevision);
    expect(container.textContent).toContain(en.engineeringDocuments.fields.noLinkedContext);

    // controlled-document distinction is stated
    expect(container.textContent).toContain(en.engineeringDocuments.distinction.controlled);

    // NO storage internals leak into the DOM
    expect(container.innerHTML).not.toContain("/private/storage/key");
    expect(container.innerHTML).not.toContain("sha256:deadbeef");

    // no fabricated compliance/quality metrics
    expect(container.textContent).not.toMatch(/compliance rate|audit readiness|quality score|% compliant/i);

    // actions target real EDMS routes
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    for (const href of ["/documents/explorer", "/documents/approvals", "/documents/revisions", "/documents/search"]) {
      expect(hrefs).toContain(href);
    }
    await unmount();
  });

  it("empty register → localized empty states, register section omitted, no fabricated rows", async () => {
    const { container, unmount } = await mountSurface("en", DASH({
      totalDocuments: 0, reviewCount: 0, rejectedCount: 0, pendingApprovals: 0, activeCheckouts: 0,
      recentDocuments: [], recentAudit: [], documentsByStatus: {}, documentsByType: {},
    }));
    expect(container.textContent).toContain(en.engineeringDocuments.attention.empty);
    expect(container.textContent).toContain(en.engineeringDocuments.states.emptyRegister);
    expect(container.textContent).toContain(en.engineeringDocuments.states.noActivity);
    expect(container.querySelector('section[aria-labelledby="edms-register-title"]')).toBeNull();
    // three DIFFERENT empty messages, not one generic "No data"
    expect(new Set([
      en.engineeringDocuments.attention.empty,
      en.engineeringDocuments.states.emptyRegister,
      en.engineeringDocuments.states.noActivity,
    ]).size).toBe(3);
    await unmount();
  });

  it("Persian: localized sections/statuses, identifiers still LTR, no hardcoded English, no raw errors", async () => {
    const { container, unmount } = await mountSurface("fa", DASH());
    expect(container.textContent).toContain(fa.engineeringDocuments.attention.title);        // «نیازمند توجه»
    expect(container.textContent).toContain(fa.engineeringDocuments.sections.workflow);      // «گردش کار سند»
    expect(container.textContent).toContain(fa.engineeringDocuments.status.REJECTED);        // «بازگشته برای اصلاح»
    expect(container.textContent).toContain(fa.engineeringDocuments.fields.noRevision);
    expect(container.textContent).not.toMatch(/Requires attention|Document workflow|In review/);
    expect(Array.from(container.querySelectorAll('bdi[dir="ltr"]')).map((b) => b.textContent)).toContain("P01");
    expect(container.textContent).not.toMatch(/Error:|stack|ECONNREFUSED|prisma/i);
    await unmount();
  });
});

describe("EdmsSubNav — localized from the existing catalog, locale-safe", () => {
  it("renders the twelve EDMS sections with aria-current and ≥44px targets", async () => {
    h.pathname = "/documents";
    const { container, unmount } = await mount(
      <NextIntlClientProvider locale="fa" messages={fa} timeZone="UTC">
        <EdmsSubNav ariaLabel={(fa as unknown as typeof en).engineeringDocuments.header.eyebrow} />
      </NextIntlClientProvider>,
    );
    const links = Array.from(container.querySelectorAll("a"));
    expect(links.length).toBe(12);
    expect(links.every((a) => (a.getAttribute("href") ?? "").startsWith("/documents"))).toBe(true);
    expect(links.every((a) => !/\/(en|fa)\/(en|fa)\//.test(a.getAttribute("href") ?? ""))).toBe(true);
    expect(links.every((a) => a.className.includes("h-11"))).toBe(true);
    expect(links[0].getAttribute("aria-current")).toBe("page");
    // labels come from the existing documents.nav catalog (real Persian, no isFa ternary)
    expect(container.textContent).toContain((fa as unknown as typeof en).documents.nav.approvals); // «تأییدیه‌ها»
    expect(container.textContent).toContain((fa as unknown as typeof en).documents.nav.revisions);
    await unmount();
  });

  it("the register root does not stay active on child routes (prefix match is scoped)", async () => {
    h.pathname = "/documents/approvals";
    const { container, unmount } = await mount(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <EdmsSubNav ariaLabel={en.engineeringDocuments.header.eyebrow} />
      </NextIntlClientProvider>,
    );
    const active = Array.from(container.querySelectorAll('a[aria-current="page"]'));
    expect(active.length).toBe(1);
    expect(active[0].getAttribute("href")).toBe("/documents/approvals");
    await unmount();
  });
});
