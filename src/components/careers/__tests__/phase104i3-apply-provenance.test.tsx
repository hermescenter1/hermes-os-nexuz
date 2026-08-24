// @vitest-environment jsdom

/**
 * PHASE 104-I3 — the job application flow must honour the DB-only contract.
 *
 * The careers job API falls back to a fabricated posting when the database is
 * unreachable and labels it `source: "mock"`. ApplyFormClient previously ignored
 * that field entirely, so an invented vacancy became a live application target:
 * a candidate could complete and submit a real application — name, email,
 * résumé — against a job that does not exist.
 *
 * The contract asserted here is behavioural: for anything other than a
 * verifiably database-backed posting, NO form is rendered at all.
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

/** Minimal shape the component reads. */
const JOB = { id: "job-001", title: "Senior PLC Engineer", department: "Automation Engineering", location: "Frankfurt, Germany" };

function reply(body: unknown) {
  mockFetch.mockResolvedValueOnce({ json: async () => body } as Response);
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

describe("104-I3 — ApplyFormClient DB-only application contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the application form for a database-backed posting", async () => {
    reply({ job: JOB, source: "db" });
    const m = await render();
    const html = m.container.innerHTML;
    expect(m.container.querySelectorAll("form").length).toBe(1);
    expect(html).toContain("Senior PLC Engineer");
    // Real, fillable fields exist for a real vacancy.
    expect(m.container.querySelectorAll("input, textarea, select").length).toBeGreaterThan(5);
    await m.unmount();
  });

  it("renders NO form when the posting is a mock fallback", async () => {
    reply({ job: JOB, source: "mock" });
    const m = await render();
    expect(m.container.querySelectorAll("form").length).toBe(0);
    expect(m.container.querySelectorAll("input, textarea, select").length).toBe(0);
    await m.unmount();
  });

  it("does not leak the fabricated posting's details into the page", async () => {
    reply({ job: JOB, source: "mock" });
    const m = await render();
    const text = m.container.textContent ?? "";
    expect(text).not.toContain("Senior PLC Engineer");
    expect(text).not.toContain("Frankfurt, Germany");
    expect(text).not.toContain("Automation Engineering");
    await m.unmount();
  });

  it("shows the honest unavailable state with a heading, not a bare paragraph", async () => {
    reply({ job: JOB, source: "mock" });
    const m = await render();
    const h1s = m.container.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toBe(en.careers.apply.unavailableTitle);
    await m.unmount();
  });

  it("renders no form when the API omits `source` entirely", async () => {
    // A response shape the component does not recognise must fail closed, not
    // open: an absent provenance marker is not evidence of a real vacancy.
    reply({ job: JOB });
    const m = await render();
    expect(m.container.querySelectorAll("form").length).toBe(0);
    await m.unmount();
  });

  it("renders no form when the job is missing or the request fails", async () => {
    reply({ error: "Job not found" });
    const m1 = await render();
    expect(m1.container.querySelectorAll("form").length).toBe(0);
    await m1.unmount();

    mockFetch.mockRejectedValueOnce(new Error("network down"));
    const m2 = await render();
    expect(m2.container.querySelectorAll("form").length).toBe(0);
    expect(m2.container.querySelectorAll("h1").length).toBe(1);
    await m2.unmount();
  });

  it("localizes the withheld-form state in Persian", async () => {
    reply({ job: JOB, source: "mock" });
    const m = await render("fa");
    const text = m.container.textContent ?? "";
    expect(text).toContain(fa.careers.apply.unavailableTitle);
    // and still exposes nothing fabricated
    expect(text).not.toContain("Senior PLC Engineer");
    await m.unmount();
  });
});

describe("104-I3 — the application form is fully catalogue-backed", () => {
  it("associates every rendered field with a label", async () => {
    reply({ job: JOB, source: "db" });
    const m = await render();
    const fields = [...m.container.querySelectorAll("input, textarea, select")];
    expect(fields.length).toBeGreaterThan(5);
    const unlabelled = fields.filter((f) => {
      const id = f.getAttribute("id");
      if (!id) return !f.getAttribute("aria-labelledby") && !f.getAttribute("aria-label");
      return !m.container.querySelector(`label[for="${id}"]`);
    });
    expect(unlabelled.map((f) => f.getAttribute("name") ?? f.tagName)).toEqual([]);
    await m.unmount();
  });

  it("renders no untranslated English literal in the Persian form", async () => {
    reply({ job: JOB, source: "db" });
    const m = await render("fa");
    const headings = [...m.container.querySelectorAll("h2")].map((h) => h.textContent?.trim() ?? "");
    expect(headings.length).toBeGreaterThan(2);
    // Every section heading must be Persian script, not a Latin fallback.
    for (const h of headings) expect(h, `not Persian: ${h}`).toMatch(/[؀-ۿ]/);
    await m.unmount();
  });

  it("keeps work-authorization values canonical while localizing labels", async () => {
    reply({ job: JOB, source: "db" });
    const m = await render("fa");
    const select = m.container.querySelector("select");
    expect(select).toBeTruthy();
    const values = [...(select as HTMLSelectElement).options].map((o) => o.value);
    // The persisted enum must survive localization untouched.
    expect(values).toEqual(["citizen", "permanent-resident", "work-visa", "requires-sponsorship"]);
    const labels = [...(select as HTMLSelectElement).options].map((o) => o.textContent ?? "");
    for (const l of labels) expect(l).toMatch(/[؀-ۿ]/);
    await m.unmount();
  });
});
