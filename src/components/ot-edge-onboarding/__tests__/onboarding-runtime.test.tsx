// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount, click } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { GatewayForm } from "../GatewayForm";
import { DeviceForm } from "../DeviceForm";
import type { DeviceRow, GatewayRow } from "@/lib/ot-operations/contract";

/**
 * PHASE 94C2 — runtime behaviour of the onboarding forms.
 *
 * The subject is what the operator sees and what the browser actually PUTS ON
 * THE WIRE. `fetch` is stubbed so the exact method, headers and body can be
 * asserted; everything else is real — the payload builders, the validation, the
 * presenters and the three catalogs.
 *
 * Assertions compare against catalog VALUES rather than string literals, so a
 * missing key fails here instead of shipping a raw key to the screen.
 */

const h = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard/ot/gateways/new",
  useRouter: () => ({ push: h.push, replace: h.replace, refresh: h.refresh, prefetch: vi.fn() }),
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
  getPathname: vi.fn(),
}));

const CATALOGS = { en, fa, de } as const;
type Loc = keyof typeof CATALOGS;

function withIntl(locale: Loc, ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={CATALOGS[locale]} timeZone="UTC">
      <div dir={locale === "fa" ? "rtl" : "ltr"}>{ui}</div>
    </NextIntlClientProvider>
  );
}

const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

const PARENTS = [
  { id: "reg-1", name: "Packing line north", gatewayId: "SN-0001", siteId: "site-1" },
  { id: "reg-2", name: "Utilities block", gatewayId: "SN-0002", siteId: "site-2" },
];

const ASSETS = [
  { id: "asset-1", name: "Filler PLC", siteId: "site-1" },
  { id: "asset-2", name: "Chiller drive", siteId: "site-2" },
];

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Answers the picker, the site registry and the write endpoint. */
function stubFetch(options: {
  parents?: unknown[];
  assets?: unknown[];
  parentsStatus?: number;
  writeStatus?: number;
  writeCode?: string;
  created?: unknown;
  sites?: Array<{ id: string; name: string }>;
  record?: unknown;
  hangWrite?: boolean;
} = {}) {
  const calls: Call[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });

    if (url.startsWith("/api/industrial/sites")) {
      return { ok: true, status: 200, json: async () => ({ sites: options.sites ?? [] }) } as Response;
    }
    if (url.startsWith("/api/industrial/gateways")) {
      if (options.parentsStatus) return { ok: false, status: options.parentsStatus, json: async () => ({}) } as Response;
      return { ok: true, status: 200, json: async () => ({ gateways: options.parents ?? PARENTS }) } as Response;
    }
    if (url.startsWith("/api/industrial/assets")) {
      if (options.parentsStatus) return { ok: false, status: options.parentsStatus, json: async () => ({}) } as Response;
      return { ok: true, status: 200, json: async () => ({ assets: options.assets ?? ASSETS }) } as Response;
    }

    // An OT read (the edit loader) or an OT write.
    if (method === "GET") {
      return { ok: true, status: 200, json: async () => ({ ok: true, data: options.record }) } as Response;
    }
    if (options.hangWrite) return new Promise<Response>(() => {});
    if (options.writeStatus && options.writeStatus >= 400) {
      return {
        ok: false,
        status: options.writeStatus,
        json: async () => ({ ok: false, code: options.writeCode, message: "SERVER ENGLISH SENTENCE" }),
      } as Response;
    }
    return { ok: true, status: 201, json: async () => ({ ok: true, data: options.created }) } as Response;
  });
  vi.stubGlobal("fetch", spy);
  return { calls, spy };
}

const writeCall = (calls: Call[]) => calls.find((c) => c.method === "POST" || c.method === "PATCH");

