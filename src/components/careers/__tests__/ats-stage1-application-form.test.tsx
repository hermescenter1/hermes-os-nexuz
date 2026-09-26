// @vitest-environment jsdom
/**
 * ATS-STAGE1-FORM — the public Stage-1 application form, end to end in jsdom.
 *
 *   - renders the approved field set in English, German and Persian, with both
 *     confirmations UNCHECKED and a link to the privacy notice;
 *   - accessible validation: every error at once, an alert summary that takes
 *     focus, aria-invalid + aria-describedby on each field, nothing posted;
 *   - the submission is EXACTLY the server contract: POST, same-origin, JSON,
 *     the `idempotency-key` header in the server's format, the payload the
 *     server schema accepts;
 *   - safe retry: an unknown outcome re-sends the SAME key; an edit mints a
 *     new one;
 *   - loading: the submit control and every field are disabled, aria-busy;
 *   - success shows only "received" and the opaque reference — identical for a
 *     first submission, a replay and a duplicate — and clears the details;
 *   - refusals are generic: no reason, no duplicate hint, no AI or human
 *     decision vocabulary, and the applicant's input is kept.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount, click, type Mounted } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import { stage1ApplicationSchema } from "@/lib/ats/stage1-schema";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}));
import React from "react";
import { Stage1ApplicationForm } from "../Stage1ApplicationForm";

type Locale = "en" | "de" | "fa";
type Apply = Record<string, string> & { form: Record<string, string> & { errors: Record<string, string>; fieldNames: Record<string, string> } };
const CAT = { en, de, fa } as unknown as Record<Locale, { careers: { apply: Apply } }>;
const A = (l: Locale) => CAT[l].careers.apply;

const REFERENCE = "ats_AbCdEfGhIjKlMnOpQrStUv";

interface Call { url: string; init: RequestInit }
function stubFetch(...replies: Array<{ status: number; body?: unknown; headers?: Record<string, string> } | "network">) {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r === "network") throw new TypeError("Failed to fetch");
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Headers(r.headers ?? {}),
      json: async () => r.body ?? {},
    };
  }) as unknown as typeof fetch);
  return calls;
}

const ui = (locale: Locale = "en") => (
  <NextIntlClientProvider locale={locale} messages={CAT[locale] as never} timeZone="UTC">
    <Stage1ApplicationForm jobId="job-1" jobTitle="Senior Accountant" locale={locale} />
  </NextIntlClientProvider>
);
const settle = async (n = 3) => { for (let k = 0; k < n; k++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

function byLabel(root: HTMLElement, label: string): HTMLInputElement | HTMLTextAreaElement {
  const l = [...root.querySelectorAll("label")].find((x) => (x.textContent ?? "").trim().startsWith(label));
  if (!l) throw new Error(`no label ${label}`);
  const el = document.getElementById(l.htmlFor);
  if (!el) throw new Error(`no control for ${label}`);
  return el as HTMLInputElement | HTMLTextAreaElement;
}
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const boxes = (root: HTMLElement) => [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
const submitBtn = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('button[type="submit"]')!;

async function fillValid(m: Mounted, l: Locale = "en") {
  const a = A(l);
  await type(byLabel(m.container, a.fullName), "  Jane Doe ");
  await type(byLabel(m.container, a.emailAddress), "jane@example.org");
  await type(byLabel(m.container, a.phone), "+49 30 1234567");
  await type(byLabel(m.container, a.currentLocation), "Berlin");
  await type(byLabel(m.container, a.yearsExperience), "7");
  await type(byLabel(m.container, a.keySkills), "IFRS, financial reporting");
  await type(byLabel(m.container, a.resume), "Seven years in group accounting.");
  await type(byLabel(m.container, a.coverLetterSection), "I want to build the finance function.");
  await type(byLabel(m.container, a.form.linkedin), "https://www.linkedin.com/in/jane-doe");
  const [privacy, accuracy] = boxes(m.container);
  await click(privacy);
  await click(accuracy);
}

/** Words that would disclose a review, a decision or a prior application. */
const DISCLOSURE = [/\balready\b/i, /duplicate/i, /\bscore/i, /shortlist/i, /\breject/i, /\bapproved\b/i, /\bAI\b/, /\bhired?\b/i, /interview/i];

afterEach(() => vi.unstubAllGlobals());

