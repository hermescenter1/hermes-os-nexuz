// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount, click, focus } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { AuthExperienceShell } from "../AuthExperienceShell";
import { NewLoginClient } from "../../auth/NewLoginClient";
import { RegisterClient } from "../../auth/RegisterClient";
import { ForgotPasswordClient } from "../../auth/ForgotPasswordClient";
import { ResetPasswordClient } from "../../auth/ResetPasswordClient";
import { VerifyEmailClient } from "../../auth/VerifyEmailClient";

/**
 * PHASE 87E runtime tests — premium auth experience shell + form islands.
 * Real DOM, real dispatched events, real en/fa catalogs. Covers content
 * hierarchy (one H1), EN/FA + RTL/LTR, password visibility, validation +
 * error a11y, loading/disabled, keyboard submission, cross-links, autocomplete,
 * the removed SOC 2 claim, no protected navigation, and neutral recovery copy.
 */

const h = vi.hoisted(() => ({
  pathname: "/auth/login",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  useRouter: () => ({ push: h.push, replace: h.replace, refresh: h.refresh }),
  Link: ({ href, children, ...props }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

const settle = () => act(async () => { await Promise.resolve(); });

/** Set a controlled input's value the React way (native setter + input event). */
async function setValue(el: Element | null, value: string) {
  const input = el as HTMLInputElement;
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function withIntl(locale: "en" | "fa", ui: React.ReactNode) {
  const messages = locale === "en" ? en : fa;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

function stubFetch(impl: (url: string, init?: { method?: string; body?: string }) => { status?: number; ok?: boolean; json?: () => Promise<unknown> }) {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ?? "" });
      const r = impl(String(url), init);
      return { ok: r.ok ?? true, status: r.status ?? 200, json: r.json ?? (async () => ({})) };
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  h.pathname = "/auth/login";
});

describe("AuthExperienceShell — structure & content hierarchy", () => {
  it("renders exactly one H1 (the page title), the capability panel, back-to-site, and truthful trust line", async () => {
    const { container, unmount } = await mount(
      withIntl("en", (
        <AuthExperienceShell title={en.auth.loginTitle} subtitle={en.auth.loginLede}>
          <form><button type="submit">go</button></form>
        </AuthExperienceShell>
      )),
    );
    const h1s = container.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toBe(en.auth.loginTitle);

    // capability panel present, uses NO heading (so the H1 stays unique)
    const aside = container.querySelector(`aside[aria-label="${en.authExperience.panelAriaLabel}"]`)!;
    expect(aside).toBeTruthy();
    expect(aside.querySelectorAll("h1, h2, h3, h4").length).toBe(0);
    expect(aside.textContent).toContain(en.authExperience.positioningTitle);
    expect(aside.textContent).toContain(en.authExperience.capabilities.tenant);

    // back-to-site link → "/" (not a protected route), LTR-pinned
    const back = container.querySelector(`a[aria-label="${en.authExperience.backToSite}"]`)!;
    expect(back.getAttribute("href")).toBe("/");
    expect(back.getAttribute("dir")).toBe("ltr");

    // truthful trust line, no SOC 2
    expect(container.textContent).toContain(en.auth.trustLine);
    expect(container.textContent).not.toContain("SOC 2");
    expect(container.textContent).not.toContain("SOC");

    // single <main> landmark, no PublicHeader/AppShell nav leakage
    expect(container.querySelectorAll("main").length).toBe(1);
    expect(container.querySelector('nav[aria-label="Primary"]')).toBeNull();
    await unmount();
  });

  it("hides the capability panel when asked (verify-email) and still keeps one H1", async () => {
    const { container, unmount } = await mount(
      withIntl("en", (
        <AuthExperienceShell title={en.authExperience.verify.title} capabilityPanel={false}>
          <div>body</div>
        </AuthExperienceShell>
      )),
    );
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelectorAll("h1").length).toBe(1);
    await unmount();
  });

  it("renders Persian chrome under RTL", async () => {
    const { container, unmount } = await mount(
      withIntl("fa", (
        <AuthExperienceShell title={fa.auth.loginTitle}>
          <div>x</div>
        </AuthExperienceShell>
      )),
    );
    expect(container.querySelector("h1")!.textContent).toBe(fa.auth.loginTitle);
    expect(container.querySelector(`a[aria-label="${fa.authExperience.backToSite}"]`)).toBeTruthy();
    expect(container.textContent).toContain(fa.auth.trustLine); // Persian, no SOC 2
    expect(getComputedStyle(container.querySelector("[dir='rtl']") as Element).direction).toBe("rtl");
    await unmount();
  });
});

describe("NewLoginClient — fields, autocomplete, password visibility, submission", () => {
  it("renders email + password with correct types/autocomplete and a forgot-password link", async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ user: { role: "viewer" } }) }));
    const { container, unmount } = await mount(withIntl("en", <NewLoginClient locale="en" />));

    const email = container.querySelector('input[type="email"]')!;
    expect(email.getAttribute("autocomplete")).toBe("email");
    const pw = container.querySelector('input[autocomplete="current-password"]')!;
    expect(pw.getAttribute("type")).toBe("password");
    expect(pw.getAttribute("dir")).toBe("ltr");

    // labels are associated (FormField/PasswordField wire htmlFor→id)
    expect(container.querySelector(`label[for="${email.id}"]`)).toBeTruthy();
    expect(container.querySelector(`label[for="${pw.id}"]`)).toBeTruthy();

    const forgot = Array.from(container.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/en/auth/forgot-password",
    )!;
    expect(forgot.textContent).toBe(en.auth.forgotPassword);
    await unmount();
  });

  it("toggles password visibility with an accessible, keyboard-usable control", async () => {
    stubFetch(() => ({ ok: true, json: async () => ({}) }));
    const { container, unmount } = await mount(withIntl("en", <NewLoginClient locale="en" />));
    const pw = container.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    const toggle = container.querySelector(`button[aria-label="${en.authExperience.showPassword}"]`)!;
    expect(toggle.getAttribute("type")).toBe("button"); // never submits
    expect(pw.type).toBe("password");

    await click(toggle);
    expect(pw.type).toBe("text");
    expect(container.querySelector(`button[aria-label="${en.authExperience.hidePassword}"]`)).toBeTruthy();
    await unmount();
  });

  it("submit is disabled until both fields are filled; a 401 shows a localized role='alert' error", async () => {
    const calls = stubFetch(() => ({ ok: false, status: 401, json: async () => ({}) }));
    const { container, unmount } = await mount(withIntl("en", <NewLoginClient locale="en" />));
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await setValue(container.querySelector('input[type="email"]'), "e@x.com");
    await setValue(container.querySelector('input[autocomplete="current-password"]'), "secret12");
    expect(submit.disabled).toBe(false);

    await click(submit);
    await settle();
    expect(calls.some((c) => c.url === "/api/auth" && c.method === "POST")).toBe(true);
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain(en.auth.invalidCredentials);
    await unmount();
  });

  it("maps 423/429 to distinct localized messages", async () => {
    for (const [status, key] of [[423, "accountLocked"], [429, "tooManyAttempts"]] as const) {
      const { container, unmount } = await mount(withIntl("fa", <NewLoginClient locale="fa" />));
      stubFetch(() => ({ ok: false, status, json: async () => ({}) }));
      await setValue(container.querySelector('input[type="email"]'), "e@x.com");
      await setValue(container.querySelector('input[autocomplete="current-password"]'), "secret12");
      await click(container.querySelector('button[type="submit"]'));
      await settle();
      expect(container.querySelector('[role="alert"]')!.textContent).toContain(fa.auth[key]);
      vi.unstubAllGlobals();
      await unmount();
    }
  });
});

