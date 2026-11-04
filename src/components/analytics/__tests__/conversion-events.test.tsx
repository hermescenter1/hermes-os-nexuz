// @vitest-environment jsdom
/**
 * The three lead forms report a GA4 conversion — and only once the outcome is
 * real. Before this, `contact_form_submit`, `platform_demo_request` and
 * `apply_job` were defined in src/lib/analytics/events.ts but never fired, so
 * Google Analytics could not count a single lead.
 *
 * `window.gtag` is stubbed directly: trackEvent() is a no-op without it, which
 * is also what happens in production until the visitor grants analytics
 * consent (the tag is only configured after consent).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount, click } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

import { DemoRequestForm } from "@/components/sales/DemoRequestForm";
import { ContactForm } from "@/app/[locale]/contact/ContactForm";
import { Stage1ApplicationForm } from "@/components/careers/Stage1ApplicationForm";

type GtagCall = unknown[];
let gtagCalls: GtagCall[];

beforeEach(() => {
  gtagCalls = [];
  window.gtag = (...args: unknown[]) => { gtagCalls.push(args); };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { gtag?: unknown }).gtag;
});

const events = () => gtagCalls.filter((c) => c[0] === "event");
const settle = async (n = 4) => { for (let k = 0; k < n; k++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const withIntl = (node: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">{node}</NextIntlClientProvider>
);
function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body }));
  vi.stubGlobal("fetch", fn as unknown as typeof fetch);
  return fn;
}
async function submit(form: HTMLFormElement) {
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await settle();
}

describe("demo request → platform_demo_request", () => {
  it("fires once after the server confirms the lead, with no form field attached", async () => {
    stubFetch(200, { ok: true });
    const m = await mount(withIntl(<DemoRequestForm locale="en" />));
    const name = m.container.querySelector<HTMLInputElement>('input[name="fullName"]')!;
    name.value = "Jane Doe";
    await submit(m.container.querySelector("form")!);
    expect(events()).toEqual([["event", "platform_demo_request", {}]]);
    expect(JSON.stringify(gtagCalls)).not.toContain("Jane");
    await m.unmount();
  });

  it("does not fire when the server rejects the lead", async () => {
    stubFetch(422, { ok: false, error: "validation" });
    const m = await mount(withIntl(<DemoRequestForm locale="en" />));
    await submit(m.container.querySelector("form")!);
    expect(events()).toEqual([]);
    await m.unmount();
  });
});

describe("contact form → contact_form_submit", () => {
  it("records the hand-off to the mail client with the enquiry type only", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const m = await mount(withIntl(<ContactForm />));
    const form = m.container.querySelector("form")!;
    const email = form.querySelector<HTMLInputElement>('input[type="email"]');
    if (email) email.value = "jane@example.org";
    await submit(form);
    expect(open).toHaveBeenCalledTimes(1);
    expect(events()).toEqual([["event", "contact_form_submit", { category: "sales" }]]);
    expect(JSON.stringify(gtagCalls)).not.toContain("jane@example.org");
    await m.unmount();
  });
});

describe("job application → apply_job", () => {
  const ui = () => withIntl(<Stage1ApplicationForm jobId="job-1" jobTitle="Senior Accountant" locale="en" />);

  it("does not fire for a submission that fails validation and posts nothing", async () => {
    const fetchFn = stubFetch(202, { received: true, reference: "ats_AbCdEfGhIjKlMnOpQrStUv" });
    const m = await mount(ui());
    await click(m.container.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    await settle();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(events()).toEqual([]);
    await m.unmount();
  });

  async function fillValid(root: HTMLElement) {
    const a = (en as unknown as { careers: { apply: Record<string, string> & { form: Record<string, string> } } }).careers.apply;
    const byLabel = (label: string) => {
      const l = [...root.querySelectorAll("label")].find((x) => (x.textContent ?? "").trim().startsWith(label));
      return document.getElementById(l!.htmlFor) as HTMLInputElement | HTMLTextAreaElement;
    };
    const type = async (label: string, value: string) => {
      const el = byLabel(label);
      await act(async () => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await type(a.fullName, "Jane Doe");
    await type(a.emailAddress, "jane@example.org");
    await type(a.phone, "+49 30 1234567");
    await type(a.currentLocation, "Berlin");
    await type(a.yearsExperience, "7");
    await type(a.keySkills, "IFRS, financial reporting");
    await type(a.resume, "Seven years in group accounting.");
    await type(a.coverLetterSection, "I want to build the finance function.");
    await type(a.form.linkedin, "https://www.linkedin.com/in/jane-doe");
    const [privacy, accuracy] = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await click(privacy);
    await click(accuracy);
  }

  it("fires apply_job after the server confirms receipt, with the public job id and title only", async () => {
    stubFetch(202, { received: true, reference: "ats_AbCdEfGhIjKlMnOpQrStUv" });
    const m = await mount(ui());
    await fillValid(m.container);
    await click(m.container.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    await settle(6);
    expect(events()).toEqual([["event", "apply_job", { item_id: "job-1", item_name: "Senior Accountant" }]]);
    const sent = JSON.stringify(gtagCalls);
    for (const pii of ["Jane", "jane@example.org", "1234567", "Berlin", "linkedin"]) expect(sent).not.toContain(pii);
    await m.unmount();
  });

  it("does not fire when the server does not confirm receipt", async () => {
    stubFetch(503, {});
    const m = await mount(ui());
    await fillValid(m.container);
    await click(m.container.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    await settle(6);
    expect(events()).toEqual([]);
    await m.unmount();
  });
});
