// @vitest-environment jsdom
/**
 * PHASE 104-B1.3 §1.9 → ATS-STAGE1-FORM — the application surface is honest.
 *
 * B1.3 closed this surface while the server refused every application. The
 * owner has since authorized acceptance (ATS-STAGE1-FORM, 2026-09-25) and the
 * Stage-1 form exists, so this suite now pins the OPEN state:
 *
 *   - the flag is `true`, in ONE import-free module the server and the client
 *     share (identity, not agreement);
 *   - a VERIFIED posting renders the Stage-1 form, and nothing is posted to
 *     /api/careers/apply until the applicant submits;
 *   - no Work Authorization control and no "citizen" default anywhere;
 *   - the posting is verified WITH the active locale (DE and FA carry theirs);
 *   - an unverified, unknown or malformed posting never gets a form;
 *   - the retired payload vocabulary cannot return (source gate);
 *   - the UI cannot bypass the server: the route still applies both gates;
 *   - the Stage-1 contract matches the server schema exactly and mints a valid
 *     per-submission idempotency key.
 *
 * The closed state (flag back to `false`) is pinned behaviourally in
 * `ats-stage1-gate-closed.test.tsx`.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import { ApplyFormClient } from "../ApplyFormClient";
import {
  buildStage1Payload,
  newIdempotencyKey,
  STAGE1_INITIAL_FORM,
  type Stage1FormState,
} from "../stage1-contract";
import { stage1ApplicationSchema, APPLICATION_ACCEPTANCE_AUTHORIZED } from "@/lib/ats/application";
import { APPLICATION_ACCEPTANCE_AUTHORIZED as CLIENT_ACCEPTANCE_FLAG } from "@/lib/ats/acceptance-flag";

vi.mock("next/navigation", () => ({ usePathname: () => "/de/careers/apply/job-1" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}));
import React from "react";

const REPO = process.cwd();
const readCode = (rel: string) =>
  readFileSync(join(REPO, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");

const DA = (de as unknown as { careers: { apply: Record<string, string> } }).careers.apply;
const FAA = (fa as unknown as { careers: { apply: Record<string, string> } }).careers.apply;

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

/** Records every URL the component requests. */
function stubFetch(body: unknown, ok = true, status = 200) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(String(url));
    return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch);
  return urls;
}

const ui = (locale: "de" | "fa" = "de") => (
  <NextIntlClientProvider locale={locale} messages={(locale === "de" ? de : fa) as never} timeZone="UTC">
    <ApplyFormClient jobId="job-1" />
  </NextIntlClientProvider>
);
const settle = async (n = 3) => { for (let k = 0; k < n; k++) await new Promise((r) => setTimeout(r, 0)); };

afterEach(() => vi.unstubAllGlobals());

