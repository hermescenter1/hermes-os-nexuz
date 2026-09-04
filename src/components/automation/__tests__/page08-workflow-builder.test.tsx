// @vitest-environment jsdom
/**
 * PAGE 08 — WorkflowBuilderClient mounted for real, against the closed
 * persistence contract.
 *
 * The server side is pinned separately in
 * src/app/api/automation/workflows/__tests__/page08-builder-persistence-contract.test.ts.
 * This file proves the builder actually SENDS what that contract can store, so
 * the two cannot drift back apart into authoring work that never lands.
 *
 * Invariants asserted here:
 *   CONDITIONS_IN_REQUEST_BODY = 1
 *   ACTIONS_IN_REQUEST_BODY    = 1
 *   ACTION_ORDER_IS_ARRAY_ORDER = 1
 *   TRIGGER_SENT_ON_UPDATE     = 1
 *   TEMPLATE_ID_SENT_ON_CREATE = 1
 *   INVALID_SUBMIT_REACHES_NETWORK = 0
 *   CLEAN_FORM_REACHES_NETWORK     = 0
 *   SECRET_VALUE_RENDERED / QUERYSTRING_RENDERED / URL_FRAGMENT_RENDERED = NO
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount, click, focus, blur } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type { WorkflowDefinitionFull, WorkflowTemplate } from "@/lib/automation/types";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { WorkflowBuilderClient } from "../WorkflowBuilderClient";

const B = en.automationOperations.builder;

type Body = Record<string, unknown>;
type Act  = { type: string; config: Record<string, unknown> };

let calls: Array<{ url: string; method: string; body: Body }> = [];

beforeEach(() => {
  calls = [];
  push.mockClear();
  refresh.mockClear();
  // jsdom has no layout, so the mobile tab-centering call is a no-op here.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), method: String(init.method), body: JSON.parse(String(init.body)) as Body });
    return { ok: true, json: async () => ({ id: "wf-new" }) } as unknown as Response;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function render(node: React.ReactNode, locale: "en" | "fa" = "en") {
  const messages = (locale === "fa" ? fa : en) as unknown as Record<string, unknown>;
  return mount(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

/** Drive a controlled React input the way a real keystroke does. */
async function setValue(el: Element | null, value: string) {
  const node = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const proto =
    node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : node instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(node, value);
    node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const tab = (c: HTMLElement, id: string) => c.querySelector(`#builder-tab-${id}`);
const byLabel = (c: HTMLElement, label: string) => c.querySelector(`[aria-label="${label}"]`);
const byText = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll("button")].find(b => b.textContent?.trim() === text) ?? null;
const saveButton = (c: HTMLElement) => {
  const buttons = [...c.querySelectorAll("button")];
  return buttons[buttons.length - 1] as HTMLButtonElement;
};
const goToReview = (c: HTMLElement) => click(tab(c, "review"));

async function save(c: HTMLElement) {
  await goToReview(c);
  await click(saveButton(c));
}

const stored: WorkflowDefinitionFull = {
  id: "wf-02",
  organizationId: null,
  name: "Customer At Risk Alert",
  description: "Health score monitoring",
  status: "ACTIVE",
  triggerType: "CRM_CUSTOMER_AT_RISK",
  templateId: "tpl-02",
  createdBy: "admin",
  updatedBy: null,
  deletedAt: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-20T00:00:00Z",
  conditions: [
    { id: "c1", workflowId: "wf-02", type: "HEALTH_SCORE_BELOW", field: null, operator: null, value: "50", logicGroup: 0, createdAt: "", updatedAt: "" },
  ],
  actions: [
    { id: "a1", workflowId: "wf-02", type: "CREATE_SUPPORT_TICKET", order: 1, config: { priority: "HIGH", title: "At risk" }, createdAt: "", updatedAt: "" },
    { id: "a2", workflowId: "wf-02", type: "CREATE_NOTIFICATION",   order: 2, config: { message: "Escalated" },              createdAt: "", updatedAt: "" },
  ],
};

const template: WorkflowTemplate = {
  id: "tpl-02",
  name: "Customer At Risk Alert",
  description: "Open a ticket and alert the CSM.",
  category: "CUSTOMER_SUCCESS",
  triggerType: "CRM_CUSTOMER_AT_RISK",
  isBuiltIn: true,
  usageCount: 31,
  createdAt: "",
  updatedAt: "",
  definition: {
    triggerType: "CRM_CUSTOMER_AT_RISK",
    conditions: [{ type: "HEALTH_SCORE_BELOW", value: "50" }],
    actions: [
      { type: "CREATE_SUPPORT_TICKET", order: 1, config: { priority: "HIGH" } },
      { type: "CREATE_NOTIFICATION",   order: 2, config: { message: "Alert" } },
    ],
  },
};

