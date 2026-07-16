// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { mount, click, focus, active } from "./_render";
import { Switch } from "../Switch";
import { Checkbox } from "../Checkbox";
import { Radio } from "../Radio";

function SwitchHarness({ disabled }: { disabled?: boolean }) {
  const [on, setOn] = useState(false);
  return <Switch checked={on} onCheckedChange={setOn} disabled={disabled} aria-label="Live mode" />;
}

describe("Switch — runtime", () => {
  it("exposes role=switch on a native button with aria-checked, and toggles on activation", async () => {
    const { container, unmount } = await mount(<SwitchHarness />);
    const sw = container.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(sw).toBeTruthy();
    expect(sw.tagName.toLowerCase()).toBe("button"); // native element → native keyboard (Space/Enter) activation
    expect(sw.getAttribute("aria-checked")).toBe("false");
    await focus(sw);
    expect(active()).toBe(sw); // keyboard-focusable
    await click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    await click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    await unmount();
  });

  it("disabled: not toggled by activation", async () => {
    const { container, unmount } = await mount(<SwitchHarness disabled />);
    const sw = container.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    await click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    await unmount();
  });
});

describe("Checkbox — runtime", () => {
  it("is a native checkbox that toggles checked on activation and fires onChange", async () => {
    const onChange = vi.fn();
    const { container, unmount } = await mount(<Checkbox onChange={onChange} />);
    const box = container.querySelector("input")! as HTMLInputElement;
    expect(box.type).toBe("checkbox");
    expect(box.checked).toBe(false);
    await click(box);
    expect(box.checked).toBe(true);
    expect(onChange).toHaveBeenCalled();
    await unmount();
  });

  it("disabled: does not toggle", async () => {
    const onChange = vi.fn();
    const { container, unmount } = await mount(<Checkbox disabled onChange={onChange} />);
    const box = container.querySelector("input")! as HTMLInputElement;
    expect(box.disabled).toBe(true);
    await click(box);
    expect(box.checked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    await unmount();
  });
});

describe("Radio — runtime group semantics", () => {
  it("selecting one radio in a group deselects the others", async () => {
    const { container, unmount } = await mount(
      <fieldset>
        <label>
          <Radio name="mode" value="a" defaultChecked /> A
        </label>
        <label>
          <Radio name="mode" value="b" /> B
        </label>
      </fieldset>,
    );
    const [a, b] = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    expect(a.type).toBe("radio");
    expect(a.checked).toBe(true);
    expect(b.checked).toBe(false);
    await click(b);
    expect(b.checked).toBe(true);
    expect(a.checked).toBe(false); // native mutual exclusion within the name group
    await unmount();
  });
});
