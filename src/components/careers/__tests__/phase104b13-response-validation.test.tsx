// @vitest-environment jsdom
/**
 * PHASE 104-B1.3 §2 — EXACT fail-closed runtime validation.
 *
 * Each case feeds the REAL components a 2xx whose body is wrong in exactly
 * one way, and proves the page reaches the outage surface rather than
 * phase="ready". The B1.2 partial checks passed most of these.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import de from "../../../../messages/de.json";
import { JobDetailClient } from "../JobDetailClient";
import { CareersBoardClient } from "../CareersBoardClient";
import { parsePublicJobDetail, parsePublicJobCard, parsePublicJobCards } from "../public-job-contract";

vi.mock("next/navigation", () => ({ usePathname: () => "/de/careers/job-1" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}));
import React from "react";

const D = (de as unknown as { careers: Record<string, string> }).careers;

const detail = () => ({
  id: "job-1",
  title: "SCADA-Architekt",
  shortSummary: "Kurzbeschreibung",
  description: "Beschreibung.",
  departmentLabel: "Automatisierungstechnik",
  responsibilities: ["Standards durchsetzen"],
  requirements: ["Erfahrung"],
  preferredExperience: ["OPC UA"],
  localizedSkills: { scada: "SCADA" },
  skillCodes: ["scada"],
  location: "Isfahan, Iran",
  locationType: null as unknown,
  salaryCurrency: null as unknown,
  salaryMin: null as unknown,
  salaryMax: null as unknown,
  publishedAt: "2026-08-01T00:00:00.000Z",
  closingDate: undefined as unknown,
});

const card = (over: Record<string, unknown> = {}) => ({
  id: "c1", title: "T", shortSummary: "s", department: "automation",
  departmentLabel: "Automatisierungstechnik", location: "Isfahan, Iran",
  addressLocality: "Isfahan", addressRegion: "Isfahan Province", addressCountry: "IR",
  locationType: null, skills: ["plc"], publishedAt: "2026-08-01T00:00:00.000Z",
  closingDate: undefined, ...over,
});

function stubFetch(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch);
}
const detailUi = () => (
  <NextIntlClientProvider locale="de" messages={de as never} timeZone="UTC">
    <JobDetailClient jobId="job-1" />
  </NextIntlClientProvider>
);
const boardUi = () => (
  <NextIntlClientProvider locale="de" messages={de as never} timeZone="UTC">
    <CareersBoardClient />
  </NextIntlClientProvider>
);
const settle = async (n = 3) => { for (let k = 0; k < n; k++) await new Promise((r) => setTimeout(r, 0)); };

afterEach(() => vi.unstubAllGlobals());

/* ── the validators, directly ───────────────────────────────────────────── */

describe("§2 — parsePublicJobDetail refuses every malformed field", () => {
  it("accepts the complete, well-typed contract", () => {
    expect(parsePublicJobDetail(detail())).not.toBeNull();
  });

  const CASES: [string, Record<string, unknown>][] = [
    ["missing location", { location: undefined }],
    ["non-string location", { location: 42 }],
    ["whitespace-only location", { location: "   " }],
    ["missing departmentLabel", { departmentLabel: undefined }],
    ["missing shortSummary", { shortSummary: undefined }],
    ["missing publishedAt", { publishedAt: undefined }],
    ["object inside responsibilities", { responsibilities: [{ text: "x" }] }],
    ["number inside responsibilities", { responsibilities: ["ok", 7] }],
    ["object inside skillCodes", { skillCodes: [{ code: "scada" }] }],
    ["non-string localizedSkills value", { localizedSkills: { scada: 5 } }],
    ["array as localizedSkills", { localizedSkills: ["scada"] }],
    ["string salaryMin", { salaryMin: "65000" }],
    ["fractional salaryMax", { salaryMax: 85000.5 }],
    ["NaN salaryMin", { salaryMin: Number.NaN }],
    ["Infinity salaryMax", { salaryMax: Number.POSITIVE_INFINITY }],
    ["number locationType", { locationType: 3 }],
    ["number closingDate", { closingDate: 20260901 }],
    ["responsibilities not an array", { responsibilities: "one, two" }],
  ];
  for (const [label, over] of CASES) {
    it(`refuses: ${label}`, () => {
      expect(parsePublicJobDetail({ ...detail(), ...over })).toBeNull();
    });
  }
});

describe("§2 — parsePublicJobCard(s) refuse every malformed field", () => {
  it("accepts a complete card and list", () => {
    expect(parsePublicJobCard(card())).not.toBeNull();
    expect(parsePublicJobCards({ jobs: [card(), card({ id: "c2" })] })).toHaveLength(2);
  });

  const CASES: [string, Record<string, unknown>][] = [
    ["missing location", { location: undefined }],
    ["missing department", { department: undefined }],
    ["missing departmentLabel", { departmentLabel: undefined }],
    ["missing shortSummary", { shortSummary: undefined }],
    ["missing publishedAt", { publishedAt: undefined }],
    ["number in skills", { skills: ["plc", 7] }],
    ["skills not an array", { skills: "plc" }],
    ["number addressCountry", { addressCountry: 98 }],
    ["undefined (not null) addressRegion", { addressRegion: undefined }],
  ];
  for (const [label, over] of CASES) {
    it(`refuses: ${label}`, () => {
      expect(parsePublicJobCard(card(over))).toBeNull();
    });
  }

  it("ONE malformed card invalidates the whole list — a partially-good list is not a list", () => {
    expect(parsePublicJobCards({ jobs: [card(), card({ id: "bad", location: 42 })] })).toBeNull();
  });

  it("a non-array jobs field is refused", () => {
    expect(parsePublicJobCards({ jobs: { 0: card() } })).toBeNull();
    expect(parsePublicJobCards({})).toBeNull();
  });
});

/* ── through the REAL components ────────────────────────────────────────── */

describe("§2 — a malformed 2xx never reaches phase=ready in the UI", () => {
  const UI_CASES: [string, Record<string, unknown>][] = [
    ["missing location", { location: undefined }],
    ["object inside responsibilities", { responsibilities: [{ t: "x" }] }],
    ["non-string localizedSkills value", { localizedSkills: { scada: 5 } }],
    ["string salaryMin", { salaryMin: "65000", salaryMax: 85000, salaryCurrency: "EUR" }],
    ["missing publishedAt", { publishedAt: undefined }],
  ];
  for (const [label, over] of UI_CASES) {
    it(`detail page: ${label} → outage surface, no title`, async () => {
      stubFetch({ job: { ...detail(), ...over }, source: "db" });
      const { container, unmount } = await mount(detailUi());
      await settle();
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
      expect(container.textContent).not.toContain("SCADA-Architekt");
      expect(container.textContent).not.toContain(D.jobUnavailable);
      await unmount();
    });
  }

  it("board: one malformed card → outage surface, never a partial list and never 'no results'", async () => {
    stubFetch({ jobs: [card({ id: "good" }), card({ id: "bad", department: undefined })], total: 2, source: "db" });
    const { container, unmount } = await mount(boardUi());
    await settle();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain(D.noResults);
    await unmount();
  });

  it("board: a well-formed list still renders (the gate is exact, not paranoid)", async () => {
    stubFetch({ jobs: [card({ id: "ok", title: "Gute Stelle" })], total: 1, source: "db" });
    const { container, unmount } = await mount(boardUi());
    await settle();
    expect(container.textContent).toContain("Gute Stelle");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await unmount();
  });
});
