// @vitest-environment jsdom
/**
 * PHASE 104-B1.4 §1/§3 — the WHOLE careers journey tells the truth, in all
 * three languages.
 *
 * B1.3 closed the apply PAGE but left the two surfaces that lead to it still
 * advertising an apply journey: the board card said "View and apply" and the
 * detail page rendered a primary CTA linking to /careers/apply/{id}. The server
 * refuses every application, so both were promises the product could not keep.
 *
 * The gate is APPLY_JOURNEY_OPEN, not the owner flag alone: acceptance being
 * authorized does NOT mean the server can accept, because B2 still owns the
 * orchestration. §1.4 exists precisely so a single flag flip cannot re-open a
 * journey the backend cannot serve.
 *
 * §3 is checked here too, on the real component: the board request must carry
 * the ACTIVE locale, built through URLSearchParams.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import { JobDetailClient } from "../JobDetailClient";
import { CareersBoardClient } from "../CareersBoardClient";
import {
  APPLY_JOURNEY_OPEN,
  APPLICATION_ACCEPTANCE_AUTHORIZED,
  APPLICATION_ORCHESTRATION_IMPLEMENTED,
} from "@/lib/ats/acceptance-flag";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/careers/job-1" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}));
import React from "react";

type Locale = "en" | "de" | "fa";
const LOCALES: Locale[] = ["en", "de", "fa"];
const CAT = { en, de, fa } as unknown as Record<Locale, { careers: Record<string, string> }>;
const C = (l: Locale) => CAT[l].careers;

const REPO = process.cwd();
const readCode = (rel: string) =>
  readFileSync(join(REPO, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const detail = () => ({
  id: "job-1",
  title: "SCADA Architect",
  shortSummary: "Short summary of the role",
  description: "Designs and owns enterprise SCADA systems.",
  departmentLabel: "Automation",
  responsibilities: ["Design SCADA architecture"],
  requirements: ["Several years of SCADA experience"],
  preferredExperience: ["OPC UA projects"],
  localizedSkills: { scada: "SCADA" },
  skillCodes: ["scada"],
  location: "Isfahan, Iran",
  locationType: null as string | null,
  salaryCurrency: null as string | null,
  salaryMin: null as number | null,
  salaryMax: null as number | null,
  publishedAt: "2026-08-01T00:00:00.000Z",
  closingDate: undefined as string | undefined,
});

const card = () => ({
  id: "job-1",
  title: "SCADA Architect",
  shortSummary: "Short summary of the role",
  department: "automation",
  departmentLabel: "Automation",
  location: "Isfahan, Iran",
  addressLocality: null as string | null,
  addressRegion: null as string | null,
  addressCountry: null as string | null,
  locationType: null as string | null,
  skills: ["SCADA"],
  publishedAt: "2026-08-01T00:00:00.000Z",
  closingDate: undefined as string | undefined,
});

/** Records every requested URL; serves the body through text(), the way requestJson reads it. */
function stubFetch(body: unknown) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch);
  return urls;
}

const detailUi = (locale: Locale) => (
  <NextIntlClientProvider locale={locale} messages={CAT[locale] as never} timeZone="UTC">
    <JobDetailClient jobId="job-1" />
  </NextIntlClientProvider>
);
const boardUi = (locale: Locale) => (
  <NextIntlClientProvider locale={locale} messages={CAT[locale] as never} timeZone="UTC">
    <CareersBoardClient />
  </NextIntlClientProvider>
);
const settle = async (n = 3) => { for (let k = 0; k < n; k++) await new Promise((r) => setTimeout(r, 0)); };

afterEach(() => vi.unstubAllGlobals());

