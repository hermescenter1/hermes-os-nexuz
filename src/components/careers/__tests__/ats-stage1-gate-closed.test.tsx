// @vitest-environment jsdom
/**
 * ATS-STAGE1-FORM — the KILL SWITCH still works.
 *
 * The owner authorized acceptance, so `APPLICATION_ACCEPTANCE_AUTHORIZED` is
 * `true` in the source (pinned in phase104b13 / phase104b14). This file mocks
 * the flag module back to `false` and proves, behaviourally, that the one-edit
 * rollback closes EVERY public apply surface again — the assertions that used
 * to describe the whole product before the owner's decision:
 *
 *   - the job detail page renders ZERO links to the apply route and only the
 *     honest, non-interactive "applications are not open" note;
 *   - the apply page renders the honest not-accepting state for a REAL
 *     published posting: no form, no inputs, no submit, no success claim, and
 *     ZERO requests to /api/careers/apply — in German and Persian;
 *   - the route refuses a fully valid payload before any write (proven in
 *     `ats-b2-apply-orchestration.test.ts`, flag-off case).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";

vi.mock("@/lib/ats/acceptance-flag", () => ({
  APPLICATION_ACCEPTANCE_AUTHORIZED: false,
  APPLICATION_ORCHESTRATION_IMPLEMENTED: true,
  APPLY_JOURNEY_OPEN: false,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/de/careers/job-1" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}));
import React from "react";
import { ApplyFormClient } from "../ApplyFormClient";
import { JobDetailClient } from "../JobDetailClient";

type Catalog = { careers: Record<string, unknown> & { apply: Record<string, string> } };
const CAT = { de: de as unknown as Catalog, fa: fa as unknown as Catalog };

const detail = () => ({
  id: "job-1",
  title: "SCADA-Architekt",
  shortSummary: "Kurzbeschreibung",
  description: "Beschreibung.",
  departmentLabel: "Automatisierungstechnik",
  responsibilities: ["r"],
  requirements: ["q"],
  preferredExperience: ["p"],
  localizedSkills: { scada: "SCADA" },
  skillCodes: ["scada"],
  location: "Isfahan, Iran",
  locationType: null,
  salaryCurrency: null,
  salaryMin: null,
  salaryMax: null,
  publishedAt: "2026-08-01T00:00:00.000Z",
  closingDate: undefined,
});

function stubFetch(body: unknown) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch);
  return urls;
}
const settle = async (n = 3) => { for (let k = 0; k < n; k++) await new Promise((r) => setTimeout(r, 0)); };
const wrap = (locale: "de" | "fa", node: React.ReactNode) => (
  <NextIntlClientProvider locale={locale} messages={CAT[locale] as never} timeZone="UTC">{node}</NextIntlClientProvider>
);

afterEach(() => vi.unstubAllGlobals());

describe.each(["de", "fa"] as const)("flag back to false — every apply surface closes (%s)", (locale) => {
  const A = CAT[locale].careers.apply;

  it("the apply page renders the honest not-accepting state — no form, no inputs, no submit, no request", async () => {
    const urls = stubFetch({ job: detail(), source: "db" });
    const { container, unmount } = await mount(wrap(locale, <ApplyFormClient jobId="job-1" />));
    await settle();
    const text = container.textContent ?? "";
    expect(text).toContain(A.notAcceptingTitle);
    expect(text).toContain(A.notAcceptingBody);
    expect(text).toContain("SCADA-Architekt");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelectorAll("input, textarea, select").length).toBe(0);
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    for (const claim of [A.successTitle, A.successBody, A.successMyApplications]) expect(text).not.toContain(claim);
    expect(urls.some((u) => u.includes("/api/careers/apply"))).toBe(false);
    expect(urls).toHaveLength(1);
    await unmount();
  });

  it("the job detail page renders ZERO apply links and only the non-interactive note", async () => {
    stubFetch({ job: detail(), source: "db" });
    const { container, unmount } = await mount(wrap(locale, <JobDetailClient jobId="job-1" />));
    await settle();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.filter((h) => h.includes("/careers/apply"))).toHaveLength(0);
    const note = container.querySelector('[role="note"]');
    expect(note?.textContent?.trim()).toBe(CAT[locale].careers.applicationsNotOpen);
    expect(note?.tagName).toBe("P");
    expect(note?.querySelector("a,button")).toBeNull();
    expect(container.textContent ?? "").not.toContain(String(CAT[locale].careers.applyCta));
    await unmount();
  });
});
