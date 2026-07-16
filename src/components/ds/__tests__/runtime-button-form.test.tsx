// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount, click, focus, active } from "./_render";
import { Button } from "../Button";
import { FormField } from "../FormField";
import { Input } from "../Input";
import { TechnicalValue } from "../TechnicalValue";

describe("Button — runtime interaction", () => {
  it("loading sets aria-busy, disables the control, and blocks activation", async () => {
    const onClick = vi.fn();
    const { container, unmount } = await mount(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const btn = container.querySelector("button")!;
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.disabled).toBe(true);
    await click(btn); // loading must prevent duplicate activation
    expect(onClick).not.toHaveBeenCalled();
    await unmount();
  });

  it("disabled blocks activation", async () => {
    const onClick = vi.fn();
    const { container, unmount } = await mount(
      <Button disabled onClick={onClick}>
        X
      </Button>,
    );
    await click(container.querySelector("button"));
    expect(onClick).not.toHaveBeenCalled();
    await unmount();
  });

  it("enabled: focusable, defaults to type=button, keeps the focus-visible affordance, activates once", async () => {
    const onClick = vi.fn();
    const { container, unmount } = await mount(<Button onClick={onClick}>Go</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.className).toContain("ds-focus"); // focus-visible ring foundation preserved
    await focus(btn);
    expect(active()).toBe(btn); // focus is not lost
    await click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    await unmount();
  });
});

describe("FormField + Input — runtime accessibility", () => {
  it("associates label→control, sets aria-invalid, and links the error via aria-describedby (role=alert)", async () => {
    const { container, unmount } = await mount(
      <FormField label="Email" error="Enter a valid email.">
        <Input defaultValue="x" />
      </FormField>,
    );
    const input = container.querySelector("input")!;
    const label = container.querySelector("label")!;
    expect(input.id).toBeTruthy();
    expect(label.getAttribute("for")).toBe(input.id); // label association
    expect(input.getAttribute("aria-invalid")).toBe("true");

    const err = container.querySelector('[role="alert"]')!;
    expect(err).toBeTruthy();
    expect(err.textContent).toContain("Enter a valid email.");
    expect(input.getAttribute("aria-describedby")).toContain(err.id); // error association
    await unmount();
  });

  it("without error: no aria-invalid, description associated via aria-describedby", async () => {
    const { container, unmount } = await mount(
      <FormField label="Asset tag" description="Site B line">
        <Input />
      </FormField>,
    );
    const input = container.querySelector("input")!;
    expect(input.getAttribute("aria-invalid")).toBeNull();
    const desc = container.querySelector("p")!;
    expect(desc.id).toBeTruthy();
    expect(input.getAttribute("aria-describedby")).toContain(desc.id);
    await unmount();
  });

  it("generates unique control ids across two fields (no duplicate ids)", async () => {
    const { container, unmount } = await mount(
      <div>
        <FormField label="A">
          <Input />
        </FormField>
        <FormField label="B">
          <Input />
        </FormField>
      </div>,
    );
    const [a, b] = Array.from(container.querySelectorAll("input"));
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
    await unmount();
  });
});

describe("TechnicalValue — runtime LTR isolation", () => {
  it("renders a <bdi dir=\"ltr\"> that stays LTR inside an RTL container", async () => {
    const { container, unmount } = await mount(
      <div dir="rtl">
        فشار سنسور <TechnicalValue>PT-4012</TechnicalValue>
      </div>,
    );
    const bdi = container.querySelector("bdi")!;
    expect(bdi).toBeTruthy();
    expect(bdi.tagName.toLowerCase()).toBe("bdi");
    expect(bdi.getAttribute("dir")).toBe("ltr");
    expect(bdi.textContent).toBe("PT-4012");
    // Isolated from the rtl parent — computed direction is ltr.
    expect(getComputedStyle(bdi).direction).toBe("ltr");
    await unmount();
  });
});