const gatewayRow = (over: Partial<GatewayRow> = {}): GatewayRow => ({
  id: "profile-1",
  gatewayId: "reg-1",
  displayName: "Packing line north",
  siteId: "site-1",
  lifecycle: "REGISTERED",
  environment: "PRODUCTION",
  capabilities: [],
  softwareVersion: null,
  readOnlyMode: true,
  simulatorMode: false,
  disabled: false,
  signingConfigured: false,
  lastSeenAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const deviceRow = (over: Partial<DeviceRow> = {}): DeviceRow => ({
  id: "dev-1",
  siteId: "site-1",
  assetId: "asset-1",
  category: "PLC",
  lifecycle: "OPERATIONAL",
  networkZone: "CONTROL",
  safetyClass: "NON_SAFETY",
  firmwareVersion: null,
  productFamily: null,
  engineeringId: "PLC_01",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

/**
 * Find a control by its visible label.
 *
 * By label rather than by index: the site filter appears only when the options
 * span more than one site, so a positional lookup silently targets the wrong
 * control as soon as a fixture changes — which is exactly how a test starts
 * asserting something other than what it claims.
 */
function controlFor(container: HTMLElement, labelText: string): HTMLSelectElement {
  // startsWith, not equality: FormField appends a "*" marker to a required
  // label, so an exact match would silently miss every required control.
  const label = [...container.querySelectorAll("label")].find((node) =>
    (node.textContent ?? "").trim().startsWith(labelText),
  );
  if (!label) throw new Error(`no label "${labelText}"`);
  const id = label.getAttribute("for");
  // `useId` produces ids containing ":" — invalid in a CSS selector — and this
  // jsdom build has no global CSS.escape, so the lookup is done by attribute
  // rather than by selector.
  const control = [...container.querySelectorAll("select, input")].find(
    (node) => node.getAttribute("id") === id,
  );
  if (!control) throw new Error(`no control for "${labelText}"`);
  return control as HTMLSelectElement;
}

/** Choose a value in the control carrying `labelText`. */
async function choose(container: HTMLElement, labelText: string, value: string) {
  const select = controlFor(container, labelText);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitForm(container: HTMLElement) {
  const form = container.querySelector("form") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

beforeEach(() => {
  h.push.mockClear();
  h.replace.mockClear();
  h.refresh.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

/* ── Gateway registration ───────────────────────────────────────────────── */

describe("94C2 — gateway registration", () => {
  it.each(["en", "fa", "de"] as const)("%s: renders every supported field, localized", async (locale) => {
    stubFetch();
    const { container, unmount } = await mount(withIntl(locale, <GatewayForm mode="create" />));
    await settle();

    const catalog = CATALOGS[locale].otEdge.onboarding;
    const text = container.textContent ?? "";
    expect(text).toContain(catalog.gateway.parentLabel);
    expect(text).toContain(catalog.gateway.capabilitiesLabel);
    expect(text).toContain(catalog.gateway.softwareVersionLabel);
    expect(text).toContain(catalog.gateway.submitCreate);
    // Localized capability labels, not raw enum values.
    expect(text).toContain(CATALOGS[locale].otEdge.enums.gatewayCapability.PROJECT_METADATA_IMPORT);
    await unmount();
  });

  it("submits the primary key, never the hardware reference", async () => {
    const { calls } = stubFetch({ created: gatewayRow() });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();

    // The site filter is absent (each site has one option), so the parent
    // select is first.
    await choose(container, en.otEdge.onboarding.gateway.parentLabel, "reg-1");
    await submitForm(container);

    const call = writeCall(calls);
    expect(call?.method).toBe("POST");
    expect(call?.url).toBe("/api/ot/gateways");
    const body = call?.body as Record<string, unknown>;
    expect(body.gatewayId).toBe("reg-1");
    // SN-0001 is the operator-facing hardware identifier, shown but never sent.
    expect(JSON.stringify(body)).not.toContain("SN-0001");
    await unmount();
  });

  it("declares JSON, rides the session cookie and sends no tenant", async () => {
    const { calls } = stubFetch({ created: gatewayRow() });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.parentLabel, "reg-1");
    await submitForm(container);

    const call = writeCall(calls);
    // Without this header the bounded body reader answers 415 before the
    // handler is ever reached.
    expect(call?.headers["Content-Type"]).toBe("application/json");
    const body = JSON.stringify(call?.body);
    for (const forbidden of ["organizationId", "tenantId", "siteId", "userId", "role"]) {
      expect(body, `${forbidden} was sent`).not.toContain(forbidden);
    }
    await unmount();
  });

  it("refuses to submit without a parent record, and says which field", async () => {
    const { calls } = stubFetch();
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();
    await submitForm(container);

    expect(writeCall(calls)).toBeUndefined();
    expect(container.textContent).toContain(en.otEdge.onboarding.errors.required);
    // The message is associated with the control, not merely displayed.
    const invalid = container.querySelector('[aria-invalid="true"]');
    expect(invalid).not.toBeNull();
    expect(invalid?.getAttribute("aria-describedby")).toBeTruthy();
    await unmount();
  });

  it("sends the raw capability enum values that were ticked", async () => {
    const { calls } = stubFetch({ created: gatewayRow() });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.parentLabel, "reg-1");

    const boxes = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    await click(boxes[0]);
    await submitForm(container);

    const body = writeCall(calls)?.body as Record<string, unknown>;
    expect(body.capabilities).toEqual(["PROJECT_METADATA_IMPORT"]);
    await unmount();
  });

  it("offers no lifecycle control on create, because the schema has no field", async () => {
    stubFetch();
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();

    const labels = [...container.querySelectorAll("label, legend")].map((n) => n.textContent ?? "");
    expect(labels).not.toContain(en.otEdge.onboarding.gateway.lifecycleLabel);
    expect(container.textContent).toContain(en.otEdge.onboarding.gateway.lifecycleCreateNote);
    await unmount();
  });

  it("shows the record identifier on success and claims nothing more", async () => {
    stubFetch({ created: gatewayRow({ id: "profile-9" }) });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.parentLabel, "reg-1");
    await submitForm(container);

    const text = container.textContent ?? "";
    expect(text).toContain(en.otEdge.onboarding.success.gatewayTitle);
    expect(text).toContain("profile-9");
    // The outcome is announced.
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    // Registration means a record exists. Nothing else — and the copy says so
    // OUT LOUD rather than merely omitting the claim, so an operator does not
    // read "registered" as "working".
    expect(text).toContain(en.otEdge.onboarding.success.gatewayBody);
    expect(text.toLowerCase()).toContain("does not mean");

    // The denial is REMOVED before scanning, then the remainder must contain
    // none of the vocabulary. Scanning the whole string would flag the denial
    // for containing the words it exists to deny — so the assertion is "apart
    // from saying it is NOT connected, the page never mentions connectivity".
    const withoutDenial = text
      .replace(en.otEdge.onboarding.success.gatewayBody, "")
      .toLowerCase();
    for (const claim of ["connected", "online", "authenticated", "commissioned", "healthy", "telemetry", "synchron"]) {
      expect(withoutDenial, `the UI claimed "${claim}"`).not.toContain(claim);
    }
    await unmount();
  });

  it("does not navigate away before the server confirms", async () => {
    stubFetch({ created: gatewayRow() });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.parentLabel, "reg-1");
    await submitForm(container);
    // A create shows its own success panel with the identifier, rather than
    // navigating optimistically to a record that may not exist.
    expect(h.push).not.toHaveBeenCalled();
    await unmount();
  });

  it("cannot be submitted twice by a rapid second click", async () => {
    const { calls } = stubFetch({ hangWrite: true });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.parentLabel, "reg-1");

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();

    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    await unmount();
  });

  it("announces the pending state and disables the submit button", async () => {
    stubFetch({ hangWrite: true });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.parentLabel, "reg-1");
    await submitForm(container);

    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const live = [...container.querySelectorAll('[aria-live="polite"]')].map((n) => n.textContent);
    expect(live).toContain(en.otEdge.onboarding.status.submitting);
    await unmount();
  });

  it.each([
    [409, "CONFLICT", "CONFLICT"],
    [422, "VALIDATION_FAILED", "INVALID_INPUT"],
    [403, "FORBIDDEN", "FORBIDDEN"],
    [401, "UNAUTHENTICATED", "UNAUTHENTICATED"],
    [429, "RATE_LIMITED", "RATE_LIMITED"],
    [503, "TRANSIENT_FAILURE", "UNAVAILABLE"],
  ])("renders its own copy for %i and keeps the entered values", async (status, code, key) => {
    stubFetch({ writeStatus: status as number, writeCode: code as string });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.parentLabel, "reg-1");
    await submitForm(container);

    const text = container.textContent ?? "";
    expect(text).toContain((en.otEdge.onboarding.errors as Record<string, string>)[key as string]);
    // The server's own English sentence is never surfaced.
    expect(text).not.toContain("SERVER ENGLISH SENTENCE");
    // The form is still there with the choice intact, so a retry is one click.
    expect(controlFor(container, en.otEdge.onboarding.gateway.parentLabel).value).toBe("reg-1");
    await unmount();
  });

  it("blocks registration when the picker cannot be read", async () => {
    const { calls } = stubFetch({ parentsStatus: 403 });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();

    expect(container.textContent).toContain(en.otEdge.onboarding.errors.parentsTitle);
    // No form, so nothing can be submitted against an unknown parent.
    expect(container.querySelector("form")).toBeNull();
    expect(writeCall(calls)).toBeUndefined();
    await unmount();
  });

  it("distinguishes an unreadable picker from a genuinely empty one", async () => {
    stubFetch({ parents: [] });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();

    expect(container.textContent).toContain(en.otEdge.onboarding.errors.parentsEmptyTitle);
    expect(container.textContent).not.toContain(en.otEdge.onboarding.errors.parentsTitle);
    await unmount();
  });

  it("exposes no credential field or value anywhere", async () => {
    stubFetch({ created: gatewayRow() });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();

    const html = container.innerHTML;
    for (const secret of ["signingKeyRef", "ingestionId", "secretRef", "credential", "password", "privateKey", "nonce", "OT_GATEWAY_HMAC"]) {
      expect(html, `${secret} reached the DOM`).not.toContain(secret);
    }
    expect(container.querySelector('input[type="password"]')).toBeNull();
    await unmount();
  });
});

/* ── Gateway editing ────────────────────────────────────────────────────── */

describe("94C2 — gateway profile editing", () => {
  it("sends only the field that changed", async () => {
    const { calls } = stubFetch({ created: gatewayRow() });
    const record = gatewayRow({ lifecycle: "REGISTERED", environment: "PRODUCTION", softwareVersion: "1.0.0" });
    const { container, unmount } = await mount(
      withIntl("en", <GatewayForm mode="edit" recordId="profile-1" record={record} />),
    );
    await settle();

    // Selects in edit mode: environment, then lifecycle.
    await choose(container, en.otEdge.onboarding.gateway.lifecycleLabel, "ACTIVE");
    await submitForm(container);

    const call = writeCall(calls);
    expect(call?.method).toBe("PATCH");
    expect(call?.url).toBe("/api/ot/gateways/profile-1");
    expect(call?.body).toEqual({ lifecycle: "ACTIVE" });
    await unmount();
  });

  it("never resubmits an immutable or server-owned field", async () => {
    const { calls } = stubFetch({ created: gatewayRow() });
    const record = gatewayRow({ lifecycle: "ACTIVE", softwareVersion: "1.0.0" });
    const { container, unmount } = await mount(
      withIntl("en", <GatewayForm mode="edit" recordId="profile-1" record={record} />),
    );
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.lifecycleLabel, "STALE");
    await submitForm(container);

    const keys = Object.keys((writeCall(calls)?.body ?? {}) as Record<string, unknown>);
    for (const forbidden of ["id", "gatewayId", "siteId", "organizationId", "displayName", "signingConfigured", "lastSeenAt", "createdAt", "updatedAt", "disabled"]) {
      expect(keys, `${forbidden} was resubmitted`).not.toContain(forbidden);
    }
    await unmount();
  });

  it("offers no parent selector, because the link is immutable", async () => {
    stubFetch();
    const { container, unmount } = await mount(
      withIntl("en", <GatewayForm mode="edit" recordId="profile-1" record={gatewayRow()} />),
    );
    await settle();

    const labels = [...container.querySelectorAll("label")].map((n) => n.textContent ?? "");
    expect(labels).not.toContain(en.otEdge.onboarding.gateway.parentLabel);
    await unmount();
  });

  it("does nothing, and says so, when there is no change", async () => {
    const { calls } = stubFetch();
    const { container, unmount } = await mount(
      withIntl("en", <GatewayForm mode="edit" recordId="profile-1" record={gatewayRow()} />),
    );
    await settle();
    await submitForm(container);

    expect(writeCall(calls)).toBeUndefined();
    expect(container.textContent).toContain(en.otEdge.onboarding.status.unchanged);
    await unmount();
  });

  it("re-reads through the server after a confirmed update", async () => {
    stubFetch({ created: gatewayRow() });
    const { container, unmount } = await mount(
      withIntl("en", <GatewayForm mode="edit" recordId="profile-1" record={gatewayRow()} />),
    );
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.lifecycleLabel, "ACTIVE");
    await submitForm(container);

    // No record is spliced into the list; the detail page reloads from the API.
    expect(h.push).toHaveBeenCalledWith("/dashboard/ot/gateways/profile-1");
    expect(h.refresh).toHaveBeenCalled();
    await unmount();
  });

  it("renders the record-not-found state without disclosing existence", async () => {
    stubFetch({ writeStatus: 404, writeCode: "NOT_FOUND" });
    const { container, unmount } = await mount(
      withIntl("en", <GatewayForm mode="edit" recordId="profile-1" record={gatewayRow()} />),
    );
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.lifecycleLabel, "REVOKED");
    await submitForm(container);

    expect(container.textContent).toContain(en.otEdge.onboarding.errors.NOT_FOUND);
    await unmount();
  });
});