describe("ATS-STAGE1-FORM — acceptance is authorized, and only a verified posting collects anything", () => {
  it("the server gate is ON, and the client reads THAT value — not a copy", () => {
    expect(APPLICATION_ACCEPTANCE_AUTHORIZED).toBe(true);

    // B1.3: the constant moved into a dependency-free module so a "use client"
    // component can read it without pulling Prisma/pg into the browser bundle.
    // The risk that move introduces is a DIVERGENT twin, so the property under
    // test is identity: the value the server route imports and the value the
    // client imports must be the same constant, not two that happen to agree
    // today. `application.ts` re-exports; it never redeclares.
    expect(CLIENT_ACCEPTANCE_FLAG).toBe(APPLICATION_ACCEPTANCE_AUTHORIZED);
    const server = readCode("src/lib/ats/application.ts");
    expect(server).toContain('export { APPLICATION_ACCEPTANCE_AUTHORIZED } from "./acceptance-flag"');
    expect(server).not.toMatch(/export const APPLICATION_ACCEPTANCE_AUTHORIZED\s*=/);

    const client = readCode("src/components/careers/ApplyFormClient.tsx");
    expect(client).toContain("APPLICATION_ACCEPTANCE_AUTHORIZED");
    expect(client).toContain('from "@/lib/ats/acceptance-flag"');
    expect(client).not.toMatch(/=\s*(true|false)\s*;?\s*\/\/.*acceptance/i);
  });

  it("the acceptance flag module stays import-free, or the client bundle pulls in the DB driver", () => {
    // This is not style. `application.ts` reaches @prisma/adapter-pg → pg →
    // node `tls`, and a client component importing that chain fails the
    // production build outright ("Module not found: Can't resolve 'tls'").
    // The flag module is the seam that keeps that graph server-side, and it
    // only works while it imports nothing.
    const flag = readCode("src/lib/ats/acceptance-flag.ts");
    expect(flag).not.toMatch(/^\s*import\s/m);
    expect(flag).not.toMatch(/\brequire\s*\(/);
    expect(flag).toContain("export const APPLICATION_ACCEPTANCE_AUTHORIZED = true;");
  });

  it("renders the Stage-1 form for a REAL published posting — and posts NOTHING until the applicant submits", async () => {
    const urls = stubFetch({ job: detail(), source: "db" });
    const { container, unmount } = await mount(ui());
    await settle();
    const text = container.textContent ?? "";
    expect(text).toContain("SCADA-Architekt");
    expect(text).not.toContain(DA.notAcceptingTitle);
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelector('button[type="submit"]')).not.toBeNull();
    // exactly the approved Stage-1 set: 7 text fields + 2 textareas + 3 boxes, no select
    expect(container.querySelectorAll("textarea")).toHaveLength(2);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    expect(container.querySelectorAll("input:not([type=checkbox])")).toHaveLength(7);
    expect(container.querySelectorAll("select")).toHaveLength(0);
    // the only request is the verification
    expect(urls.some((u) => u.includes("/api/careers/apply"))).toBe(false);
    expect(urls).toHaveLength(1);
    await unmount();
  });

  it("makes NO claim of success, receipt or later contact before a submission", async () => {
    stubFetch({ job: detail(), source: "db" });
    const { container, unmount } = await mount(ui());
    await settle();
    const text = container.textContent ?? "";
    for (const claim of [DA.successTitle, DA.successBody, DA.successMyApplications]) {
      expect(text, claim).not.toContain(claim);
    }
    await unmount();
  });

  it("carries NO Work Authorization control and no 'citizen' default", async () => {
    stubFetch({ job: detail(), source: "db" });
    const { container, unmount } = await mount(ui());
    await settle();
    const text = container.textContent ?? "";
    expect(text).not.toContain(DA.workAuthorization);
    expect(container.innerHTML).not.toContain("citizen");
    // and not merely hidden: the source carries neither the control nor the default
    const src = readCode("src/components/careers/ApplyFormClient.tsx");
    expect(src).not.toMatch(/workAuthorization/);
    expect(src).not.toMatch(/"citizen"/);
    await unmount();
  });

  it("verifies the posting with the ACTIVE locale — DE and FA each carry their own", async () => {
    const deUrls = stubFetch({ job: detail(), source: "db" });
    const a = await mount(ui("de"));
    await settle();
    expect(deUrls[0]).toContain("locale=de");
    await a.unmount();
    vi.unstubAllGlobals();

    const faUrls = stubFetch({ job: detail(), source: "db" });
    const b = await mount(ui("fa"));
    await settle();
    expect(faUrls[0]).toContain("locale=fa");
    expect(b.container.textContent).toContain(FAA.fullName);
    await b.unmount();
  });

  it("a 404 posting is the enumeration-safe unavailable state — no form", async () => {
    stubFetch({ error: "Job not found" }, false, 404);
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.textContent).toContain(DA.unavailableTitle);
    expect(container.textContent).not.toContain(DA.notAcceptingTitle);
    expect(container.querySelector("form")).toBeNull();
    await unmount();
  });

  it("a 503 is an outage surface, never a statement about applications — no form", async () => {
    stubFetch({ error: "down" }, false, 503);
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain(DA.notAcceptingTitle);
    expect(container.querySelector("form")).toBeNull();
    await unmount();
  });

  it("a malformed 2xx posting never reaches a form either", async () => {
    stubFetch({ job: { ...detail(), location: 42 }, source: "db" });
    const { container, unmount } = await mount(ui());
    await settle();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector("form")).toBeNull();
    await unmount();
  });
});