describe("PAGE 08 — create sends the whole workflow", () => {
  it("CONDITIONS_IN_REQUEST_BODY = 1 and ACTIONS_IN_REQUEST_BODY = 1", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={null} template={template} title="Workflow" />);
    await setValue(container.querySelector("#wf-name"), "From template");
    await save(container);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body.conditions).toEqual([{ type: "HEALTH_SCORE_BELOW", field: null, value: "50" }]);
    expect((calls[0].body.actions as Act[]).map(a => a.type))
      .toEqual(["CREATE_SUPPORT_TICKET", "CREATE_NOTIFICATION"]);
    await unmount();
  });

  it("TEMPLATE_ID_SENT_ON_CREATE = 1", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={null} template={template} title="Workflow" />);
    await setValue(container.querySelector("#wf-name"), "From template");
    await save(container);
    expect(calls[0].body.templateId).toBe("tpl-02");
    await unmount();
  });

  it("prefills identity, trigger, conditions and actions from the template", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={null} template={template} title="Workflow" />);
    expect((container.querySelector("#wf-name") as HTMLInputElement).value).toBe("Customer At Risk Alert");
    await click(tab(container, "trigger"));
    expect((container.querySelector("#wf-trigger") as HTMLSelectElement).value).toBe("CRM_CUSTOMER_AT_RISK");
    await click(tab(container, "conditions"));
    expect((container.querySelector("#cond-type-0") as HTMLSelectElement).value).toBe("HEALTH_SCORE_BELOW");
    await click(tab(container, "actions"));
    expect((container.querySelector("#act-type-0") as HTMLSelectElement).value).toBe("CREATE_SUPPORT_TICKET");
    await unmount();
  });

  it("does not mutate the template it was seeded from", async () => {
    const before = JSON.parse(JSON.stringify(template));
    const { container, unmount } = await render(<WorkflowBuilderClient initial={null} template={template} title="Workflow" />);
    await click(tab(container, "actions"));
    await click(byLabel(container, "Remove action 1"));
    await click(tab(container, "identity"));
    await setValue(container.querySelector("#wf-name"), "Changed");
    await save(container);
    expect(template).toEqual(before);
    await unmount();
  });

  it("creates a bare workflow with empty collections", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={null} title="Workflow" />);
    await setValue(container.querySelector("#wf-name"), "Bare");
    await save(container);
    expect(calls[0].body.conditions).toEqual([]);
    expect(calls[0].body.actions).toEqual([]);
    await unmount();
  });
});

describe("PAGE 08 — conditions are editable again", () => {
  it("adds a condition and sends it", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={null} title="Workflow" />);
    await setValue(container.querySelector("#wf-name"), "With condition");
    await click(tab(container, "conditions"));
    await click(byText(container, B.addCondition));
    await setValue(container.querySelector("#cond-type-0"), "HEALTH_SCORE_BELOW");
    await setValue(container.querySelector("#cond-value-0"), "40");
    await save(container);
    expect(calls[0].body.conditions).toEqual([{ type: "HEALTH_SCORE_BELOW", field: null, value: "40" }]);
    await unmount();
  });

  it("sends a field only for the condition types that read one", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={null} title="Workflow" />);
    await setValue(container.querySelector("#wf-name"), "Field condition");
    await click(tab(container, "conditions"));
    await click(byText(container, B.addCondition));
    await setValue(container.querySelector("#cond-type-0"), "FIELD_EQUALS");
    await setValue(container.querySelector("#cond-field-0"), "status");
    await setValue(container.querySelector("#cond-value-0"), "STOPPED");
    await save(container);
    expect(calls[0].body.conditions).toEqual([{ type: "FIELD_EQUALS", field: "status", value: "STOPPED" }]);
    await unmount();
  });

  it("removes a stored condition and sends the shorter list", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await click(tab(container, "conditions"));
    await click(byLabel(container, "Remove condition 1"));
    await save(container);
    expect(calls[0].body.conditions).toEqual([]);
    await unmount();
  });

  it("hides the value input for ALWAYS, which evaluates no operand", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={null} title="Workflow" />);
    await click(tab(container, "conditions"));
    await click(byText(container, B.addCondition));
    expect(container.querySelector("#cond-value-0")).toBeNull();
    expect(container.querySelector("#cond-field-0")).toBeNull();
    await unmount();
  });
});