/* ── Device registration ────────────────────────────────────────────────── */

describe("94C2 — device registration", () => {
  it("submits the asset primary key and the write-side lifecycle name", async () => {
    const { calls } = stubFetch({ created: deviceRow() });
    const { container, unmount } = await mount(withIntl("en", <DeviceForm mode="create" />));
    await settle();

    await choose(container, en.otEdge.onboarding.device.parentLabel, "asset-1");
    await choose(container, en.otEdge.onboarding.device.lifecycleLabel, "OPERATIONAL");
    await submitForm(container);

    const body = writeCall(calls)?.body as Record<string, unknown>;
    expect(writeCall(calls)?.url).toBe("/api/ot/devices");
    expect(body.assetId).toBe("asset-1");
    // The DTO reads it back as `lifecycle`; the schema calls it this.
    expect(body.lifecycleState).toBe("OPERATIONAL");
    expect(body.lifecycle).toBeUndefined();
    await unmount();
  });

  it("offers no vendor, manufacturer, model or protocol field", async () => {
    stubFetch();
    const { container, unmount } = await mount(withIntl("en", <DeviceForm mode="create" />));
    await settle();

    const labels = [...container.querySelectorAll("label, legend")].map((n) => (n.textContent ?? "").toLowerCase());
    for (const forbidden of ["vendor", "manufacturer", "model", "protocol", "import source"]) {
      expect(labels.join(" "), `a ${forbidden} field was offered`).not.toContain(forbidden);
    }
    await unmount();
  });

  it("persists no fabricated placeholder for an omitted field", async () => {
    const { calls } = stubFetch({ created: deviceRow() });
    const { container, unmount } = await mount(withIntl("en", <DeviceForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.device.parentLabel, "asset-1");
    await submitForm(container);

    const body = JSON.stringify(writeCall(calls)?.body);
    for (const fabricated of ["Unknown", "Generic Device", "Default Vendor", "Standard Protocol", "N/A"]) {
      expect(body, `${fabricated} was persisted`).not.toContain(fabricated);
    }
    // An untouched optional field is omitted, not sent blank.
    const parsed = writeCall(calls)?.body as Record<string, unknown>;
    expect(parsed.engineeringId).toBeUndefined();
    expect(parsed.productFamily).toBeUndefined();
    await unmount();
  });

  it("shows the engineering identifier on success when one was recorded", async () => {
    stubFetch({ created: deviceRow({ engineeringId: "PLC_42" }) });
    const { container, unmount } = await mount(withIntl("en", <DeviceForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.device.parentLabel, "asset-1");
    await submitForm(container);

    const text = container.textContent ?? "";
    expect(text).toContain(en.otEdge.onboarding.success.deviceTitle);
    expect(text).toContain("PLC_42");
    expect(text).toContain(en.otEdge.onboarding.success.deviceBody);
    const withoutDenial = text.replace(en.otEdge.onboarding.success.deviceBody, "").toLowerCase();
    for (const claim of ["online", "connected", "commissioned", "telemetry", "healthy"]) {
      expect(withoutDenial, `the UI claimed "${claim}"`).not.toContain(claim);
    }
    await unmount();
  });

  it("falls back to the record id rather than inventing a name", async () => {
    stubFetch({ created: deviceRow({ id: "dev-77", engineeringId: null }) });
    const { container, unmount } = await mount(withIntl("en", <DeviceForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.device.parentLabel, "asset-1");
    await submitForm(container);

    expect(container.textContent).toContain("dev-77");
    expect(container.textContent).not.toContain("Unknown");
    await unmount();
  });

  it("reports a duplicate identifier as a conflict", async () => {
    stubFetch({ writeStatus: 409, writeCode: "CONFLICT" });
    const { container, unmount } = await mount(withIntl("en", <DeviceForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.device.parentLabel, "asset-1");
    await submitForm(container);

    expect(container.textContent).toContain(en.otEdge.onboarding.errors.CONFLICT);
    await unmount();
  });
});

/* ── Accessibility and hygiene ──────────────────────────────────────────── */

describe("94C2 — accessible, bidi-safe and storage-free", () => {
  it("labels every control and renders no h1 of its own", async () => {
    stubFetch();
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();

    for (const control of [...container.querySelectorAll("select, input[type='text']")]) {
      const id = control.getAttribute("id");
      expect(id, "a control has no id").toBeTruthy();
      expect(container.querySelector(`label[for="${id}"]`), `no label for ${id}`).not.toBeNull();
    }
    // The page owns the single h1.
    expect(container.querySelector("h1")).toBeNull();
    // The checkbox group is a real fieldset with a legend.
    expect(container.querySelector("fieldset > legend")).not.toBeNull();
    await unmount();
  });

  it("keeps identifiers bidi-isolated under RTL", async () => {
    stubFetch({ sites: [{ id: "site-1", name: "کارخانهٔ کرج" }] });
    const { container, unmount } = await mount(withIntl("fa", <GatewayForm mode="create" />));
    await settle();
    // The Persian label, because the Persian catalog is what is rendered.
    await choose(container, fa.otEdge.onboarding.gateway.parentLabel, "reg-1");

    const bdi = [...container.querySelectorAll("bdi")];
    expect(bdi.length).toBeGreaterThan(0);
    for (const node of bdi) expect(node.getAttribute("dir")).toBe("ltr");
    // The hardware reference is shown for recognition — isolated, and never
    // submitted.
    expect(bdi.map((n) => n.textContent)).toContain("SN-0001");
    await unmount();
  });

  it("writes no draft to browser storage", async () => {
    stubFetch();
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.parentLabel, "reg-1");

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    await unmount();
  });

  it("shows the site it will inherit, and never sends it", async () => {
    const { calls } = stubFetch({ created: gatewayRow(), sites: [{ id: "site-1", name: "Karaj plant" }] });
    const { container, unmount } = await mount(withIntl("en", <GatewayForm mode="create" />));
    await settle();
    await choose(container, en.otEdge.onboarding.gateway.parentLabel, "reg-1");

    expect(container.textContent).toContain("Karaj plant");
    expect(container.textContent).toContain(en.otEdge.onboarding.site.inherited);

    await submitForm(container);
    expect(JSON.stringify(writeCall(calls)?.body)).not.toContain("site-1");
    await unmount();
  });
});
