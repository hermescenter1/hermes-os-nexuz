// @vitest-environment jsdom
/**
 * The two admin review surfaces, rendered for real through next-intl.
 *
 * The reported defect was that demo/sales requests had NO admin controls at
 * all, so the load-bearing assertions here are the ones that prove a demo lead
 * card renders operational buttons and that pressing one actually calls the
 * sales endpoint — plus the boundary assertion that it never calls the account
 * invitation API, which is the dangerous confusion these two surfaces invite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { mount, click } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { SalesLeadActions }     from "../SalesLeadActions";
import { AccessRequestActions } from "../AccessRequestActions";

type FetchCall = { url: string; init: RequestInit | undefined };
let calls: FetchCall[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };

// Lookup tables rather than `locale === "fa" ? …` ternaries: the admin-scope
// i18n gate (src/i18n/__tests__/admin-extraction.test.ts) bans that shape
// anywhere under src/components/admin, tests included.
const CATALOG = { en, fa } as const;
const DIRECTION = { en: "ltr", fa: "rtl" } as const;

function withIntl(ui: React.ReactNode, locale: "en" | "fa" = "en") {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={CATALOG[locale] as never}
      timeZone="UTC"
    >
      <div dir={DIRECTION[locale]}>{ui}</div>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  calls = [];
  reply = { status: 200, body: {} };
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    } as unknown as Response;
  });
});

afterEach(() => vi.unstubAllGlobals());

const buttons = (c: HTMLElement) => [...c.querySelectorAll("button")];
const labels  = (c: HTMLElement) => buttons(c).map((b) => (b.textContent ?? "").trim());

// ── The reported defect ──────────────────────────────────────────────────────

describe("demo / sales lead card exposes operational controls", () => {
  it("renders the review actions for a NEW lead", async () => {
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="NEW" />),
    );
    expect(labels(container)).toEqual(["Mark reviewed", "Reject"]);
    // The current state is spelled out, not signalled by colour alone.
    expect(container.textContent).toContain("Current status");
    expect(container.textContent).toContain("New");
    await unmount();
  });

  it("offers exactly the allowed next steps at each stage", async () => {
    for (const [status, expected] of [
      ["NEW",       ["Mark reviewed", "Reject"]],
      ["REVIEWED",  ["Mark contacted", "Reject"]],
      ["CONTACTED", ["Approve demo", "Reject"]],
      ["APPROVED",  ["Close lead"]],
    ] as const) {
      const { container, unmount } = await mount(
        withIntl(<SalesLeadActions leadId="l1" initialStatus={status} />),
      );
      expect(labels(container), status).toEqual([...expected]);
      await unmount();
    }
  });

  it("offers no action on a terminal lead and says why", async () => {
    for (const status of ["REJECTED", "CLOSED"]) {
      const { container, unmount } = await mount(
        withIntl(<SalesLeadActions leadId="l1" initialStatus={status} />),
      );
      expect(buttons(container), status).toHaveLength(0);
      expect(container.textContent).toContain("No further action is available");
      await unmount();
    }
  });

  it("degrades safely on an unrecognised legacy status", async () => {
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="LEGACY" />),
    );
    expect(buttons(container)).toHaveLength(0);
    expect(container.textContent).toContain("LEGACY");
    await unmount();
  });
});

// ── Behaviour ────────────────────────────────────────────────────────────────

describe("demo lead actions behave operationally", () => {
  it("PATCHes the sales endpoint with the expected-status concurrency token", async () => {
    reply = { status: 200, body: { ok: true, status: "REVIEWED" } };
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="lead-9" initialStatus="NEW" />),
    );
    await click(buttons(container)[0]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/admin/sales/leads/lead-9");
    expect(calls[0].init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      status: "REVIEWED",
      expectedStatus: "NEW",
    });
    await unmount();
  });

  it("reflects the new state immediately, with no page reload", async () => {
    reply = { status: 200, body: { ok: true, status: "REVIEWED" } };
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="NEW" />),
    );
    await click(buttons(container)[0]);
    expect(container.textContent).toContain("Reviewed");
    // The control set advances to the next stage.
    expect(labels(container)).toEqual(["Mark contacted", "Reject"]);
    await unmount();
  });

  it("shows a visible error and keeps the old state when the call fails", async () => {
    reply = { status: 500, body: { error: "service_unavailable" } };
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="NEW" />),
    );
    await click(buttons(container)[0]);
    expect(container.textContent).toContain("Action failed");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(labels(container)).toEqual(["Mark reviewed", "Reject"]);
    await unmount();
  });

  it("resyncs to the server's truth on a stale-state conflict", async () => {
    reply = { status: 409, body: { error: "stale_state", currentStatus: "REJECTED" } };
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="NEW" />),
    );
    await click(buttons(container)[0]);
    expect(container.textContent).toContain("already updated by another administrator");
    // Adopted the newer decision instead of offering to overwrite it.
    expect(container.textContent).toContain("Rejected");
    expect(buttons(container)).toHaveLength(0);
    await unmount();
  });

  it("surfaces a network failure as an error rather than a silent no-op", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("offline"); });
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="NEW" />),
    );
    await click(buttons(container)[0]);
    expect(container.textContent).toContain("Action failed");
    await unmount();
  });

  it("disables every control while a request is in flight", async () => {
    // A gate the test opens, so the busy state can be observed mid-flight.
    // NOTE: the second click below is a RAW DOM click on purpose — going
    // through `click()` would open a nested act() scope inside the still-open
    // one from the first click, which React 19 refuses and which leaves the
    // renderer unusable for every later test in the file.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      await gate;
      return { ok: true, status: 200, json: async () => ({ ok: true, status: "REVIEWED" }) } as unknown as Response;
    });
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="NEW" />),
    );
    const [first, second] = buttons(container);
    const inFlight = click(first);
    await new Promise((r) => setTimeout(r, 0));

    expect(buttons(container).every((b) => b.disabled)).toBe(true);
    expect(first.getAttribute("aria-busy")).toBe("true");

    // A second press during flight must not produce a second request.
    second.click();
    expect(calls).toHaveLength(1);

    // `click()`'s act scope covers only the event dispatch, not the async
    // handler's continuation — so settle it first, then open the gate and give
    // the resulting state update its own act scope. Sequential, never nested.
    await inFlight;
    release();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(container.textContent).toContain("Reviewed");
    await unmount();
  });
});

// ── Accessibility / localisation ─────────────────────────────────────────────

describe("controls are accessible and localised", () => {
  it("uses native keyboard-reachable buttons with real text labels", async () => {
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="CONTACTED" />),
    );
    for (const b of buttons(container)) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("type")).toBe("button");
      expect((b.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
    await unmount();
  });

  it("renders Persian labels under the fa catalog", async () => {
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="CONTACTED" />, "fa"),
    );
    const text = container.textContent ?? "";
    expect(text).toContain(fa.adminOperations.leads.action.APPROVED);
    expect(text).toContain(fa.adminOperations.leads.status.CONTACTED);
    // No English carryover leaked into the Persian surface.
    expect(text).not.toContain("Approve demo");
    await unmount();
  });

  it("states that approval is commercial only, not product access", async () => {
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="APPROVED" />),
    );
    expect(container.textContent).toContain("does not grant Hermes OS account access");
    await unmount();
  });
});

// ── The security boundary between the two surfaces ───────────────────────────

describe("demo approval is never account approval", () => {
  it("never calls the access-request invite API, at any stage", async () => {
    for (const [status, body] of [
      ["NEW",       { ok: true, status: "REVIEWED" }],
      ["REVIEWED",  { ok: true, status: "CONTACTED" }],
      ["CONTACTED", { ok: true, status: "APPROVED" }],
      ["APPROVED",  { ok: true, status: "CLOSED" }],
    ] as const) {
      reply = { status: 200, body };
      const { container, unmount } = await mount(
        withIntl(<SalesLeadActions leadId="l1" initialStatus={status} />),
      );
      await click(buttons(container)[0]);
      await unmount();
    }
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c.url).toBe("/api/admin/sales/leads/l1");
      expect(c.url).not.toContain("access-requests");
    }
  });

  it("shows no invite-link surface anywhere in the demo workflow", async () => {
    reply = { status: 200, body: { ok: true, status: "APPROVED" } };
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="CONTACTED" />),
    );
    await click(buttons(container)[0]);
    const text = container.textContent ?? "";
    expect(text).not.toContain("Invite created");
    expect(text).not.toContain("Copy invite link");
    expect(text).not.toContain("accept-invite");
    await unmount();
  });

  it("offers no role selector — a demo decision grants no role", async () => {
    const { container, unmount } = await mount(
      withIntl(<SalesLeadActions leadId="l1" initialStatus="CONTACTED" />),
    );
    expect(container.querySelectorAll("select")).toHaveLength(0);
    await unmount();
  });
});

// ── The existing access-request surface is untouched ─────────────────────────

describe("access-request controls still work as before", () => {
  it("still renders the role selector plus approve and reject", async () => {
    const { container, unmount } = await mount(
      withIntl(<AccessRequestActions leadId="a1" initialStatus="NEW" />),
    );
    expect(labels(container)).toEqual(["Approve", "Reject"]);
    expect(container.querySelectorAll("select")).toHaveLength(1);
    await unmount();
  });

  it("still posts to the invite endpoint and reveals the one-time link", async () => {
    reply = { status: 200, body: { ok: true, inviteUrl: "https://h.test/en/auth/accept-invite?token=t" } };
    const { container, unmount } = await mount(
      withIntl(<AccessRequestActions leadId="a1" initialStatus="NEW" />),
    );
    await click(buttons(container)[0]);
    expect(calls[0].url).toBe("/api/admin/access-requests/a1/approve");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ role: "customer" });
    expect(container.textContent).toContain("Invite created");
    await unmount();
  });

  it("still rejects through the reject endpoint", async () => {
    reply = { status: 200, body: { ok: true } };
    const { container, unmount } = await mount(
      withIntl(<AccessRequestActions leadId="a1" initialStatus="NEW" />),
    );
    await click(buttons(container)[1]);
    expect(calls[0].url).toBe("/api/admin/access-requests/a1/reject");
    expect(container.textContent).toContain("Rejected");
    await unmount();
  });

  it("never calls the sales workflow endpoint", async () => {
    reply = { status: 200, body: { ok: true } };
    const { container, unmount } = await mount(
      withIntl(<AccessRequestActions leadId="a1" initialStatus="NEW" />),
    );
    await click(buttons(container)[0]);
    for (const c of calls) expect(c.url).not.toContain("/api/admin/sales/");
    await unmount();
  });
});

// ── Page wiring (the server component is async; assert its source contract) ──

describe("admin leads page wires each section to its own workflow", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/[locale]/admin/leads/page.tsx"),
    "utf8",
  );

  it("classifies on the source tag the auth route actually writes", () => {
    expect(page).toContain('l.source === "AUTH_ACCESS_REQUEST"');
    const authRoute = readFileSync(
      join(process.cwd(), "src/app/api/auth/access-request/route.ts"),
      "utf8",
    );
    expect(authRoute).toContain('source:    "AUTH_ACCESS_REQUEST"');
  });

  it("gives the access section the invitation surface and the sales section the commercial one", () => {
    expect(page).toContain('<LeadCard key={lead.id} lead={lead} workflow="access" />');
    expect(page).toContain('<LeadCard key={lead.id} lead={lead} workflow="sales" />');
    expect(page).toMatch(/workflow === "access"[\s\S]*AccessRequestActions[\s\S]*SalesLeadActions/);
  });

  it("no longer renders a demo lead card without an action surface", () => {
    // The defect shape: a LeadCard with neither workflow nor actions.
    expect(page).not.toMatch(/<LeadCard key=\{lead\.id\} lead=\{lead\} \/>/);
    expect(page).not.toContain("actions?: boolean");
  });

  it("makes the collapsed card advertise that it opens onto the review controls", () => {
    // The controls live inside <details>; a bare chevron was why they read as
    // absent, so the summary must carry a text affordance too.
    expect(page).toContain('t("openReview")');
    expect(page).toContain('t("closeReview")');
  });

  it("keeps the page behind the admin capability gate", () => {
    expect(page).toContain('<RequireCapability capability="admin">');
  });
});