describe.each(["en", "de", "fa"] as const)("renders the approved Stage-1 set (%s)", (locale) => {
  it("every field is labelled, both confirmations start UNCHECKED, and the privacy notice is linked", async () => {
    stubFetch({ status: 202 });
    const m = await mount(ui(locale));
    const a = A(locale);
    const text = m.container.textContent ?? "";
    for (const label of [a.fullName, a.emailAddress, a.phone, a.currentLocation, a.yearsExperience, a.keySkills, a.resume, a.coverLetterSection, a.form.linkedin]) {
      expect(() => byLabel(m.container, label), label).not.toThrow();
    }
    expect(text).toContain(a.form.processingNote);
    const cb = boxes(m.container);
    expect(cb).toHaveLength(3);
    expect(cb.every((b) => !b.checked)).toBe(true);
    const privacy = [...m.container.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/privacy");
    expect(privacy).toBeDefined();
    // Latin-script values stay LTR inside a Persian page
    for (const label of [a.emailAddress, a.phone, a.form.linkedin]) expect(byLabel(m.container, label).getAttribute("dir")).toBe("ltr");
    // no retired control
    expect(m.container.querySelector("select")).toBeNull();
    expect(m.container.innerHTML).not.toContain("citizen");
    await m.unmount();
  });
});

describe("accessible validation", () => {
  it("an empty submission names EVERY missing requirement, focuses the summary, marks each field — and posts nothing", async () => {
    const calls = stubFetch({ status: 202 });
    const m = await mount(ui("en"));
    await click(submitBtn(m.container));
    await settle();
    const summary = m.container.querySelector('[role="alert"]');
    expect(summary).not.toBeNull();
    const s = summary!.textContent ?? "";
    const f = A("en").form;
    for (const name of [f.fieldNames.fullName, f.fieldNames.email, f.fieldNames.privacyNoticeAcknowledged, f.fieldNames.accuracyConfirmed]) expect(s).toContain(name);
    expect(document.activeElement).toBe(summary);
    const name = byLabel(m.container, A("en").fullName);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const describedBy = name.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toMatch(/-error/);
    expect(document.getElementById(describedBy.split(" ").pop()!)?.textContent).toBe(f.errors.required);
    // optional fields are never flagged just for being empty
    expect(byLabel(m.container, A("en").phone).getAttribute("aria-invalid")).toBe("false");
    expect(calls).toHaveLength(0);
    await m.unmount();
  });

  it("gives specific messages for a bad email, a bad LinkedIn address and a non-integer years value", async () => {
    const calls = stubFetch({ status: 202 });
    const m = await mount(ui("en"));
    await fillValid(m);
    await type(byLabel(m.container, A("en").emailAddress), "not-an-email");
    await type(byLabel(m.container, A("en").form.linkedin), "linkedin.com/in/x");
    await type(byLabel(m.container, A("en").yearsExperience), "7.5");
    await click(submitBtn(m.container));
    await settle();
    const text = m.container.textContent ?? "";
    const e = A("en").form.errors;
    expect(text).toContain(e.email);
    expect(text).toContain(e.linkedin);
    expect(text).toContain(e.years);
    expect(calls).toHaveLength(0);
    await m.unmount();
  });

  it("without the two confirmations nothing is sent, even when every other field is valid", async () => {
    const calls = stubFetch({ status: 202 });
    const m = await mount(ui("en"));
    await fillValid(m);
    const [privacy, accuracy] = boxes(m.container);
    await click(privacy); // untick
    await click(submitBtn(m.container));
    await settle();
    expect(calls).toHaveLength(0);
    expect(privacy.getAttribute("aria-invalid")).toBe("true");
    expect(m.container.textContent).toContain(A("en").form.errors.notConfirmed);
    await click(privacy);
    await click(accuracy); // untick the other
    await click(submitBtn(m.container));
    await settle();
    expect(calls).toHaveLength(0);
    await m.unmount();
  });
});

describe("the submission is exactly the server contract", () => {
  it("POST, same-origin, JSON, a server-format idempotency key and a payload the server schema accepts", async () => {
    const calls = stubFetch({ status: 202, body: { received: true, reference: REFERENCE } });
    const m = await mount(ui("de"));
    await fillValid(m, "de");
    await click(submitBtn(m.container));
    await settle();
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe("/api/careers/apply?locale=de");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["idempotency-key"]).toMatch(/^[A-Za-z0-9_-]{22,128}$/);
    const body = JSON.parse(String(init.body));
    expect(stage1ApplicationSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      jobId: "job-1",
      fullName: "Jane Doe",
      email: "jane@example.org",
      phone: "+49 30 1234567",
      currentLocation: "Berlin",
      yearsExperience: 7,
      keySkills: ["IFRS", "financial reporting"],
      resumeText: "Seven years in group accounting.",
      fitStatement: "I want to build the finance function.",
      linkedinUrl: "https://www.linkedin.com/in/jane-doe",
      privacyNoticeAcknowledged: true,
      accuracyConfirmed: true,
    });
    // no identity, tenant or status is ever supplied by the client
    for (const k of ["organizationId", "userId", "status", "siteId"]) expect(body).not.toHaveProperty(k);
    await m.unmount();
  });

  it("the optional future-openings consent is sent only when ticked", async () => {
    const calls = stubFetch({ status: 202, body: { received: true, reference: REFERENCE } });
    const m = await mount(ui("en"));
    await fillValid(m);
    await click(boxes(m.container)[2]);
    await click(submitBtn(m.container));
    await settle();
    expect(JSON.parse(String(calls[0].init.body)).futureOpeningsConsent).toBe(true);
    await m.unmount();
  });

  it("while pending, the control and the fields are disabled and the form is aria-busy", async () => {
    let release: (v: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => { release = r; })) as unknown as typeof fetch);
    const m = await mount(ui("en"));
    await fillValid(m);
    await click(submitBtn(m.container));
    const form = m.container.querySelector("form")!;
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(submitBtn(m.container).disabled).toBe(true);
    expect(submitBtn(m.container).textContent).toBe(A("en").submitting);
    expect([...m.container.querySelectorAll("fieldset")].every((f) => f.disabled)).toBe(true);
    await act(async () => {
      release({ ok: true, status: 202, headers: new Headers(), json: async () => ({ received: true, reference: REFERENCE }) });
    });
    await settle();
    await m.unmount();
  });
});

