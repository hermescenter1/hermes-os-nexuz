// @vitest-environment jsdom
/**
 * PHASE 104-B1.1/B1.2 — the REAL JobDetailClient and CareersBoardClient,
 * mounted with the repo harness against the REAL API contracts and the FULL
 * async-state matrix (§2):
 *
 *   200 valid · 200 malformed · 404 · 503 · rejected fetch (offline) ·
 *   locale switch whose SECOND request fails (no stale content survives) ·
 *   filter switch whose second request fails · successful retry after 503.
 *
 * The state identities are kept apart: 404 (an ANSWER about the job) renders
 * the enumeration-safe unavailable copy; 503/offline/malformed (OUTAGES)
 * render the Stage 6-A ResourceFailureNotice with role="alert" and a real
 * retry — never the "no jobs / not published" clothes.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount, click } from "@/components/ds/__tests__/_render";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import { JobDetailClient } from "../JobDetailClient";
import { CareersBoardClient } from "../CareersBoardClient";

vi.mock("next/navigation", () => ({
  usePathname: () => "/de/careers/job-1",
}));
// The i18n Link wrapper cannot be imported under vitest (it drags next-intl's
// createNavigation into next/navigation resolution) — a plain anchor keeps
// the render real while the router stays out of scope.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}));
import React from "react";

const D = (de as unknown as { careers: Record<string, string> }).careers;
const DERR = (de as unknown as { errors: { resource: Record<string, string> } }).errors.resource;

const detail = () => ({
  id: "job-1",
  title: "SCADA-Architekt",
  shortSummary: "Kurzbeschreibung der Rolle",
  description: "Entwirft und verantwortet Enterprise-SCADA-Systeme.",
  departmentLabel: "Automatisierungstechnik",
  responsibilities: ["SCADA-Architektur entwerfen", "Standards durchsetzen"],
  requirements: ["Mehrjährige SCADA-Erfahrung"],
  preferredExperience: ["OPC-UA-Projekte"],
  localizedSkills: { scada: "SCADA-Systeme" },
  skillCodes: ["scada", "opc-ua"],
  location: "Isfahan, Iran",
  locationType: null as string | null,
  salaryCurrency: null as string | null,
  salaryMin: null as number | null,
  salaryMax: null as number | null,
  publishedAt: "2026-08-01T00:00:00.000Z",
  closingDate: undefined as string | undefined,
});

type Scripted =
  | { kind: "ok"; body: unknown }
  | { kind: "status"; status: number; body?: unknown }
  | { kind: "reject" }
  | { kind: "malformed-json" };

/** A scripted fetch: each call consumes the next response in the queue; the
 *  last entry repeats (so retries have something to hit). */
function scriptFetch(queue: Scripted[]) {
  let i = 0;
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(String(url));
    const s = queue[Math.min(i++, queue.length - 1)];
    if (s.kind === "reject") throw new TypeError("Failed to fetch");
    if (s.kind === "malformed-json") {
      return { ok: true, status: 200, json: async () => { throw new Error("bad json"); }, text: async () => "{oops" };
    }
    if (s.kind === "status") {
      return { ok: false, status: s.status, json: async () => s.body ?? { error: "x" }, text: async () => JSON.stringify(s.body ?? {}) };
    }
    return { ok: true, status: 200, json: async () => s.body, text: async () => JSON.stringify(s.body) };
  }) as unknown as typeof fetch);
  return calls;
}

const ui = (locale: "de" | "fa" = "de", jobId = "job-1") => (
  <NextIntlClientProvider locale={locale} messages={(locale === "de" ? de : fa) as never} timeZone="UTC">
    <JobDetailClient jobId={jobId} />
  </NextIntlClientProvider>
);
const boardUi = (locale: "de" | "fa" = "de") => (
  <NextIntlClientProvider locale={locale} messages={(locale === "de" ? de : fa) as never} timeZone="UTC">
    <CareersBoardClient />
  </NextIntlClientProvider>
);

const settle = async (n = 2) => { for (let k = 0; k < n; k++) await new Promise((r) => setTimeout(r, 0)); };

afterEach(() => vi.unstubAllGlobals());

