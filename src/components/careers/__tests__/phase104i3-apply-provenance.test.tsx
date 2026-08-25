// @vitest-environment jsdom

/**
 * PHASE 104-I3 — the job application flow must honour the DB-only contract.
 *
 * HISTORICAL (104-I3, pre-B1): the careers job API fell back to a fabricated
 * posting when the database was unreachable and labelled it `source: "mock"`.
 * ApplyFormClient ignored that field, so an invented vacancy became a live
 * application target: a candidate could complete and submit a real
 * application — name, email, résumé — against a job that does not exist.
 *
 * CURRENT (B1.3): there is no fixture path in the API at all, AND the
 * application surface collects nothing while the server refuses applications
 * (`APPLICATION_ACCEPTANCE_AUTHORIZED = false`, B2 owns the orchestration).
 * The provenance contract this file has always asserted is therefore
 * STRONGER, not weaker: no unverified posting reaches the page, and no form
 * exists for a verified one either.
 *
 * The vocabulary is now three distinct states, and this suite pins all three:
 *   verified + acceptance off → the honest not-accepting page (no inputs)
 *   ineligible / 404          → the enumeration-safe unavailable page
 *   non-db / malformed / 5xx  → an outage surface, never a claim about the job
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@/components/ds/__tests__/_render";
import { NextIntlClientProvider } from "next-intl";
import { ApplyFormClient } from "../ApplyFormClient";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...p}>{children}</a>
  ),
}));

const mockFetch = vi.fn<typeof globalThis.fetch>();
globalThis.fetch = mockFetch;

// B1.3 — the apply surface verifies a REAL PublicJobDetail (exact runtime
// validation), so the fixture is the full contract, not a four-field summary.
const JOB = {
  id: "job-001",
  title: "Senior PLC Engineer",
  shortSummary: "Own the PLC layer end to end.",
  description: "Design, commission and support plant-floor control systems.",
  departmentLabel: "Automation Engineering",
  responsibilities: ["Commission PLC systems"],
  requirements: ["5+ years with Siemens TIA Portal"],
  preferredExperience: ["OPC UA"],
  localizedSkills: { plc: "PLC Programming" },
  skillCodes: ["plc"],
  location: "Frankfurt, Germany",
  locationType: null,
  salaryCurrency: null,
  salaryMin: null,
  salaryMax: null,
  publishedAt: "2026-05-02T00:00:00.000Z",
  closingDate: undefined,
};

/** A 2xx reply. `requestJson` reads the body via `text()`, so the double must
 *  serve it there — a `json()`-only double would fail a faithful reader. */
function reply(body: unknown) {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

/** A non-2xx reply, for the refusal paths. */
function replyStatus(status: number, body: unknown = { error: "x" }) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

async function render(locale: "en" | "fa" = "en") {
  const messages = locale === "en" ? { careers: en.careers } : { careers: fa.careers };
  const m = await mount(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ApplyFormClient jobId="job-001" />
    </NextIntlClientProvider>
  );
  await new Promise((r) => setTimeout(r, 150));
  return m;
}

const NOTHING_COLLECTED = (root: HTMLElement) => {
  expect(root.querySelectorAll("form").length).toBe(0);
  expect(root.querySelectorAll("input, textarea, select").length).toBe(0);
  expect(root.querySelector('button[type="submit"]')).toBeNull();
};

describe("104-I3/B1.3 — the application surface collects nothing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a database-backed posting gets the honest not-accepting page — and NO fields", async () => {
    reply({ job: JOB, source: "db" });
    const m = await render();
    const text = m.container.textContent ?? "";
    expect(text).toContain(en.careers.apply.notAcceptingTitle);
    // the real vacancy is named — the page is about a genuine posting …
    expect(text).toContain("Senior PLC Engineer");
    // … and nothing about the visitor is collected
    NOTHING_COLLECTED(m.container);
    await m.unmount();
  });

  it("makes no claim of success, receipt or later contact", async () => {
    reply({ job: JOB, source: "db" });
    const m = await render();
    const text = m.container.textContent ?? "";
    for (const claim of [
      en.careers.apply.successTitle,
      en.careers.apply.successBody,
      en.careers.apply.successMyApplications,
    ]) {
      expect(text, claim).not.toContain(claim);
    }
    await m.unmount();
  });

  it("a non-db `source` is an OUTAGE state and leaks nothing about the posting", async () => {
    reply({ job: JOB, source: "mock" });
    const m = await render();
    const text = m.container.textContent ?? "";
    NOTHING_COLLECTED(m.container);
    expect(m.container.querySelector('[role="alert"]')).not.toBeNull();
    // an unverified body must never surface as if it were a vacancy
    expect(text).not.toContain("Senior PLC Engineer");
    expect(text).not.toContain("Frankfurt, Germany");
    expect(text).not.toContain("Automation Engineering");
    // and it is NOT dressed as a statement about the job
    expect(text).not.toContain(en.careers.apply.notAcceptingTitle);
    await m.unmount();
  });

  it("an absent `source` marker fails closed the same way", async () => {
    reply({ job: JOB });
    const m = await render();
    NOTHING_COLLECTED(m.container);
    expect(m.container.textContent).not.toContain("Senior PLC Engineer");
    await m.unmount();
  });

  it("a 404 posting shows the enumeration-safe unavailable page with ONE h1", async () => {
    replyStatus(404, { error: "Job not found" });
    const m = await render();
    const h1s = m.container.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toBe(en.careers.apply.unavailableTitle);
    NOTHING_COLLECTED(m.container);
    await m.unmount();
  });

  it("a rejected request is an outage surface, never a claim about the job", async () => {
    mockFetch.mockRejectedValue(new TypeError("network down"));
    const m = await render();
    NOTHING_COLLECTED(m.container);
    expect(m.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(m.container.textContent).not.toContain(en.careers.apply.notAcceptingTitle);
    await m.unmount();
  });

  it("localizes the withheld state in Persian, and still exposes nothing fabricated", async () => {
    reply({ job: JOB, source: "db" });
    const m = await render("fa");
    const text = m.container.textContent ?? "";
    expect(text).toContain(fa.careers.apply.notAcceptingTitle);
    // Persian script, not a Latin fallback
    expect(text).toMatch(/[؀-ۿ]/);
    NOTHING_COLLECTED(m.container);
    await m.unmount();
  });

  it("the retired work-authorization control is GONE, not merely hidden", async () => {
    reply({ job: JOB, source: "db" });
    const m = await render("fa");
    expect(m.container.querySelector("select")).toBeNull();
    expect(m.container.innerHTML).not.toContain("citizen");
    expect(m.container.innerHTML).not.toContain("requires-sponsorship");
    await m.unmount();
  });
});