describe("B1.3 — the retired vocabulary cannot return, and the UI cannot bypass the server", () => {
  const RETIRED = ["coverLetter", "totalYearsExp", "workAuthorization"];

  it("no retired payload key appears in the apply surface or the contract", () => {
    for (const rel of [
      "src/components/careers/ApplyFormClient.tsx",
      "src/components/careers/stage1-contract.ts",
    ]) {
      const src = readCode(rel);
      for (const key of RETIRED) expect(src, `${rel} :: ${key}`).not.toContain(key);
    }
    // The form reads i18n leaves named `coverLetter…` (labels only); it must
    // never carry a retired key as a PAYLOAD key or a state key.
    const form = readCode("src/components/careers/Stage1ApplicationForm.tsx");
    for (const key of RETIRED) {
      expect(form, key).not.toMatch(new RegExp(`["'\`]${key}["'\`]|\\b${key}\\s*:`));
    }
    expect(form).not.toMatch(/"citizen"|workAuth/);
  });

  it("only the Stage-1 form posts to /api/careers/apply — the verification shell never does", () => {
    expect(readCode("src/components/careers/ApplyFormClient.tsx")).not.toContain("/api/careers/apply");
    const form = readCode("src/components/careers/Stage1ApplicationForm.tsx");
    expect(form.match(/\/api\/careers\/apply/g) ?? []).toHaveLength(1);
    expect(form).toContain("STAGE1_IDEMPOTENCY_HEADER");
    expect(form).toContain('credentials: "same-origin"');
    // nothing about the applicant is persisted or logged in the browser
    expect(form).not.toMatch(/console\.(log|error|warn|info|debug)/);
    expect(form).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
  });

  it("the UI cannot bypass the server — the route still applies BOTH gates before any write", async () => {
    // the route's own source pins BOTH gates ahead of every write path; the
    // organization's intake switch and the secret are proven behaviourally in
    // ats-b2-apply-orchestration.test.ts, the kill switch in
    // ats-stage1-gate-closed.test.tsx and the orchestration suite.
    const route = readCode("src/app/api/careers/apply/route.ts");
    expect(route).toContain("if (!APPLICATION_ACCEPTANCE_AUTHORIZED)");
    expect(route).toContain("await isRetentionPolicyApproved(organizationId)");
    expect(APPLICATION_ACCEPTANCE_AUTHORIZED).toBe(true);
  });
});

describe("B1.3 — the Stage-1 contract is exact and testable", () => {
  const filled = (over: Partial<Stage1FormState> = {}): Stage1FormState => ({
    ...STAGE1_INITIAL_FORM,
    fullName: " Jane Doe ",
    email: " jane@example.org ",
    phone: " +98 912 000 0000 ",
    currentLocation: " Isfahan ",
    yearsExperience: "12",
    keySkills: " PLC , SCADA ,, ",
    resumeText: " CV ",
    fitStatement: " fit ",
    linkedinUrl: " https://example.org/in/jane ",
    privacyNoticeAcknowledged: true,
    accuracyConfirmed: true,
    ...over,
  });

  it("both confirmations start UNCHECKED — a pre-ticked box is not an acknowledgement", () => {
    expect(STAGE1_INITIAL_FORM.privacyNoticeAcknowledged).toBe(false);
    expect(STAGE1_INITIAL_FORM.accuracyConfirmed).toBe(false);
    expect(STAGE1_INITIAL_FORM.futureOpeningsConsent).toBe(false);
  });

  it("a complete form builds a payload the SERVER schema accepts", () => {
    const payload = buildStage1Payload("job-1", filled());
    expect(payload).not.toBeNull();
    const parsed = stage1ApplicationSchema.safeParse(payload);
    expect(parsed.success, JSON.stringify(parsed.success ? {} : parsed.error.issues)).toBe(true);
    expect(payload!.keySkills).toEqual(["PLC", "SCADA"]);
    expect(payload!.yearsExperience).toBe(12);
    expect(payload!.fullName).toBe("Jane Doe");
  });

  it("refuses to build without EITHER confirmation — the client cannot post a half-formed application", () => {
    expect(buildStage1Payload("job-1", filled({ privacyNoticeAcknowledged: false }))).toBeNull();
    expect(buildStage1Payload("job-1", filled({ accuracyConfirmed: false }))).toBeNull();
    expect(buildStage1Payload("", filled())).toBeNull();
    expect(buildStage1Payload("job-1", filled({ email: "  " }))).toBeNull();
  });

  it("optional future-openings consent is sent only when actually given", () => {
    expect(buildStage1Payload("job-1", filled())!.futureOpeningsConsent).toBeUndefined();
    expect(buildStage1Payload("job-1", filled({ futureOpeningsConsent: true }))!.futureOpeningsConsent).toBe(true);
  });

  it("mints a per-submission idempotency key the server's FORMAT validator accepts", async () => {
    const { validateIdempotencyKey } = await import("@/lib/ats/idempotency");
    const keys = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const k = newIdempotencyKey();
      expect(validateIdempotencyKey(k), k).toEqual({ ok: true });
      expect(k).toMatch(/^[A-Za-z0-9_-]{22,128}$/);
      keys.add(k);
    }
    // per-SUBMISSION: 25 draws, 25 distinct values
    expect(keys.size).toBe(25);
    // Web Crypto, and never persisted or logged by the module
    const src = readCode("src/components/careers/stage1-contract.ts");
    expect(src).toContain("crypto.getRandomValues");
    expect(src).not.toMatch(/console\.(log|error|warn|info|debug)/);
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });
});
