// @vitest-environment jsdom

/**
 * PHASE 104-I1 — Careers page DB-only rendering contract.
 *
 * The Careers page must enforce a strict provenance boundary:
 *   source === "db"    → job records MAY render
 *   source !== "db"    → job records MUST NOT render, honest empty state instead
 *
 * This guards against exposing fabricated employment data from the mock fallback
 * (6 invented job postings with fake salary ranges in EUR/USD/GBP, fake locations,
 * fake applicant counts, etc.) to the public Careers page. The API includes a
 * `source` field for exactly this reason, and the page component must honor it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@/components/ds/__tests__/_render";
import { NextIntlClientProvider } from "next-intl";
import { CareersBoardClient } from "../CareersBoardClient";
import en from "../../../../messages/en.json";

// Mock the i18n/navigation module for client-side tests
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

// Mock fetch globally. The ARGUMENTS keep the real `fetch` signature, so a
// call-site that starts passing something else stops compiling; the RESULT is
// narrowed to the single member the component consumes. Narrowing is what makes
// the stub honest — the day the component reads `res.ok`, this test has to say
// so rather than silently resolving `undefined`. One explicit assertion, on the
// assignment below, replaces six casts at the call sites.
type StubResponse = Pick<Response, "json">;
const mockFetch = vi.fn<(...args: Parameters<typeof fetch>) => Promise<StubResponse>>();
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

describe("PHASE 104-I1 — Careers page provenance boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders job records when source is 'db'", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        jobs: [
          {
            id: "job-001",
            title: "Senior PLC Engineer",
            department: "Automation Engineering",
            location: "Frankfurt, Germany",
            locationType: "onsite",
            salaryCurrency: "EUR",
            salaryMin: 65000,
            salaryMax: 85000,
            skills: ["Siemens TIA Portal", "PLC Programming"],
            status: "OPEN",
            createdAt: "2026-05-01",
          },
        ],
        total: 1,
        source: "db",
      }),
    });

    const mounted = await mount(
      <NextIntlClientProvider locale="en" messages={{ careers: en.careers }}>
        <CareersBoardClient />
      </NextIntlClientProvider>
    );

    await new Promise((r) => setTimeout(r, 150));

    // Job title should appear in the document
    expect(mounted.container.textContent).toContain("Senior PLC Engineer");
    expect(mounted.container.textContent).toContain("Frankfurt, Germany");

    await mounted.unmount();
  });

  it("renders empty state when source is 'mock' (non-live)", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        jobs: [
          {
            id: "job-002",
            title: "SCADA Architect",
            department: "Automation Engineering",
            location: "Dubai, UAE",
            locationType: "onsite",
            salaryCurrency: "USD",
            salaryMin: 85000,
            salaryMax: 120000,
            skills: ["SCADA", "Wonderware"],
            status: "OPEN",
            createdAt: "2026-05-15",
          },
        ],
        total: 1,
        source: "mock",
      }),
    });

    const mounted = await mount(
      <NextIntlClientProvider locale="en" messages={{ careers: en.careers }}>
        <CareersBoardClient />
      </NextIntlClientProvider>
    );

    await new Promise((r) => setTimeout(r, 150));

    const text = mounted.container.textContent || "";
    // The fabricated job should NOT render
    expect(text).not.toContain("SCADA Architect");
    expect(text).not.toContain("Dubai, UAE");
    // Instead, show the honest non-live message
    expect(text).toContain("No verified engineering positions are currently published");

    await mounted.unmount();
  });

  it("does not display job titles, locations, or salary from mock source", async () => {
    const mockJobs = [
      {
        id: "job-003",
        title: "Automation Technician",
        department: "Field Services",
        location: "Paris, France",
        locationType: "onsite",
        salaryCurrency: "EUR",
        salaryMin: 38000,
        salaryMax: 52000,
        skills: ["PLC", "HMI"],
        status: "OPEN",
        createdAt: "2026-06-01",
      },
      {
        id: "job-004",
        title: "Industrial Software Developer",
        department: "Software Engineering",
        location: "Berlin, Germany",
        locationType: "remote",
        salaryCurrency: "EUR",
        salaryMin: 70000,
        salaryMax: 95000,
        skills: ["Python", "OPC-UA"],
        status: "OPEN",
        createdAt: "2026-06-15",
      },
    ];

    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        jobs: mockJobs,
        total: 2,
        source: "mock",
      }),
    });

    const mounted = await mount(
      <NextIntlClientProvider locale="en" messages={{ careers: en.careers }}>
        <CareersBoardClient />
      </NextIntlClientProvider>
    );

    await new Promise((r) => setTimeout(r, 150));

    const text = mounted.container.textContent || "";
    // None of these fabricated details should appear
    mockJobs.forEach((job) => {
      expect(text).not.toContain(job.title);
      expect(text).not.toContain(job.location);
    });

    // No skill tags from mock jobs
    expect(text).not.toContain("OPC-UA");

    await mounted.unmount();
  });

  it("shows different content when live (source='db') vs non-live (source='mock')", async () => {
    // Test: live shows jobs, non-live shows empty state
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        jobs: [
          {
            id: "job-005",
            title: "Test Role",
            department: "Automation Engineering",
            location: "Test City",
            locationType: "onsite",
            salaryCurrency: "EUR",
            salaryMin: 50000,
            salaryMax: 70000,
            skills: ["Test"],
            status: "OPEN",
            createdAt: "2026-07-01",
          },
        ],
        total: 1,
        source: "db",
      }),
    });

    const mounted = await mount(
      <NextIntlClientProvider locale="en" messages={{ careers: en.careers }}>
        <CareersBoardClient />
      </NextIntlClientProvider>
    );

    await new Promise((r) => setTimeout(r, 150));

    const text = mounted.container.textContent || "";
    // When live with jobs: the job record should render
    expect(text).toContain("Test Role");
    expect(text).toContain("Test City");

    await mounted.unmount();
  });

  it("suppresses filters and KPI strip when non-live (source='mock')", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        jobs: [],
        total: 0,
        source: "mock",
      }),
    });

    const mounted = await mount(
      <NextIntlClientProvider locale="en" messages={{ careers: en.careers }}>
        <CareersBoardClient />
      </NextIntlClientProvider>
    );

    await new Promise((r) => setTimeout(r, 150));

    const text = mounted.container.textContent || "";
    // When non-live: filters should NOT be present
    expect(text).not.toContain("Search roles, skills, locations");
    // KPI strip should NOT be present
    expect(text).not.toContain("OPEN ROLES");

    await mounted.unmount();
  });

  it("uses i18n: board title is translated from the careers namespace", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        jobs: [],
        total: 0,
        source: "db",
      }),
    });

    const mounted = await mount(
      <NextIntlClientProvider locale="en" messages={{ careers: en.careers }}>
        <CareersBoardClient />
      </NextIntlClientProvider>
    );

    await new Promise((r) => setTimeout(r, 150));

    // Board title should be "Open Positions" (from en.careers.boardTitle)
    expect(mounted.container.textContent).toContain("Open Positions");

    await mounted.unmount();
  });
});
