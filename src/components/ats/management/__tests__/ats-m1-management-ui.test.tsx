// @vitest-environment jsdom
/**
 * ATS-M1 — the management UI, rendered for real in Persian and English with
 * the real message catalogues, against a stubbed fetch.
 *
 * What is pinned: an unauthorized reader sees a permission MESSAGE (not a
 * broken screen); an empty organization shows a visible "Create your first
 * position" for authorized users only; actions an actor cannot use are
 * disabled, not missing; the safe-delete confirmation shows the linked
 * application count and cannot be confirmed without a reason; the settings
 * page shows configured / missing and never a value; and every mutation
 * carries the page's organization and a fresh Idempotency-Key.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { mount, click } from "@/components/ds/__tests__/_render";
import fa from "../../../../../messages/fa.json";
import en from "../../../../../messages/en.json";

vi.mock("@/i18n/navigation", async () => {
  const { useLocale } = await import("next-intl");
  return {
    Link: ({ href, children, ...rest }: { href: string; children?: ReactNode } & Record<string, unknown>) => {
      const locale = useLocale();
      return (
        <a href={`/${locale}${href}`} {...rest}>
          {children}
        </a>
      );
    },
    useRouter: () => ({ push: vi.fn() }),
  };
});

import { PositionsManagerClient } from "../PositionsManagerClient";
import { AtsSettingsClient } from "../AtsSettingsClient";
import { atsMutate } from "../client-api";

type Catalog = typeof fa;
const M = (c: Catalog) => (c as unknown as { ats: { mgmt: Record<string, Record<string, unknown>> } }).ats.mgmt;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": "corr-test-1" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function render(ui: ReactNode, locale: "fa" | "en") {
  const messages = (locale === "fa" ? fa : en) as never;
  const wrap = (node: ReactNode) => (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>
  );
  const m = await mount(wrap(ui));
  for (let i = 0; i < 3; i++) await m.rerender(wrap(ui)); // flush the load promise
  return m;
}

const viewer = (canManage: boolean, canAdmin: boolean) => ({ role: canAdmin ? "HR_MANAGER" : canManage ? "RECRUITER" : "INTERVIEWER", canManage, canAdmin });

describe("Positions — every state is a controlled, localized state", () => {
  it.each(["fa", "en"] as const)("%s: a 403 shows the permission message, not a broken or missing screen", async (locale) => {
    fetchMock.mockResolvedValue(reply(403, { code: "FORBIDDEN" }));
    const { container, unmount } = await render(<PositionsManagerClient />, locale);
    const cat = locale === "fa" ? fa : en;
    expect(container.textContent).toContain(M(cat).permission.title as string);
    expect(container.textContent).toContain(M(cat).permission.viewRequired as string);
    expect(container.querySelector('a[href$="/dashboard/ats/jobs/new"]')).toBeNull();
    await unmount();
  });

  it.each(["fa", "en"] as const)("%s: an empty organization shows a visible “Create your first position” for an authorized user", async (locale) => {
    fetchMock.mockResolvedValue(reply(200, { positions: [], nextCursor: null, viewer: viewer(true, true) }));
    const { container, unmount } = await render(<PositionsManagerClient />, locale);
    const cat = locale === "fa" ? fa : en;
    const createFirst = [...container.querySelectorAll("a")].find((a) => a.textContent === (M(cat).empty.createFirst as string));
    expect(createFirst, "create-first link").toBeDefined();
    expect(createFirst!.getAttribute("href")).toBe(`/${locale}/dashboard/ats/jobs/new`);
    expect(container.textContent).toContain(M(cat).empty.title as string);
    await unmount();
  });

  it("a read-only viewer gets no create-first action; create, settings and initial drafts are DISABLED with the reason", async () => {
    fetchMock.mockResolvedValue(reply(200, { positions: [], nextCursor: null, viewer: viewer(false, false) }));
    const { container, unmount } = await render(<PositionsManagerClient />, "en");
    expect(container.textContent).not.toContain(M(en).empty.createFirst as string);
    const buttons = [...container.querySelectorAll("button")];
    for (const label of [M(en).actions.CREATE, M(en).actions.SETTINGS, M(en).initial.button] as string[]) {
      const b = buttons.find((x) => x.textContent === label);
      expect(b, label).toBeDefined();
      expect(b!.disabled, label).toBe(true);
      expect(b!.getAttribute("title")).toBeTruthy();
    }
    await unmount();
  });

  it("each row offers exactly the actions the server allowed; Delete opens a confirmation with the linked count that needs a reason", async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        positions: [
          {
            id: "job-1",
            requisitionKey: "REQ-1",
            status: "CLOSED",
            isPublic: false,
            publishedAt: null,
            publicTitle: "Backend Developer",
            internalTitle: "Backend",
            titleEn: "Backend Developer",
            titleFa: "توسعه‌دهندهٔ بک‌اند",
            department: "Engineering",
            location: "Tehran",
            applicationCount: 7,
            version: 3,
            actions: { transitions: ["REOPEN", "ARCHIVE"], canEdit: true, canDelete: true },
          },
        ],
        nextCursor: null,
        viewer: viewer(true, true),
      }),
    );
    const { container, unmount } = await render(<PositionsManagerClient />, "fa");
    const text = container.textContent ?? "";
    expect(text).toContain("توسعه‌دهندهٔ بک‌اند");
    const buttonLabels = [...container.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttonLabels).toContain(M(fa).actions.REOPEN as string);
    expect(buttonLabels).toContain(M(fa).actions.ARCHIVE as string);
    expect(buttonLabels).not.toContain(M(fa).actions.PUBLISH as string);
    expect(buttonLabels).not.toContain(M(fa).actions.PAUSE as string);

    const del = [...container.querySelectorAll("button")].find((b) => b.textContent === (M(fa).actions.DELETE as string))!;
    await click(del);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain("7");
    expect(dialog!.textContent).toContain(M(fa).feedback.reasonRequired as string);
    const confirm = [...dialog!.querySelectorAll("button")].find((b) => b.textContent === (M(fa).actions.DELETE as string))!;
    expect(confirm.disabled).toBe(true); // no reason yet
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing was sent
    await unmount();
  });
});

const view = (admin: boolean) => ({
  view: {
    settings: {
      defaultDecisionSlaDays: null,
      defaultInterviewStages: [],
      defaultApprovalOwnerRole: null,
      aiProviderMode: "deterministic",
      externalAiProcessingEnabled: false,
      minimumConfidence: null,
      reviewAlertsEnabled: false,
      interviewRemindersEnabled: false,
      slaBreachAlertsEnabled: false,
      publicListingEnabled: true,
      applicationIntakeEnabled: false,
      defaultPublicLocale: "fa",
      retentionPolicyId: null,
      version: 0,
      exists: false,
    },
    locked: { humanApprovalRequired: true, evidenceRequired: true, retentionAction: "ANONYMISE", pipeline: ["APPLIED", "AI_REVIEW_PENDING", "PENDING_HUMAN_APPROVAL"] },
    ai: { effectiveExternalProcessing: false, versions: { extractor: "x1", rubric: "r1", prompt: "p1", policy: "g1" } },
    retention: { selectedPolicyId: null, policies: [] },
    security: admin
      ? {
          items: [
            { name: "RECRUITMENT_IDEMPOTENCY_SECRET", state: "CONFIGURED" },
            { name: "ATS_REVIEW_WORKER_TOKEN", state: "MISSING" },
          ],
          applicationAcceptanceAuthorized: false,
          deploymentProviderMode: "deterministic",
        }
      : null,
    viewer: { canManage: true, canAdmin: admin },
  },
});

describe("Settings — secrets are never displayed; admin-only sections are locked for others", () => {

  it("an ATS admin sees configured / missing, never a value, and no input for a secret", async () => {
    fetchMock.mockResolvedValue(reply(200, view(true)));
    const { container, unmount } = await render(<AtsSettingsClient />, "en");
    const S = (M(en).settings as unknown as { security: { states: Record<string, string> } }).security;
    expect(container.textContent).toContain("RECRUITMENT_IDEMPOTENCY_SECRET");
    expect(container.textContent).toContain(S.states.CONFIGURED);
    expect(container.textContent).toContain(S.states.MISSING);
    const inputs = [...container.querySelectorAll("input")].map((i) => `${i.name} ${i.getAttribute("aria-label") ?? ""}`);
    expect(inputs.join(" ")).not.toMatch(/secret|token|password|api.?key/i);
    await unmount();
  });

  it("a non-admin sees the AI and public-intake controls disabled and the security section restricted", async () => {
    fetchMock.mockResolvedValue(reply(200, view(false)));
    const { container, unmount } = await render(<AtsSettingsClient />, "fa");
    const settings = M(fa).settings as unknown as { ai: { external: string }; careers: { intake: string }; security: { restricted: string } };
    for (const label of [settings.ai.external, settings.careers.intake]) {
      const sw = container.querySelector(`[role="switch"][aria-label="${label}"]`) as HTMLButtonElement | null;
      expect(sw, label).not.toBeNull();
      expect(sw!.disabled, label).toBe(true);
    }
    expect(container.textContent).toContain(settings.security.restricted);
    await unmount();
  });
});

describe("Settings — retention form (second review)", () => {
  const policies = [
    { id: "rp-a", name: "A", retentionDays: 365, retentionTrigger: "CREATION", action: "ANONYMISE", approvalState: "APPROVED", enabled: true, dryRunOnly: true, effectiveFrom: null },
    { id: "rp-b", name: "B", retentionDays: 90, retentionTrigger: "LAST_ACTIVITY", action: "ANONYMISE", approvalState: "PENDING_REVIEW", enabled: false, dryRunOnly: true, effectiveFrom: "2026-12-01T00:00:00.000Z" },
  ];
  const adminView = () => {
    const v = view(true) as { view: Record<string, unknown> };
    return {
      view: {
        ...v.view,
        retention: { selectedPolicyId: "rp-a", policies },
        viewer: { canManage: true, canAdmin: true, canApproveRetention: true },
      },
    };
  };
  const setSelect = async (el: HTMLSelectElement, value: string) => {
    const { act } = await import("react");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  it("choosing another policy loads ALL of its values; “create new” starts from a clean proposal", async () => {
    fetchMock.mockResolvedValue(reply(200, adminView()));
    const { container, unmount } = await render(<AtsSettingsClient />, "en");
    const selects = [...container.querySelectorAll("select")];
    const policySelect = selects.find((s) => [...s.options].some((o) => o.value === "rp-b"))!;
    const triggerSelect = selects.find((s) => [...s.options].some((o) => o.value === "LAST_ACTIVITY"))!;
    const approvalSelect = selects.find((s) => [...s.options].some((o) => o.value === "APPROVED"))!;
    const dateInputs = () => [...container.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    expect(policySelect.value).toBe("rp-a");
    expect(triggerSelect.value).toBe("CREATION");
    expect(approvalSelect.value).toBe("APPROVED");

    await setSelect(policySelect, "rp-b");
    expect(triggerSelect.value).toBe("LAST_ACTIVITY");
    expect(approvalSelect.value).toBe("PENDING_REVIEW");
    expect(dateInputs().map((i) => i.value)).toContain("2026-12-01");

    await setSelect(policySelect, "");
    expect(triggerSelect.value).toBe("CREATION");
    expect(approvalSelect.value).toBe("PENDING_REVIEW");
    expect(dateInputs().map((i) => i.value)).not.toContain("2026-12-01");
    await unmount();
  });
});

describe("the mutation client", () => {
  it("sends the page's organization, a fresh Idempotency-Key per action and same-origin credentials", async () => {
    document.body.setAttribute("data-hermes-organization", "org-A");
    fetchMock.mockResolvedValue(reply(201, { jobId: "job-1", correlationId: "corr-1" }));
    await atsMutate("/api/ats/jobs", "POST", { a: 1 });
    await atsMutate("/api/ats/jobs", "POST", { a: 1 });
    const [first, second] = fetchMock.mock.calls.map((c) => new Headers((c[1] as RequestInit).headers));
    expect(first.get("x-hermes-organization")).toBe("org-A");
    expect(first.get("idempotency-key")).toMatch(/^ui-/);
    expect(first.get("idempotency-key")).not.toBe(second.get("idempotency-key"));
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe("same-origin");
    document.body.removeAttribute("data-hermes-organization");
  });

  it("a refusal resolves with its code and correlation id — it never throws or goes silent", async () => {
    fetchMock.mockResolvedValue(reply(422, { code: "NOT_READY", correlationId: "corr-9", missing: ["SLA_MISSING"] }));
    const r = await atsMutate("/api/ats/jobs/x/transition", "POST", {});
    expect(r).toMatchObject({ ok: false, status: 422, code: "NOT_READY", correlationId: "corr-9" });
    fetchMock.mockRejectedValue(new TypeError("network down"));
    expect(await atsMutate("/api/ats/jobs", "POST", {})).toMatchObject({ ok: false, code: "OFFLINE" });
  });
});
