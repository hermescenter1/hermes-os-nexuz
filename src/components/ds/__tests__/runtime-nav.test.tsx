// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { mount, focus, keyDown, blur } from "./_render";
import { Tabs } from "../Tabs";
import { Tooltip } from "../Tooltip";

function TabsHarness({ dir }: { dir?: "rtl" | "ltr" }) {
  const [v, setV] = useState("a");
  return (
    <div dir={dir}>
      <Tabs
        aria-label="Reasoning sections"
        value={v}
        onValueChange={setV}
        items={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ]}
      />
      <div id={`panel-${v}`} role="tabpanel" aria-labelledby={`tab-${v}`}>
        panel {v}
      </div>
    </div>
  );
}

const selectedTab = (root: ParentNode) => root.querySelector('[role="tab"][aria-selected="true"]');

describe("Tabs — runtime", () => {
  it("exposes tablist/tab roles, aria-selected, roving tabindex, and panel association", async () => {
    const { container, unmount } = await mount(<TabsHarness />);
    const tablist = container.querySelector('[role="tablist"]')!;
    expect(tablist.getAttribute("aria-label")).toBe("Reasoning sections");
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(3);

    const tabA = tabs[0];
    expect(tabA.getAttribute("aria-selected")).toBe("true");
    expect(tabA.getAttribute("tabindex")).toBe("0");
    expect(tabs[1].getAttribute("tabindex")).toBe("-1"); // roving

    // panel association: tab aria-controls ↔ panel id / aria-labelledby ↔ tab id
    const panel = container.querySelector('[role="tabpanel"]')!;
    expect(tabA.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tabA.id);
    await unmount();
  });

  it("LTR: ArrowRight → next, ArrowLeft → previous, Home/End → ends", async () => {
    const { container, unmount } = await mount(<TabsHarness />);
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    await focus(tabs[0]);

    await keyDown(tabs[0], "ArrowRight");
    expect(selectedTab(container)!.getAttribute("data-value")).toBe("b");

    await keyDown(selectedTab(container)!, "ArrowLeft");
    expect(selectedTab(container)!.getAttribute("data-value")).toBe("a");

    await keyDown(selectedTab(container)!, "End");
    expect(selectedTab(container)!.getAttribute("data-value")).toBe("c");

    await keyDown(selectedTab(container)!, "Home");
    expect(selectedTab(container)!.getAttribute("data-value")).toBe("a");
    await unmount();
  });

  it("RTL: ArrowRight is mirrored to move to the PREVIOUS tab", async () => {
    const { container, unmount } = await mount(<TabsHarness dir="rtl" />);
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    await focus(tabs[0]);
    // In RTL, ArrowRight moves visually-leftward → previous → wraps a→c.
    await keyDown(tabs[0], "ArrowRight");
    expect(selectedTab(container)!.getAttribute("data-value")).toBe("c");
    await unmount();
  });
});

function TooltipHarness() {
  return (
    <Tooltip content="Opens Industrial Brain">
      <button data-trigger>Analyze</button>
    </Tooltip>
  );
}

describe("Tooltip — runtime", () => {
  it("associates the trigger with a role=tooltip via aria-describedby", async () => {
    const { container, unmount } = await mount(<TooltipHarness />);
    const trigger = container.querySelector("[data-trigger]")!;
    const tip = container.querySelector('[role="tooltip"]')!;
    expect(tip).toBeTruthy();
    expect(tip.id).toBeTruthy();
    expect(trigger.getAttribute("aria-describedby")).toBe(tip.id);
    await unmount();
  });

  it("shows on keyboard focus and dismisses on blur", async () => {
    const { container, unmount } = await mount(<TooltipHarness />);
    const trigger = container.querySelector("[data-trigger]")!;
    const tip = container.querySelector('[role="tooltip"]')! as HTMLElement;

    expect(tip.hidden).toBe(true); // hidden at rest
    await focus(trigger);
    expect(tip.hidden).toBe(false); // keyboard focus reveals it
    await blur(trigger);
    expect(tip.hidden).toBe(true); // dismissed on blur
    await unmount();
  });
});
