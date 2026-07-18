import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("Card variants — 87L.1 filled glass system", () => {
  it("standard is the filled glass card", () => {
    expect(cardVariants("standard")).toContain("ds-glass-card");
  });
  it("elevated, hero and soft map to their glass tiers", () => {
    expect(cardVariants("elevated")).toContain("ds-glass-elevated");
    expect(cardVariants("hero")).toContain("ds-glass-hero");
    expect(cardVariants("soft")).toContain("ds-glass-soft");
  });
  it("glass stays the OVERLAY glass (modal/toolbar), distinct from the card fill", () => {
    const c = cardVariants("glass");
    expect(c).toContain("ds-glass");
    expect(c).not.toContain("ds-glass-card");
  });
  it("interactive is focusable, clickable and uses the interactive glass", () => {
    const c = cardVariants("interactive");
    expect(c).toContain("ds-glass-interactive");
    expect(c).toContain("ds-focus");
    expect(c).toContain("cursor-pointer");
  });
  it("padding is applied by default and removable", () => {
    expect(cardVariants("standard")).toContain("p-5");
    expect(cardVariants("standard", { padded: false })).not.toContain("p-5");
  });
  it("every glass utility is defined in globals.css with reduced-motion cover", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const cls of [".ds-glass-card", ".ds-glass-soft", ".ds-glass-elevated", ".ds-glass-hero", ".ds-glass-interactive"]) {
      expect(css, cls).toContain(cls);
    }
    // hero is the ONLY app-card variant allowed to backdrop-blur
    // (match rule openings, not the utility names inside the doc comment)
    // NB: ".ds-glass-interactive {" first occurs in the shared fill selector
    // ABOVE hero — lastIndexOf targets its standalone transition rule below.
    const heroBlock = css.slice(css.indexOf(".ds-glass-hero {"), css.lastIndexOf(".ds-glass-interactive {"));
    expect(heroBlock).toContain("backdrop-filter");
    const cardBlock = css.slice(css.indexOf(".ds-glass-card,"), css.indexOf(".ds-glass-hero {"));
    expect(cardBlock).not.toContain("backdrop-filter");
  });
});

describe("Card motion — 87L.2 buoyant interaction", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  /** The 87L.2 section: from its banner to the focus-foundation comment. */
  const section = css.slice(css.indexOf("PHASE 87L.2"), css.indexOf("Focus foundation"));
  /** Everything inside `@media (hover: hover) and (pointer: fine)`. */
  const hoverBlock = section.slice(
    section.indexOf("@media (hover: hover) and (pointer: fine)"),
    section.indexOf("@keyframes ds-buoy-quiet"),
  );
  const reducedBlock = section.slice(section.indexOf("@media (prefers-reduced-motion: reduce)"));

  it("defines a buoyancy keyframe per animated tier, with 1–2px drift", () => {
    for (const kf of ["ds-buoy-quiet", "ds-buoy-interactive", "ds-buoy-elevated"]) {
      expect(section, kf).toContain(`@keyframes ${kf}`);
    }
    // each `from` mirrors its hover transform so the handoff cannot jump
    expect(section).toContain("from { transform: translate3d(0, -6px, 0) scale(1.012); }");
    expect(section).toContain("to   { transform: translate3d(0, -7.5px, 0) scale(1.012); }");
  });

  it("hero never bobs — large slow elevation only", () => {
    const hero = hoverBlock.slice(hoverBlock.indexOf(".ds-glass-hero:hover"), hoverBlock.indexOf(".ds-glass-soft {"));
    expect(hero).toContain("translate3d(0, -8px, 0)");
    expect(hero).not.toContain("animation:");
  });

  it("soft utility surfaces stay quietest — small lift, no buoyancy", () => {
    const soft = hoverBlock.slice(hoverBlock.indexOf(".ds-glass-soft:hover"));
    expect(soft).toContain("translate3d(0, -2px, 0)");
    expect(soft).not.toContain("animation:");
  });

  it("keeps the lift hierarchy distinct: soft < default < elevated < interactive < hero", () => {
    const lift = (sel: string) => {
      const rule = hoverBlock.slice(hoverBlock.indexOf(sel));
      return Number(rule.match(/translate3d\(0, -([\d.]+)px, 0\)/)![1]);
    };
    expect(lift(".ds-glass-soft:hover")).toBeLessThan(lift(".ds-glass-card:hover"));
    expect(lift(".ds-glass-card:hover")).toBeLessThan(lift(".ds-glass-elevated:hover"));
    expect(lift(".ds-glass-elevated:hover")).toBeLessThan(lift(".ds-glass-interactive:hover"));
    expect(lift(".ds-glass-interactive:hover")).toBeLessThan(lift(".ds-glass-hero:hover"));
    // scale is reserved for the interactive tier and stays within 1.008–1.015
    expect(hoverBlock.match(/scale\(([\d.]+)\)/g)).toEqual(["scale(1.012)"]);
  });

  it("all hover motion is gated on a fine hovering pointer (touch stays static)", () => {
    for (const sel of [".ds-glass-card:hover", ".ds-glass-interactive:hover", ".ds-glass-elevated:hover", ".ds-glass-hero:hover", ".ds-glass-soft:hover"]) {
      expect(hoverBlock, sel).toContain(sel);
    }
    // no :hover motion rule escapes the media query
    const outsideHoverGate = section.replace(hoverBlock, "").replace(reducedBlock, "");
    expect(outsideHoverGate).not.toMatch(/:hover\s*\{[^}]*(transform|animation)/);
  });

  it("reduced motion removes every lift, scale and drift but keeps hover legible", () => {
    expect(reducedBlock).toContain("transform: none;");
    expect(reducedBlock).toContain("animation: none;");
    expect(reducedBlock).toContain("will-change: auto;");
    for (const sel of [".ds-glass-card:hover", ".ds-glass-interactive:hover", ".ds-glass-elevated:hover", ".ds-glass-hero:hover", ".ds-glass-soft:hover"]) {
      expect(reducedBlock, sel).toContain(sel);
    }
  });

  it("keyboard parity is a stable lift — focus never bobs and is never hidden", () => {
    const focus = section.slice(section.indexOf(".ds-glass-card:focus-visible"), section.indexOf("@media (prefers-reduced-motion"));
    expect(focus).toContain(":focus-within");
    expect(focus).toContain("animation: none;");
    expect(section).not.toContain("outline: none");
  });

  it("no rotation, no expensive filters and no permanent will-change", () => {
    expect(section).not.toMatch(/rotate|skew|perspective|blur\(|ripple|noise/);
    // will-change appears only inside :hover rules, never on a base selector
    for (const m of section.matchAll(/will-change:\s*transform/g)) {
      const before = section.slice(0, m.index);
      expect(before.slice(before.lastIndexOf("{") - 120)).toContain(":hover");
    }
  });

  it("is CSS-only — no pointer tracking, no animation library in the card layer", () => {
    // NOTE: framer-motion pre-exists in package.json for unrelated modules.
    // The 87L.2 contract is that the CARD LAYER imports no animation library
    // and tracks no pointer; the diff gate proves no dependency was added.
    for (const rel of ["src/components/ds/Card.tsx", "src/components/ds/logic.ts"]) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src, rel).not.toMatch(/framer-motion|gsap|three|lottie|popmotion/);
      expect(src, rel).not.toMatch(/onMouseMove|onPointerMove|addEventListener|requestAnimationFrame/);
    }
    // the buoyancy lives entirely in CSS, not in the variant strings
    expect(cardVariants("interactive")).not.toContain("ds-buoy");
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
