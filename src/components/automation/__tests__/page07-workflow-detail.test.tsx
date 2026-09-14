// @vitest-environment jsdom
/**
 * PAGE 07 — WorkflowDetailClient mounted for real.
 *
 * The redesign's load-bearing promises are structural, not cosmetic, so they
 * are pinned here rather than left to a screenshot:
 *
 *   ALL_TABS_REACHABLE            = 4   (no horizontally scrolled tab row)
 *   EXECUTION_CARDS_MATCH_ROWS    = 1   (mobile card twin loses no execution)
 *   VISIBLE_VIEW_ACTION_COUNT     = EXECUTION_CARD_COUNT
 *   ACTION_ORDER_IS_RENDER_ORDER  = 1
 *   SECRET_VALUE_RENDERED         = NO  (redaction survives the new layout)
 *   QUERYSTRING_RENDERED          = NO
 *   HARDCODED_DIRECTIONAL_CLASSES = 0   (RTL safety)
 */
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { NextIntlClientProvider } from "next-intl";
import { mount, click } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type { WorkflowDefinitionFull, WorkflowExecution } from "@/lib/automation/types";

import { WorkflowDetailClient } from "../WorkflowDetailClient";

const D = en.automationOperations.workflowDetail;

beforeEach(() => {
  document.body.innerHTML = "";
});

function render(node: React.ReactNode, locale: "en" | "fa" = "en") {
  const messages = (locale === "fa" ? fa : en) as unknown as Record<string, unknown>;
  return mount(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

const workflow: WorkflowDefinitionFull = {
  id: "wf-7", organizationId: "org-1", name: "Escalate at-risk accounts",
  description: "Raises a support ticket when an account crosses the risk threshold.",
  status: "ACTIVE", triggerType: "CRM_CUSTOMER_AT_RISK", templateId: "tpl-9",
  createdBy: "u-1", updatedBy: "u-1", deletedAt: null,
  createdAt: "2026-01-05T09:00:00.000Z", updatedAt: "2026-02-01T09:00:00.000Z",
  conditions: [
    {
      id: "c-1", workflowId: "wf-7", type: "HEALTH_SCORE_BELOW",
      field: null, operator: "lt", value: "40", logicGroup: 0,
      createdAt: "2026-01-05T09:00:00.000Z", updatedAt: "2026-01-05T09:00:00.000Z",
    },
    {
      id: "c-2", workflowId: "wf-7", type: "FIELD_EQUALS",
      field: "tier", operator: "eq", value: "enterprise", logicGroup: 0,
      createdAt: "2026-01-05T09:00:00.000Z", updatedAt: "2026-01-05T09:00:00.000Z",
    },
  ],
  // Deliberately out of order — the surface must render by `order`, not by the
  // order the database happened to return.
  actions: [
    {
      id: "a-2", workflowId: "wf-7", type: "SEND_WEBHOOK", order: 2,
      config: { url: "https://ops.example.com/hook?token=SUPERSECRET#frag", apiKey: "sk-live-abc123" },
      createdAt: "2026-01-05T09:00:00.000Z", updatedAt: "2026-01-05T09:00:00.000Z",
    },
    {
      id: "a-1", workflowId: "wf-7", type: "CREATE_SUPPORT_TICKET", order: 1,
      config: { title: "Account at risk", priority: "HIGH" },
      createdAt: "2026-01-05T09:00:00.000Z", updatedAt: "2026-01-05T09:00:00.000Z",
    },
  ],
};

const executions: WorkflowExecution[] = [
  {
    id: "ex-3", workflowId: "wf-7", status: "SUCCESS", triggeredBy: "system",
    triggerData: {}, startedAt: null, finishedAt: null, durationMs: 412,
    errorMessage: null, isSimulation: false, createdAt: "2026-02-01T10:00:00.000Z",
  },
  {
    id: "ex-2", workflowId: "wf-7", status: "FAILED", triggeredBy: null,
    triggerData: {}, startedAt: null, finishedAt: null, durationMs: null,
    errorMessage: "boom", isSimulation: false, createdAt: "2026-01-31T10:00:00.000Z",
  },
  {
    id: "ex-1", workflowId: "wf-7", status: "PARTIAL", triggeredBy: "u-1",
    triggerData: {}, startedAt: null, finishedAt: null, durationMs: 90,
    errorMessage: null, isSimulation: true, createdAt: "2026-01-30T10:00:00.000Z",
  },
];

const tabs = (c: HTMLElement) => [...c.querySelectorAll('[role="tab"]')] as HTMLElement[];
const openTab = async (c: HTMLElement, label: string) => {
  const tab = tabs(c).find(t => (t.textContent ?? "").includes(label));
  expect(tab, `tab "${label}" not found`).toBeTruthy();
  await click(tab!);
};

describe("PAGE 07 — section navigation", () => {
  it("exposes all four sections as tabs, with none hidden behind a scroller", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );

    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    expect(list).toBeTruthy();
    expect(tabs(container)).toHaveLength(4);

    // A horizontally scrolling rail is exactly the defect being retired.
    expect(list.className).not.toMatch(/overflow-x-auto|overflow-x-scroll/);
    // Below md the rail is a 2x2 grid, so every tab occupies real layout.
    expect(list.className).toContain("grid-cols-2");
    // No tab may be display-suppressed at any breakpoint.
    for (const t of tabs(container)) {
      expect(t.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    }

    await unmount();
  });

  it("moves aria-selected and the rendered panel together", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );

    const selected = () => tabs(container).filter(t => t.getAttribute("aria-selected") === "true");
    expect(selected()).toHaveLength(1);
    expect(container.querySelector("#workflow-panel-overview")).toBeTruthy();

    await openTab(container, D.tabExecutions.replace("{count}", "3"));
    expect(selected()).toHaveLength(1);
    expect(selected()[0].id).toBe("workflow-tab-executions");
    expect(container.querySelector("#workflow-panel-executions")).toBeTruthy();
    expect(container.querySelector("#workflow-panel-overview")).toBeNull();

    await unmount();
  });

  it("gives every tab a controls/labelledby pair", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );
    for (const t of tabs(container)) {
      const controls = t.getAttribute("aria-controls");
      expect(controls).toBeTruthy();
      expect(t.id).toBeTruthy();
    }
    const panel = container.querySelector('[role="tabpanel"]') as HTMLElement;
    expect(panel.getAttribute("aria-labelledby")).toBe("workflow-tab-overview");
    await unmount();
  });
});