describe("safe retry", () => {
  it("an unknown outcome re-sends the SAME key; an edited application gets a NEW key", async () => {
    const calls = stubFetch("network", "network", { status: 202, body: { received: true, reference: REFERENCE } });
    const m = await mount(ui("en"));
    await fillValid(m);
    await click(submitBtn(m.container));
    await settle();
    expect(m.container.textContent).toContain(A("en").form.unconfirmed);
    // the applicant's details are kept for the retry
    expect(byLabel(m.container, A("en").fullName).value).toBe("  Jane Doe ");
    await click(submitBtn(m.container));
    await settle();
    const k1 = (calls[0].init.headers as Record<string, string>)["idempotency-key"];
    const k2 = (calls[1].init.headers as Record<string, string>)["idempotency-key"];
    expect(k2).toBe(k1);
    await type(byLabel(m.container, A("en").currentLocation), "Hamburg");
    await click(submitBtn(m.container));
    await settle();
    const k3 = (calls[2].init.headers as Record<string, string>)["idempotency-key"];
    expect(k3).not.toBe(k1);
    await m.unmount();
  });
});

describe.each(["en", "de", "fa"] as const)("outcomes are honest and disclose nothing (%s)", (locale) => {
  it("success shows 'received' and the opaque reference only, and clears the details", async () => {
    stubFetch({ status: 202, body: { received: true, reference: REFERENCE } });
    const m = await mount(ui(locale));
    await fillValid(m, locale);
    await click(submitBtn(m.container));
    await settle();
    const a = A(locale);
    const status = m.container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    const text = m.container.textContent ?? "";
    expect(text).toContain(a.successTitle);
    expect(m.container.querySelector('[data-testid="application-reference"]')?.textContent).toBe(REFERENCE);
    expect(m.container.querySelector("form")).toBeNull();
    // no promise of contact or of an outcome, and nothing the applicant typed
    expect(text).not.toContain(a.successBody);
    expect(text).not.toContain("Jane Doe");
    expect(text).not.toContain("jane@example.org");
    for (const w of DISCLOSURE) expect(text).not.toMatch(w);
    await m.unmount();
  });

  it.each([
    [503, "notAcceptingNow"],
    [403, "notAcceptingNow"],
    [500, "notAcceptingNow"],
    [400, "invalidBody"],
    [413, "invalidBody"],
  ] as const)("HTTP %i → one generic message (%s), input kept, no reason disclosed", async (status, key) => {
    stubFetch({ status, body: { error: "Applications are not being accepted." } });
    const m = await mount(ui(locale));
    await fillValid(m, locale);
    await click(submitBtn(m.container));
    await settle();
    const text = m.container.textContent ?? "";
    expect(text).toContain(A(locale).form[key]);
    expect(m.container.querySelector("form")).not.toBeNull();
    expect(byLabel(m.container, A(locale).emailAddress).value).toBe("jane@example.org");
    for (const w of DISCLOSURE) expect(text).not.toMatch(w);
    await m.unmount();
  });

  it("a malformed 202 is never presented as a receipt", async () => {
    stubFetch({ status: 202, body: { received: true, reference: "<img src=x>" } });
    const m = await mount(ui(locale));
    await fillValid(m, locale);
    await click(submitBtn(m.container));
    await settle();
    expect(m.container.querySelector('[data-testid="application-reference"]')).toBeNull();
    expect(m.container.textContent).toContain(A(locale).form.unconfirmed);
    await m.unmount();
  });
});

describe("rate limiting", () => {
  it("429 with Retry-After tells the applicant roughly how long to wait", async () => {
    stubFetch({ status: 429, headers: { "retry-after": "120" } });
    const m = await mount(ui("en"));
    await fillValid(m);
    await click(submitBtn(m.container));
    await settle();
    expect(m.container.textContent).toContain("2 minutes");
    await m.unmount();
  });

  it("429 without a usable Retry-After falls back to 'later'", async () => {
    stubFetch({ status: 429, headers: { "retry-after": "soon" } });
    const m = await mount(ui("en"));
    await fillValid(m);
    await click(submitBtn(m.container));
    await settle();
    expect(m.container.textContent).toContain(A("en").form.rateLimitedUnknown);
    await m.unmount();
  });
});