describe("B1.1 — JobDetailClient renders the TRANSLATED body (200 valid)", () => {
  it("shows description, responsibilities, requirements and preferred experience of the locale", async () => {
    scriptFetch([{ kind: "ok", body: { job: detail(), source: "db" } }]);
    const { container, unmount } = await mount(ui());
    await settle();
    const text = container.textContent ?? "";
    expect(container.querySelector("h1")?.textContent).toBe("SCADA-Architekt");
    expect(text).toContain("Entwirft und verantwortet Enterprise-SCADA-Systeme.");
    expect(text).toContain("SCADA-Architektur entwerfen");
    expect(text).toContain("Mehrjährige SCADA-Erfahrung");
    expect(text).toContain("OPC-UA-Projekte");
    expect(text).toContain("Automatisierungstechnik");
    await unmount();
  });

  it("skill chips use the localized label; an unlabeled code stays a CODE", async () => {
    scriptFetch([{ kind: "ok", body: { job: detail(), source: "db" } }]);
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.textContent).toContain("SCADA-Systeme");
    expect(container.textContent).toContain("opc-ua");
    await unmount();
  });

  it("§7 — no raw enum, no hard-coded '/ year': localized locationType + Intl salary in DE", async () => {
    const job = { ...detail(), locationType: "onsite", salaryCurrency: "EUR", salaryMin: 65000, salaryMax: 85000 };
    scriptFetch([{ kind: "ok", body: { job, source: "db" } }]);
    const { container, unmount } = await mount(ui());
    await settle();
    const text = container.textContent ?? "";
    expect(text).toContain("Vor Ort");
    expect(text).not.toMatch(/\bonsite\b/);
    expect(text).not.toContain("/ year");
    expect(text).toContain("pro Jahr");
    // Intl currency formatting (de-DE euro sign present, no bare 65000)
    expect(text).toContain("€");
    await unmount();
  });

  it("§7 — an UNMAPPED locationType renders nothing (no guessing), incomplete salary renders nothing", async () => {
    const job = { ...detail(), locationType: "weird-mode", salaryCurrency: "EUR", salaryMin: 65000, salaryMax: null };
    scriptFetch([{ kind: "ok", body: { job, source: "db" } }]);
    const { container, unmount } = await mount(ui());
    await settle();
    const text = container.textContent ?? "";
    expect(text).not.toContain("weird-mode");
    expect(text).not.toContain(D.typeLabel);
    expect(text).not.toContain(D.compensationLabel);
    expect(text).not.toContain(D.benefits);
    await unmount();
  });
});

describe("B1.2 §2 — the async-state matrix keeps its states apart", () => {
  it("404 → the enumeration-safe unavailable copy (with the page h1), NOT an error alert", async () => {
    scriptFetch([{ kind: "status", status: 404, body: { error: "Job not found" } }]);
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.textContent).toContain(D.jobUnavailable);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await unmount();
  });

  it("503 → the Stage 6-A failure surface with role=alert and a retry — NEVER the unavailable copy", async () => {
    scriptFetch([{ kind: "status", status: 503, body: { error: "down" } }]);
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.textContent).not.toContain(D.jobUnavailable);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain(DERR.unavailableTitle);
    await unmount();
  });

  it("rejected fetch (offline) → the offline failure surface, never 'not published'", async () => {
    scriptFetch([{ kind: "reject" }]);
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.textContent).not.toContain(D.jobUnavailable);
    expect(container.textContent).toContain(DERR.offlineTitle);
    await unmount();
  });

  it("200 malformed (bad JSON) → an outage state, never a half-empty success", async () => {
    scriptFetch([{ kind: "malformed-json" }]);
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain(D.jobUnavailable);
    await unmount();
  });

  it("200 with a missing REQUIRED translated field → outage-class, title never renders", async () => {
    scriptFetch([{ kind: "ok", body: { job: { ...detail(), description: "" }, source: "db" } }]);
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain("SCADA-Architekt");
    await unmount();
  });

  it("a non-db source is malformed too", async () => {
    scriptFetch([{ kind: "ok", body: { job: detail(), source: "mock" } }]);
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await unmount();
  });

  it("retry after 503 succeeds: the alert's retry control loads the job", async () => {
    scriptFetch([
      { kind: "status", status: 503 },
      { kind: "ok", body: { job: detail(), source: "db" } },
    ]);
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    const retry = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent ?? "").length > 0);
    expect(retry).toBeTruthy();
    await click(retry!);
    await settle(3);
    expect(container.querySelector("h1")?.textContent).toBe("SCADA-Architekt");
    await unmount();
  });

  it("DE→FA remount whose second request FAILS keeps no stale German content", async () => {
    scriptFetch([{ kind: "ok", body: { job: detail(), source: "db" } }]);
    const m = await mount(ui("de"));
    await settle();
    expect(m.container.textContent).toContain("SCADA-Architekt");
    // second locale's request fails
    scriptFetch([{ kind: "status", status: 503 }]);
    await m.rerender(ui("fa"));
    await settle(3);
    const text = m.container.textContent ?? "";
    expect(text).not.toContain("SCADA-Architekt");
    expect(text).not.toContain("Entwirft und verantwortet");
    expect(m.container.querySelector('[role="alert"]')).not.toBeNull();
    await m.unmount();
  });
});