describe("PAGE 08 — actions are editable again", () => {
  it("edits a config field the engine actually reads", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await click(tab(container, "actions"));
    await setValue(container.querySelector("#act-1-message"), "Escalated to shift lead");
    await save(container);
    const acts = calls[0].body.actions as Act[];
    expect(acts[1].config).toEqual({ message: "Escalated to shift lead" });
    await unmount();
  });

  it("ACTION_ORDER_IS_ARRAY_ORDER = 1 — reordering changes the sent sequence", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await click(tab(container, "actions"));
    await click(byLabel(container, "Move action 2 earlier"));
    await save(container);
    const acts = calls[0].body.actions as Act[];
    expect(acts.map(a => a.type)).toEqual(["CREATE_NOTIFICATION", "CREATE_SUPPORT_TICKET"]);
    // Order is positional; the builder never sends a contradictory order field.
    expect(acts.every(a => !("order" in a))).toBe(true);
    await unmount();
  });

  it("disables the reorder controls at the ends of the sequence", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await click(tab(container, "actions"));
    expect((byLabel(container, "Move action 1 earlier") as HTMLButtonElement).disabled).toBe(true);
    expect((byLabel(container, "Move action 2 later") as HTMLButtonElement).disabled).toBe(true);
    expect((byLabel(container, "Move action 1 later") as HTMLButtonElement).disabled).toBe(false);
    await unmount();
  });

  it("adds and removes actions", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await click(tab(container, "actions"));
    await click(byText(container, B.addAction));
    await click(byLabel(container, "Remove action 1"));
    await save(container);
    const acts = calls[0].body.actions as Act[];
    expect(acts.map(a => a.type)).toEqual(["CREATE_NOTIFICATION", "CREATE_NOTIFICATION"]);
    await unmount();
  });

  it("offers editors only for the keys the chosen action type consumes", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await click(tab(container, "actions"));
    expect(container.querySelector("#act-0-title")).not.toBeNull();
    expect(container.querySelector("#act-0-priority")).not.toBeNull();
    expect(container.querySelector("#act-0-message")).toBeNull();
    await unmount();
  });

  it("ships no free-form JSON textarea", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await click(tab(container, "actions"));
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
    await unmount();
  });
});

describe("PAGE 08 — edit flow", () => {
  it("TRIGGER_SENT_ON_UPDATE = 1 — the trigger is editable and written", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await click(tab(container, "trigger"));
    await setValue(container.querySelector("#wf-trigger"), "INDUSTRIAL_ASSET_RISK_HIGH");
    await save(container);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe("/api/automation/workflows/wf-02");
    expect(calls[0].body.triggerType).toBe("INDUSTRIAL_ASSET_RISK_HIGH");
    await unmount();
  });

  it("sends exactly the fields PatchSchema accepts", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await setValue(container.querySelector("#wf-name"), "Renamed");
    await save(container);
    expect(Object.keys(calls[0].body).sort())
      .toEqual(["actions", "conditions", "description", "name", "status", "triggerType"]);
    await unmount();
  });

  it("persists a status transition", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await setValue(container.querySelector("#wf-status"), "PAUSED");
    await save(container);
    expect(calls[0].body.status).toBe("PAUSED");
    await unmount();
  });
});

describe("PAGE 08 — validation and save state", () => {
  it("INVALID_SUBMIT_REACHES_NETWORK = 0", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={null} title="Workflow" />);
    await save(container);
    expect(calls).toHaveLength(0);
    await unmount();
  });

  it("reports the missing name on the field it belongs to", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={null} title="Workflow" />);
    const input = container.querySelector("#wf-name") as HTMLInputElement;
    await focus(input);
    await blur(input);
    const err = container.querySelector("#wf-name-error");
    expect(err).not.toBeNull();
    expect(err!.getAttribute("role")).toBe("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("wf-name-error");
    await unmount();
  });

  it("CLEAN_FORM_REACHES_NETWORK = 0 — save waits for a real change", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await goToReview(container);
    expect(saveButton(container).disabled).toBe(true);
    await click(saveButton(container));
    expect(calls).toHaveLength(0);
    await unmount();
  });

  it("treats an edited action as a change worth saving", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />);
    await click(tab(container, "actions"));
    await setValue(container.querySelector("#act-0-title"), "Changed title");
    await goToReview(container);
    expect(saveButton(container).disabled).toBe(false);
    expect(container.textContent).toContain(B.unsavedChanges);
    await unmount();
  });
});