describe("PAGE 07 — executions", () => {
  it("renders a card per execution alongside the table, each with its own View", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );
    await openTab(container, D.tabExecutions.replace("{count}", "3"));

    const cards = container.querySelectorAll('[data-testid="execution-cards"] > li');
    expect(cards).toHaveLength(executions.length);

    // Every card carries a reachable View action — the clipped-link defect.
    const cardViews = container.querySelectorAll(
      '[data-testid="execution-cards"] a[href*="/automation/executions/"]',
    );
    expect(cardViews).toHaveLength(executions.length);

    // The desktop table keeps the same rows and the same actions.
    const rows = container.querySelectorAll("table tbody tr");
    expect(rows).toHaveLength(executions.length);
    expect(container.querySelectorAll("table a[href*='/automation/executions/']"))
      .toHaveLength(executions.length);

    await unmount();
  });

  it("keeps the mobile card and the desktop row on complementary breakpoints", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );
    await openTab(container, D.tabExecutions.replace("{count}", "3"));

    const cardList = container.querySelector('[data-testid="execution-cards"]') as HTMLElement;
    const tableWrap = container.querySelector("table")!.parentElement as HTMLElement;

    expect(cardList.className).toContain("md:hidden");
    expect(tableWrap.className).toContain("hidden");
    expect(tableWrap.className).toContain("md:block");

    await unmount();
  });

  it("puts every table column on the mobile card too", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );
    await openTab(container, D.tabExecutions.replace("{count}", "3"));

    const firstCard = container.querySelector('[data-testid="execution-cards"] > li') as HTMLElement;
    const text = firstCard.textContent ?? "";
    for (const label of [D.colTriggeredBy, D.colDuration, D.colDate]) {
      expect(text).toContain(label);
    }
    // Status, identity, run type and the action all survive the transposition.
    expect(text).toContain("SUCCESS");
    expect(text).toContain("ex-3");
    expect(text).toContain(en.automationOperations.executionList.typeLive);
    expect(text).toContain(D.view);

    await unmount();
  });

  it("disambiguates the repeated View label for assistive technology", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );
    await openTab(container, D.tabExecutions.replace("{count}", "3"));

    const names = [...container.querySelectorAll("a[href*='/automation/executions/']")]
      .map(a => a.getAttribute("aria-label"))
      .filter(Boolean) as string[];
    // Both twins label every link, so 3 executions give 6 distinct names.
    expect(names).toHaveLength(executions.length * 2);
    expect(new Set(names).size).toBe(executions.length);

    await unmount();
  });

  it("shows the empty state instead of an empty table shell", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={[]} />,
    );
    await openTab(container, D.tabExecutions.replace("{count}", "0"));

    expect(container.textContent).toContain(D.empty);
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('[data-testid="execution-cards"]')).toBeNull();

    await unmount();
  });
});