describe("B1.2 §2 — CareersBoardClient state matrix", () => {
  const card = (id: string, over: Record<string, unknown> = {}) => ({
    id, title: `T-${id}`, shortSummary: "s", department: "automation",
    departmentLabel: "Automatisierungstechnik", location: "Isfahan, Iran",
    addressLocality: "Isfahan", addressRegion: "Isfahan Province", addressCountry: "IR",
    locationType: null, skills: ["plc"], publishedAt: "2026-08-01T00:00:00.000Z",
    closingDate: undefined, ...over,
  });

  it("200 valid renders LOCALIZED department labels, never the raw code", async () => {
    scriptFetch([{ kind: "ok", body: { jobs: [card("a")], total: 1, source: "db" } }]);
    const { container, unmount } = await mount(boardUi());
    await settle();
    const text = container.textContent ?? "";
    expect(text).toContain("T-a");
    expect(text).toContain("Automatisierungstechnik");
    // element-level: textContent concatenates nodes without separators, so a
    // word-boundary regex can be defeated by adjacency — assert on rendered
    // node values instead
    const spanTexts = Array.from(container.querySelectorAll("span")).map((el) => (el.textContent ?? "").trim());
    expect(spanTexts).toContain("Automatisierungstechnik");
    expect(spanTexts).not.toContain("automation");
    await unmount();
  });

  it("503 shows the failure surface with retry — NEVER the empty board and NEVER 'no results'", async () => {
    scriptFetch([{ kind: "status", status: 503 }]);
    const { container, unmount } = await mount(boardUi());
    await settle();
    expect(container.textContent).not.toContain(D.noResults);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await unmount();
  });

  it("offline never claims 'no jobs'", async () => {
    scriptFetch([{ kind: "reject" }]);
    const { container, unmount } = await mount(boardUi());
    await settle();
    expect(container.textContent).not.toContain(D.noResults);
    expect(container.textContent).toContain(DERR.offlineTitle);
    await unmount();
  });

  it("a genuinely empty SUCCESSFUL list is the only 'no results' state", async () => {
    scriptFetch([{ kind: "ok", body: { jobs: [], total: 0, source: "db" } }]);
    const { container, unmount } = await mount(boardUi());
    await settle();
    expect(container.textContent).toContain(D.noResults);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await unmount();
  });

  it("retry after 503 loads the list", async () => {
    scriptFetch([
      { kind: "status", status: 503 },
      { kind: "ok", body: { jobs: [card("b")], total: 1, source: "db" } },
    ]);
    const { container, unmount } = await mount(boardUi());
    await settle();
    const retry = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent ?? "").length > 0);
    await click(retry!);
    await settle(3);
    expect(container.textContent).toContain("T-b");
    await unmount();
  });

  it("a filter change whose request FAILS leaves no stale results on screen", async () => {
    scriptFetch([
      { kind: "ok", body: { jobs: [card("stale")], total: 1, source: "db" } },
      { kind: "status", status: 503 },
    ]);
    const { container, unmount } = await mount(boardUi());
    await settle();
    expect(container.textContent).toContain("T-stale");
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const { act } = await import("react");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "plc");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle(3);
    const text = container.textContent ?? "";
    expect(text).not.toContain("T-stale");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await unmount();
  });
});