describe("PAGE 08 — action config exposure", () => {
  /** Synthetic values only. Nothing here is a real credential. */
  const SECRETS = {
    apiKey: "SYNTHETIC_APIKEY_VALUE",
    token: "SYNTHETIC_TOKEN_VALUE",
    accessToken: "SYNTHETIC_ACCESS_VALUE",
    refreshToken: "SYNTHETIC_REFRESH_VALUE",
    secret: "SYNTHETIC_SECRET_VALUE",
    clientSecret: "SYNTHETIC_CLIENTSECRET_VALUE",
    password: "SYNTHETIC_PASSWORD_VALUE",
    Authorization: "Bearer SYNTHETIC_UPPER",
  };

  const withSecrets: WorkflowDefinitionFull = {
    ...stored,
    actions: [{
      id: "a9", workflowId: "wf-02", type: "SEND_WEBHOOK", order: 1,
      config: {
        ...SECRETS,
        headers: { Authorization: "Bearer SYNTHETIC_HEADER", "Content-Type": "application/json" },
        url: "https://example.test/hook?token=SENSITIVE#fragment",
        method: "POST",
      },
      createdAt: "", updatedAt: "",
    }],
  };

  it("SECRET_VALUE_RENDERED = NO for every credential-shaped key", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={withSecrets} title="Workflow" />);
    await click(tab(container, "actions"));
    const html = container.innerHTML;
    for (const value of [...Object.values(SECRETS), "Bearer SYNTHETIC_HEADER"]) {
      expect(html, `leaked ${value}`).not.toContain(value);
    }
    await unmount();
  });

  it("QUERYSTRING_RENDERED = NO and URL_FRAGMENT_RENDERED = NO", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={withSecrets} title="Workflow" />);
    await click(tab(container, "actions"));
    const html = container.innerHTML;
    expect(html).not.toContain("SENSITIVE");
    expect(html).not.toContain("token=");
    expect(html).not.toContain("#fragment");
    expect(container.textContent).toContain("https://example.test/hook");
    await unmount();
  });

  it("never offers a credential key as an editable input", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={withSecrets} title="Workflow" />);
    await click(tab(container, "actions"));
    for (const key of Object.keys(SECRETS)) {
      expect(container.querySelector(`#act-0-${key}`), key).toBeNull();
    }
    await unmount();
  });

  it("SOURCE_CONFIG_MUTATED = NO — rendering does not touch the stored object", async () => {
    const before = JSON.parse(JSON.stringify(withSecrets.actions[0].config));
    const { container, unmount } = await render(<WorkflowBuilderClient initial={withSecrets} title="Workflow" />);
    await click(tab(container, "actions"));
    expect(withSecrets.actions[0].config).toEqual(before);
    await unmount();
  });

  /**
   * Stored keys the builder has no editor for are carried back unchanged, so a
   * save can never silently drop them. A credential-shaped key therefore
   * reaches the write path and is refused there — loudly — instead of being
   * quietly re-persisted or quietly deleted.
   */
  it("carries unknown stored config back rather than dropping it", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={withSecrets} title="Workflow" />);
    await setValue(container.querySelector("#wf-name"), "Renamed");
    await save(container);
    const acts = calls[0].body.actions as Act[];
    expect(acts[0].config.method).toBe("POST");
    expect(acts[0].config.apiKey).toBe(SECRETS.apiKey);
    await unmount();
  });
});

describe("PAGE 08 — localization", () => {
  it("localizes condition types instead of showing the raw enum", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />, "fa");
    await click(tab(container, "conditions"));
    const selected = container.querySelector("#cond-type-0 option[value='HEALTH_SCORE_BELOW']");
    expect(selected!.textContent).toBe(fa.automationOperations.builder.conditionTypeOptions.HEALTH_SCORE_BELOW);
    expect(selected!.textContent).not.toBe(B.conditionTypeOptions.HEALTH_SCORE_BELOW);
    await unmount();
  });

  it("localizes the status vocabulary", async () => {
    const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />, "fa");
    const options = [...container.querySelectorAll("#wf-status option")].map(o => o.textContent);
    expect(options).toEqual([
      fa.automationOperations.builder.statusOptions.DRAFT,
      fa.automationOperations.builder.statusOptions.ACTIVE,
      fa.automationOperations.builder.statusOptions.PAUSED,
      fa.automationOperations.builder.statusOptions.ARCHIVED,
    ]);
    await unmount();
  });

  it("keeps execution order positional in both reading directions", async () => {
    for (const locale of ["en", "fa"] as const) {
      const { container, unmount } = await render(<WorkflowBuilderClient initial={stored} title="Workflow" />, locale);
      await click(tab(container, "actions"));
      const orders = [...container.querySelectorAll("ol > li")].map(li => li.querySelector("span")!.textContent);
      expect(orders).toEqual(["01", "02"]);
      await unmount();
    }
  });
});