describe("PAGE 07 — actions", () => {
  it("renders actions in execution order, not storage order", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );
    await openTab(container, D.tabActions.replace("{count}", "2"));

    const items = [...container.querySelectorAll("ol > li")] as HTMLElement[];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("CREATE_SUPPORT_TICKET");
    expect(items[1].textContent).toContain("SEND_WEBHOOK");

    await unmount();
  });

  it("never renders a credential value or a URL query string", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );
    await openTab(container, D.tabActions.replace("{count}", "2"));

    const text = container.textContent ?? "";
    expect(text).not.toContain("sk-live-abc123");
    expect(text).not.toContain("SUPERSECRET");
    expect(text).not.toContain("token=");
    expect(text).not.toContain("#frag");
    // The redacted marker is still shown, so nothing is silently dropped.
    expect(text).toContain("[REDACTED]");
    expect(text).toContain("https://ops.example.com/hook");

    await unmount();
  });
});

describe("PAGE 07 — overview and identity", () => {
  it("summarises trigger, counts and the most recent run", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );
    const text = container.textContent ?? "";

    expect(text).toContain(D.overviewTitle);
    expect(text).toContain(en.automationOperations.triggerLabels.CRM_CUSTOMER_AT_RISK);
    expect(text).toContain("CRM_CUSTOMER_AT_RISK");
    expect(text).toContain(D.lastExecutionLabel);
    // Head of the list is the newest run and drives the header health dot.
    expect(text).toContain("SUCCESS");

    await unmount();
  });

  it("keeps the identity rail available on every tab", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );
    const rail = () => container.querySelector('[data-testid="identity-rail"]');
    expect(rail()).toBeTruthy();
    expect(rail()!.textContent).toContain("wf-7");

    await openTab(container, D.tabActions.replace("{count}", "2"));
    expect(rail()).toBeTruthy();
    await openTab(container, D.tabExecutions.replace("{count}", "3"));
    expect(rail()).toBeTruthy();

    await unmount();
  });

  it("falls back to a stated absence rather than an empty description slot", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={{ ...workflow, description: null }} executions={[]} />,
    );
    expect(container.textContent).toContain(D.noDescription);
    await unmount();
  });

  it("states status in words, never by colour alone", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
    );
    expect(container.textContent).toContain(en.automationOperations.builder.statusOptions.ACTIVE);
    await unmount();
  });
});

describe("PAGE 07 — localisation and direction", () => {
  it("renders Persian copy, not English fallbacks", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
      "fa",
    );
    const text = container.textContent ?? "";
    expect(text).toContain(fa.automationOperations.workflowDetail.eyebrow);
    expect(text).toContain(fa.automationOperations.workflowDetail.overviewTitle);
    expect(text).not.toContain(D.overviewTitle);
    await unmount();
  });

  it("isolates technical identifiers so RTL never reorders them", async () => {
    const { container, unmount } = await render(
      <WorkflowDetailClient workflow={workflow} executions={executions} />,
      "fa",
    );
    const rail = container.querySelector('[data-testid="identity-rail"]') as HTMLElement;
    const bdi = rail.querySelector("bdi");
    expect(bdi).toBeTruthy();
    expect(bdi!.getAttribute("dir")).toBe("ltr");
    await unmount();
  });

  it("uses logical properties only — no hardcoded left/right utilities", () => {
    // jsdom does not give this module a file: URL, so resolve from the root.
    const src = readFileSync(
      "src/components/automation/WorkflowDetailClient.tsx",
      "utf8",
    );
    const offenders = src.match(
      /(?<![\w-])(?:sm:|md:|lg:|xl:|2xl:)?(?:text-(?:left|right)|[mp][lr]-[\w.[\]/-]+|border-[lr](?:-|\b)|rounded-[lr]\b|(?:left|right)-\d)/g,
    );
    expect(offenders ?? []).toEqual([]);
  });
});