describe("B1.4 §1.4 — the gate is BOTH facts, not the owner flag alone", () => {
  it("APPLY_JOURNEY_OPEN is the conjunction, and it is false while B2 is unimplemented", () => {
    expect(APPLICATION_ACCEPTANCE_AUTHORIZED).toBe(false);
    expect(APPLICATION_ORCHESTRATION_IMPLEMENTED).toBe(false);
    expect(APPLY_JOURNEY_OPEN).toBe(APPLICATION_ACCEPTANCE_AUTHORIZED && APPLICATION_ORCHESTRATION_IMPLEMENTED);
    expect(APPLY_JOURNEY_OPEN).toBe(false);
  });

  it("the detail page gates on the CONJUNCTION — flipping the owner flag alone cannot re-open the journey", () => {
    const src = readCode("src/components/careers/JobDetailClient.tsx");
    expect(src).toContain("APPLY_JOURNEY_OPEN");
    // Reaching for the owner flag on its own is the exact mistake §1.4 forbids.
    expect(src).not.toMatch(/\bAPPLICATION_ACCEPTANCE_AUTHORIZED\b/);
    const flag = readCode("src/lib/ats/acceptance-flag.ts");
    expect(flag).toMatch(
      /APPLY_JOURNEY_OPEN\s*=\s*APPLICATION_ACCEPTANCE_AUTHORIZED\s*&&\s*APPLICATION_ORCHESTRATION_IMPLEMENTED/,
    );
  });
});

describe.each(LOCALES)("B1.4 §1 — job detail tells the truth in %s", (locale) => {
  it("renders ZERO links to the apply route while the journey is closed", async () => {
    stubFetch({ job: detail(), source: "db" });
    const { container, unmount } = await mount(detailUi(locale));
    await settle();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.filter((h) => h.includes("/careers/apply"))).toHaveLength(0);
    await unmount();
  });

  it("shows the honest non-interactive notice, and it is exposed to assistive tech", async () => {
    stubFetch({ job: detail(), source: "db" });
    const { container, unmount } = await mount(detailUi(locale));
    await settle();
    const notice = container.querySelector('[role="note"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent?.trim()).toBe(C(locale).applicationsNotOpen);
    // Non-interactive: not a link, not a button, not focusable.
    expect(notice?.tagName).toBe("P");
    expect(notice?.getAttribute("tabindex")).toBeNull();
    expect(notice?.querySelector("a,button")).toBeNull();
    await unmount();
  });

  it("carries NO apply call-to-action text", async () => {
    stubFetch({ job: detail(), source: "db" });
    const { container, unmount } = await mount(detailUi(locale));
    await settle();
    expect(container.textContent ?? "").not.toContain(C(locale).applyCta);
    await unmount();
  });

  it("still renders the posting itself — the closure removes the promise, not the content", async () => {
    stubFetch({ job: detail(), source: "db" });
    const { container, unmount } = await mount(detailUi(locale));
    await settle();
    expect(container.querySelector("h1")?.textContent).toBe("SCADA Architect");
    expect(container.textContent).toContain("Designs and owns enterprise SCADA systems.");
    await unmount();
  });
});

describe.each(LOCALES)("B1.4 §1 — the board card tells the truth in %s", (locale) => {
  it("its call to action says VIEW DETAILS and carries no apply wording", async () => {
    stubFetch({ jobs: [card()], source: "db" });
    const { container, unmount } = await mount(boardUi(locale));
    await settle();
    const text = container.textContent ?? "";
    expect(text).toContain(C(locale).viewDetails);
    // The retired leaf is gone from the catalog entirely, so there is nothing
    // left to render — assert on the catalog as well as on the DOM.
    expect(C(locale).viewAndApply).toBeUndefined();
    for (const word of [/\bapply\b/i, /\bapplication\b/i, /\brequest\b/i, /bewerb/i, /درخواست/]) {
      expect(text).not.toMatch(word);
    }
    await unmount();
  });

  it("the card still navigates to the job detail page, and never to the apply route", async () => {
    stubFetch({ jobs: [card()], source: "db" });
    const { container, unmount } = await mount(boardUi(locale));
    await settle();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/careers/job-1");
    expect(hrefs.filter((h) => h.includes("/careers/apply"))).toHaveLength(0);
    await unmount();
  });
});

describe.each(LOCALES)("B1.4 §3 — the board request carries the ACTIVE locale (%s)", (locale) => {
  it("sends locale=<active> on the real request", async () => {
    const urls = stubFetch({ jobs: [card()], source: "db" });
    const { unmount } = await mount(boardUi(locale));
    await settle();
    const url = urls.find((u) => u.includes("/api/careers/jobs"));
    expect(url).toBeDefined();
    // Parsed as real query parameters, not matched as a substring: a template
    // that merely happened to contain the letters would not satisfy this.
    const qs = new URLSearchParams(String(url).split("?")[1] ?? "");
    expect(qs.get("locale")).toBe(locale);
    await unmount();
  });
});
