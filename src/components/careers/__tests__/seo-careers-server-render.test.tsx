/**
 * SEO remediation — the careers board and the job detail must put their real
 * content in the SERVER-rendered HTML (what a non-JavaScript crawler reads),
 * not a "loading" placeholder. `renderToString` never runs effects, so what it
 * returns is exactly the crawlable document.
 */
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { CareersBoardClient } from "../CareersBoardClient";
import { JobDetailClient } from "../JobDetailClient";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/careers" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}));

const L = (el: React.ReactElement) =>
  renderToString(
    <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
      {el}
    </NextIntlClientProvider>,
  );

const card = {
  id: "job-1",
  title: "SCADA Architect",
  shortSummary: "Designs enterprise SCADA systems.",
  department: "engineering",
  departmentLabel: "Automation Engineering",
  location: "Isfahan, Iran",
  addressLocality: "Isfahan",
  addressRegion: null,
  addressCountry: "IR",
  locationType: null,
  skills: ["scada"],
  publishedAt: "2026-08-01T00:00:00.000Z",
  closingDate: undefined,
};

const detail = {
  id: "job-1",
  title: "SCADA Architect",
  shortSummary: "Designs enterprise SCADA systems.",
  description: "Owns SCADA architecture end to end.",
  departmentLabel: "Automation Engineering",
  responsibilities: ["Define SCADA architecture"],
  requirements: ["Several years of SCADA experience"],
  preferredExperience: [],
  localizedSkills: { scada: "SCADA" },
  skillCodes: ["scada"],
  location: "Isfahan, Iran",
  locationType: null,
  salaryCurrency: null,
  salaryMin: null,
  salaryMax: null,
  publishedAt: "2026-08-01T00:00:00.000Z",
  closingDate: undefined,
};

describe("careers board server render", () => {
  it("includes crawlable job links when the server supplies postings", () => {
    const html = L(<CareersBoardClient initialJobs={[card]} />);
    expect(html).toContain('href="/careers/job-1"');
    expect(html).toContain("SCADA Architect");
    expect(html).not.toContain(en.careers.loading);
  });

  it("keeps the loading state only when the server read was unavailable", () => {
    const html = L(<CareersBoardClient initialJobs={null} />);
    expect(html).toContain(en.careers.loading);
    expect(html).not.toContain('href="/careers/');
  });

  it("renders the genuine empty state for an empty (but available) list", () => {
    const html = L(<CareersBoardClient initialJobs={[]} />);
    expect(html).toContain(en.careers.noResults);
    expect(html).not.toContain(en.careers.loading);
  });
});

describe("job detail server render", () => {
  it("renders the posting body, not the loading placeholder", () => {
    const html = L(<JobDetailClient jobId="job-1" initial={detail} />);
    expect(html).toContain("Owns SCADA architecture end to end.");
    expect(html).toContain("Define SCADA architecture");
    expect(html).not.toContain(en.careers.jobLoading);
  });

  it("renders the enumeration-safe unavailable copy for an ineligible job", () => {
    const html = L(<JobDetailClient jobId="job-x" initial="not-found" />);
    expect(html).toContain(en.careers.jobUnavailable);
  });

  it("falls back to loading (client fetch) when the store is unreachable", () => {
    const html = L(<JobDetailClient jobId="job-1" />);
    expect(html).toContain(en.careers.jobLoading);
  });
});