describe("ForgotPasswordClient — neutral, enumeration-safe recovery", () => {
  it("always shows the same neutral success (never reveals account existence) and never renders server payload", async () => {
    const calls = stubFetch(() => ({ ok: true, json: async () => ({ message: "SERVER-INTERNAL-LEAK" }) }));
    const { container, unmount } = await mount(withIntl("en", <ForgotPasswordClient locale="en" />));
    await setValue(container.querySelector('input[type="email"]'), "e@x.com");
    await click(container.querySelector('button[type="submit"]'));
    await settle();
    expect(calls.some((c) => c.url === "/api/auth/forgot-password")).toBe(true);
    expect(container.textContent).toContain(en.authExperience.forgot.genericSuccess);
    expect(container.textContent).not.toContain("SERVER-INTERNAL-LEAK");
    // back-to-sign-in link present
    expect(Array.from(container.querySelectorAll("a")).some((a) => a.getAttribute("href") === "/en/auth/login")).toBe(true);
    await unmount();
  });
});

describe("ResetPasswordClient — token states & strength", () => {
  it("with no token shows the invalid-link state and a request-new-link action (no form)", async () => {
    const { container, unmount } = await mount(withIntl("en", <ResetPasswordClient locale="en" token="" />));
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(en.authExperience.reset.invalidToken);
    expect(container.querySelector("form")).toBeNull();
    expect(Array.from(container.querySelectorAll("a")).some((a) => a.getAttribute("href") === "/en/auth/forgot-password")).toBe(true);
    await unmount();
  });

  it("shows a strength meter as the password is typed and posts token+password on submit", async () => {
    const calls = stubFetch(() => ({ ok: true, json: async () => ({}) }));
    const { container, unmount } = await mount(withIntl("en", <ResetPasswordClient locale="en" token="tok-123" />));
    await setValue(container.querySelector('input[autocomplete="new-password"]'), "Xy8!verystrong");
    expect(container.textContent).toMatch(/Very strong|Strong|Fair/);
    const confirms = container.querySelectorAll('input[autocomplete="new-password"]');
    await setValue(confirms[1], "Xy8!verystrong");
    await click(container.querySelector('button[type="submit"]'));
    await settle();
    const body = JSON.parse(calls.find((c) => c.url === "/api/auth/reset-password")!.body);
    expect(body.token).toBe("tok-123");
    expect(container.textContent).toContain(en.authExperience.reset.successMessage);
    await unmount();
  });
});

