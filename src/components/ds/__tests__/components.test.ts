import { describe, expect, it } from "vitest";
import { cn } from "../cn";
import {
  alertRole,
  alertVariants,
  badgeVariants,
  buttonVariants,
  cardVariants,
  directionForLocale,
  fieldIds,
  isRtl,
  statusDotClass,
} from "../logic";

/**
 * PHASE 87B component-logic tests. The ds components expose their variant
 * resolvers, id derivation, and direction logic as pure functions so behaviour
 * is verifiable without a DOM renderer (the repo has no jsdom / @testing-library
 * and none was added this phase).
 */

describe("cn — className composer", () => {
  it("joins truthy strings, arrays, and conditional objects", () => {
    expect(cn("a", false, ["b", null, undefined], { c: true, d: false })).toBe("a b c");
  });
  it("de-duplicates exact repeated tokens", () => {
    expect(cn("a b", "a", "c b")).toBe("a b c");
  });
  it("returns an empty string for no truthy input", () => {
    expect(cn(false, null, undefined, "")).toBe("");
  });
});

describe("Button variants", () => {
  it("primary is filled cyan with dark on-brand text (white-on-cyan prohibited)", () => {
    const c = buttonVariants("primary", "md");
    expect(c).toContain("bg-brand-primary");
    expect(c).toContain("text-brand-on-brand");
  });
  it("destructive is filled safety-red with inverse (dark) text", () => {
    const c = buttonVariants("destructive", "md");
    expect(c).toContain("bg-status-danger");
    expect(c).toContain("text-text-inverse");
  });
  it("secondary is an outline", () => {
    expect(buttonVariants("secondary", "md")).toContain("border-border-default");
  });
  it("large size meets the 44px touch target", () => {
    expect(buttonVariants("primary", "lg")).toContain("h-11");
  });
  it("every variant carries the focus ring and disabled affordance", () => {
    for (const v of ["primary", "secondary", "tertiary", "destructive"] as const) {
      const c = buttonVariants(v);
      expect(c).toContain("ds-focus");
      expect(c).toContain("disabled:opacity-40");
    }
  });
  it("fullWidth adds w-full", () => {
    expect(buttonVariants("primary", "md", { fullWidth: true })).toContain("w-full");
    expect(buttonVariants("primary", "md")).not.toContain("w-full");
  });
});

describe("Badge variants", () => {
  it.each([
    ["success", "text-status-success", "bg-status-success-subtle"],
    ["warning", "text-status-warning", "bg-status-warning-subtle"],
    ["danger", "text-status-danger", "bg-status-danger-subtle"],
    ["information", "text-status-information", "bg-status-information-subtle"],
    ["hypothesis", "text-reasoning-hypothesis", "bg-reasoning-hypothesis-subtle"],
    ["brand", "text-brand-primary", "bg-brand-subtle"],
    ["neutral", "text-text-secondary", "bg-surface-interactive"],
  ] as const)("%s uses its semantic colour", (variant, text, bg) => {
    const c = badgeVariants(variant);
    expect(c).toContain(text);
    expect(c).toContain(bg);
  });
});

describe("Card variants", () => {
  it("glass uses the controlled glass utility", () => {
    expect(cardVariants("glass")).toContain("ds-glass");
  });
  it("elevated carries the E2 shadow", () => {
    expect(cardVariants("elevated")).toContain("shadow-e2");
  });
  it("interactive is focusable and hoverable", () => {
    const c = cardVariants("interactive");
    expect(c).toContain("ds-focus");
    expect(c).toContain("cursor-pointer");
  });
  it("padding is applied by default and removable", () => {
    expect(cardVariants("standard")).toContain("p-5");
    expect(cardVariants("standard", { padded: false })).not.toContain("p-5");
  });
});

describe("Alert semantics", () => {
  it("danger and warning are assertive (role=alert)", () => {
    expect(alertRole("danger")).toBe("alert");
    expect(alertRole("warning")).toBe("alert");
  });
  it("success, information and neutral are polite (role=status)", () => {
    expect(alertRole("success")).toBe("status");
    expect(alertRole("information")).toBe("status");
    expect(alertRole("neutral")).toBe("status");
  });
  it("variant maps to its subtle container", () => {
    expect(alertVariants("danger")).toContain("bg-status-danger-subtle");
  });
});

describe("StatusIndicator", () => {
  it("maps each status to its dot colour", () => {
    expect(statusDotClass("success")).toBe("bg-status-success");
    expect(statusDotClass("warning")).toBe("bg-status-warning");
    expect(statusDotClass("danger")).toBe("bg-status-danger");
    expect(statusDotClass("information")).toBe("bg-status-information");
    expect(statusDotClass("neutral")).toBe("bg-text-muted");
  });
});

describe("FormField id wiring", () => {
  it("derives control / description / error ids from a base", () => {
    expect(fieldIds("email")).toEqual({
      controlId: "email",
      descriptionId: "email-description",
      errorId: "email-error",
    });
  });
});

describe("directionality", () => {
  it("resolves Persian as RTL and English as LTR", () => {
    expect(directionForLocale("fa")).toBe("rtl");
    expect(directionForLocale("en")).toBe("ltr");
    expect(isRtl("fa")).toBe(true);
    expect(isRtl("en")).toBe(false);
  });
  it("defaults unknown locales to LTR", () => {
    expect(directionForLocale("xx")).toBe("ltr");
    expect(isRtl("xx")).toBe(false);
  });
});
