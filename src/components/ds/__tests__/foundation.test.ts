import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FOCUS_RING } from "../logic";

/**
 * PHASE 87B foundation tests — verify the design tokens, Tailwind mapping, and
 * the focus / reduced-motion / LTR-isolation CSS actually exist with the
 * approved values. These parse the source files (no renderer needed) so a
 * regression in the token layer fails CI.
 */

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const globals = read("../../../app/globals.css");
const tailwind = read("../../../../tailwind.config.ts");
// The config is column-aligned; collapse runs of whitespace so assertions are
// insensitive to formatting while still verifying key → value mappings.
const tailwindNorm = tailwind.replace(/\s+/g, " ");

describe("design tokens — globals.css", () => {
  it.each([
    ["--color-background-deep", "#040A0F"],
    ["--color-background-base", "#071018"],
    ["--color-surface-primary", "#0C1720"],
    ["--color-surface-elevated", "#11212C"],
    ["--color-surface-interactive", "#152A36"],
    ["--color-brand-primary", "#16D9E3"],
    ["--color-brand-ice", "#8BF4F8"],
    ["--color-brand-deep", "#0795A5"],
    ["--color-intelligence-azure", "#3B82F6"],
    ["--color-reasoning-violet", "#8B7CFF"],
    ["--color-text-primary", "#EDF7FA"],
    ["--color-text-secondary", "#A9BAC6"],
    ["--color-text-muted", "#708694"],
    ["--color-text-disabled", "#495C68"],
    ["--color-border-default", "#203743"],
    ["--color-border-active", "#21C9D5"],
    ["--color-status-success", "#38D996"],
    ["--color-status-warning", "#F5B942"],
    ["--color-status-danger", "#F05D68"],
    ["--color-status-information", "#54A6FF"],
    ["--color-focus-ring", "#16D9E3"],
  ])("%s = %s (matches Figma board 03)", (token, value) => {
    expect(globals).toContain(`${token}:`);
    // token line carries the approved hex (case-insensitive)
    const line = globals.split("\n").find((l) => l.includes(`${token}:`)) ?? "";
    expect(line.toLowerCase()).toContain(value.toLowerCase());
  });

  it("defines radius, elevation and motion scales", () => {
    for (const t of ["--radius-xs", "--radius-md", "--radius-2xl", "--radius-full"]) expect(globals).toContain(t);
    for (const t of ["--shadow-e1", "--shadow-e2", "--shadow-e3", "--shadow-e4"]) expect(globals).toContain(t);
    for (const t of ["--motion-instant", "--motion-fast", "--motion-standard", "--motion-slow"]) expect(globals).toContain(t);
  });

  it("does NOT alter the legacy tokens (no regression on existing pages)", () => {
    expect(globals).toContain("--bg:        #06080D");
    expect(globals).toContain("--signal:     #1EC8A4");
  });
});

describe("focus foundation", () => {
  it("FOCUS_RING constant is the ds-focus class", () => {
    expect(FOCUS_RING).toBe("ds-focus");
  });
  it("ds-focus renders a visible ring only on :focus-visible", () => {
    expect(globals).toMatch(/\.ds-focus:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus-ring\)/);
  });
});

describe("reduced-motion foundation", () => {
  it("honours prefers-reduced-motion for ds animations", () => {
    const block = globals.slice(globals.indexOf("@media (prefers-reduced-motion: reduce)", globals.indexOf("PHASE 87B")));
    expect(block).toContain(".ds-pulse");
    expect(block).toMatch(/\.ds-pulse\s*\{\s*animation:\s*none/);
    expect(block).toContain(".ds-skeleton");
  });
});

describe("technical LTR isolation", () => {
  it("ds-code forces LTR and isolates bidi", () => {
    const rule = globals.slice(globals.indexOf(".ds-code"), globals.indexOf(".ds-code") + 260);
    expect(rule).toContain("direction: ltr");
    expect(rule).toContain("unicode-bidi: isolate");
  });
  it("TechnicalValue renders a <bdi dir=\"ltr\">", () => {
    const src = read("../TechnicalValue.tsx");
    expect(src).toContain("<bdi dir=\"ltr\"");
  });
});

describe("controlled glass", () => {
  it("ds-glass uses the approved surface + backdrop blur", () => {
    const rule = globals.slice(globals.indexOf(".ds-glass"), globals.indexOf(".ds-glass") + 260);
    expect(rule).toContain("var(--color-surface-glass)");
    expect(rule).toContain("backdrop-filter: blur(");
  });
});

describe("Tailwind mapping — tailwind.config.ts", () => {
  it.each([
    '"background-base": "var(--color-background-base)"',
    '"surface-primary": "var(--color-surface-primary)"',
    '"surface-elevated": "var(--color-surface-elevated)"',
    '"surface-interactive": "var(--color-surface-interactive)"',
    '"brand-primary": "var(--color-brand-primary)"',
    '"text-primary": "var(--color-text-primary)"',
    '"border-default": "var(--color-border-default)"',
    '"border-active": "var(--color-border-active)"',
    '"status-success": "var(--color-status-success)"',
    '"status-danger": "var(--color-status-danger)"',
  ])("maps %s", (entry) => {
    expect(tailwindNorm).toContain(entry);
  });

  it("maps elevation, radius and motion scales", () => {
    expect(tailwindNorm).toContain('"e2": "var(--shadow-e2)"');
    expect(tailwindNorm).toContain('"md": "var(--radius-md)"');
    expect(tailwindNorm).toContain('"standard": "var(--motion-standard)"');
  });

  it("retains the legacy Tailwind color keys (backward compatibility)", () => {
    expect(tailwindNorm).toContain('signal: "var(--signal)"');
    expect(tailwindNorm).toContain('ink: "var(--ink)"');
  });
});