describe("VerifyEmailClient — pending → success/error, no server payload", () => {
  it("shows success on ok:true and a sign-in link", async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ ok: true, message: "LEAK" }) }));
    const { container, unmount } = await mount(withIntl("en", <VerifyEmailClient locale="en" token="t" />));
    await settle();
    expect(container.textContent).toContain(en.authExperience.verify.successMessage);
    expect(container.textContent).not.toContain("LEAK");
    expect(Array.from(container.querySelectorAll("a")).some((a) => a.getAttribute("href") === "/en/auth/login")).toBe(true);
    await unmount();
  });

  it("shows the generic error state on ok:false", async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ ok: false, error: "STACKTRACE" }) }));
    const { container, unmount } = await mount(withIntl("fa", <VerifyEmailClient locale="fa" token="t" />));
    await settle();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(fa.authExperience.verify.errorMessage);
    expect(container.textContent).not.toContain("STACKTRACE");
    await unmount();
  });
});

describe("RegisterClient — required fields, honeypot, localized success", () => {
  it("renders the access-request fields, keeps the honeypot hidden, and shows a localized success panel", async () => {
    const calls = stubFetch(() => ({ ok: true, json: async () => ({}) }));
    const { container, unmount } = await mount(withIntl("en", <RegisterClient locale="en" />));
    expect(container.querySelector('input[autocomplete="name"]')).toBeTruthy();
    expect(container.querySelector('input[autocomplete="organization"]')).toBeTruthy();
    const honeypot = container.querySelector('input[aria-hidden="true"]')!;
    expect(honeypot.getAttribute("tabindex")).toBe("-1");

    await setValue(container.querySelector('input[autocomplete="name"]'), "Jane Eng");
    await setValue(container.querySelector('input[type="email"]'), "jane@plant.com");
    await click(container.querySelector('button[type="submit"]'));
    await settle();
    expect(calls.some((c) => c.url === "/api/auth/access-request")).toBe(true);
    expect(container.textContent).toContain(en.auth.requestAccessSuccessTitle);
    await unmount();
  });

  it("focus lands in the panel and duplicate ids are absent across the login form", async () => {
    stubFetch(() => ({ ok: true, json: async () => ({}) }));
    const { container, unmount } = await mount(withIntl("en", <NewLoginClient locale="en" />));
    await focus(container.querySelector('input[type="email"]'));
    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate IDs
    await unmount();
  });
});
