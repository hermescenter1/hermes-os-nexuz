// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { mount, click, focus, keyDown, active } from "./_render";
import { Dialog } from "../Dialog";
import { Drawer } from "../Drawer";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-trigger onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Save as Case"
        description="Persist the analysis."
        footer={
          <>
            <button data-cancel>Cancel</button>
            <button data-save>Save</button>
          </>
        }
      >
        <button data-inside>Inside</button>
      </Dialog>
    </div>
  );
}

const dialogEl = () => document.querySelector('[role="dialog"]');

describe("Dialog — runtime", () => {
  it("opens with correct semantics and moves focus inside", async () => {
    const { container, unmount } = await mount(<DialogHarness />);
    const trigger = container.querySelector("[data-trigger]")!;
    await focus(trigger);
    await click(trigger);

    const panel = dialogEl()!;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute("aria-modal")).toBe("true");
    const labelledby = panel.getAttribute("aria-labelledby")!;
    expect(labelledby).toBeTruthy();
    expect(document.getElementById(labelledby)!.textContent).toBe("Save as Case");
    expect(panel.contains(active())).toBe(true); // focus moved into the dialog
    await unmount();
  });

  it("traps Tab and Shift+Tab within the panel", async () => {
    const { container, unmount } = await mount(<DialogHarness />);
    await focus(container.querySelector("[data-trigger]"));
    await click(container.querySelector("[data-trigger]"));

    const save = document.querySelector("[data-save]")!;
    const inside = document.querySelector("[data-inside]")!;

    await focus(save); // last focusable
    await keyDown(save, "Tab"); // wraps to first
    expect(active()).toBe(inside);

    await focus(inside); // first focusable
    await keyDown(inside, "Tab", { shiftKey: true }); // wraps to last
    expect(active()).toBe(save);
    await unmount();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const { container, unmount } = await mount(<DialogHarness />);
    const trigger = container.querySelector("[data-trigger]")!;
    await focus(trigger);
    await click(trigger);
    expect(dialogEl()).toBeTruthy();

    await keyDown(active(), "Escape");
    expect(dialogEl()).toBeNull(); // closed
    expect(active()).toBe(trigger); // focus restored
    await unmount();
  });
});

function DrawerHarness({ side }: { side?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  return (
    <div dir="rtl">
      <button data-trigger onClick={() => setOpen(true)}>
        Open
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} side={side} title="Context">
        <button data-inside>Inside</button>
      </Drawer>
    </div>
  );
}

describe("Drawer — runtime", () => {
  it("opens, moves focus inside, and closes on Escape restoring focus", async () => {
    const { container, unmount } = await mount(<DrawerHarness />);
    const trigger = container.querySelector("[data-trigger]")!;
    await focus(trigger);
    await click(trigger);

    const panel = dialogEl()!;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.contains(active())).toBe(true);

    await keyDown(active(), "Escape");
    expect(dialogEl()).toBeNull();
    expect(active()).toBe(trigger);
    await unmount();
  });

  it("uses LOGICAL inline placement (end/start), never physical left/right — so it mirrors under RTL", async () => {
    const end = await mount(<DrawerHarness side="end" />);
    await focus(end.container.querySelector("[data-trigger]"));
    await click(end.container.querySelector("[data-trigger]"));
    let panel = dialogEl()!;
    expect(panel.className).toContain("end-0");
    expect(panel.className).toContain("border-s");
    expect(panel.className).not.toMatch(/\b(right-0|left-0)\b/);
    await end.unmount();

    const start = await mount(<DrawerHarness side="start" />);
    await focus(start.container.querySelector("[data-trigger]"));
    await click(start.container.querySelector("[data-trigger]"));
    panel = dialogEl()!;
    expect(panel.className).toContain("start-0");
    expect(panel.className).toContain("border-e");
    await start.unmount();
  });
});
