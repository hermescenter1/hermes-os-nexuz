// @vitest-environment jsdom
/**
 * PHASE 109-C1 — muted text in the Studio meets WCAG 1.4.3 (4.5:1, unrounded).
 *
 * The authenticated browser matrix measured six distinct failures in every
 * locale, all the same defect in two tokens:
 *
 *     text-white/40   3.71 – 3.78 : 1     command-bar and overview <dt> labels
 *     text-white/45   4.45 – 4.50 : 1     table headers, status bar, adapter id,
 *                                          "this version is a draft" notice
 *
 * The backgrounds below are the EFFECTIVE backgrounds the harness composited
 * for those elements (Porter-Duff over the real panel stack), copied from
 * BROWSER-MATRIX-RESULT.json. Both tokens are now text-white/50, the smallest
 * 5 % step that passes on every one of them. The arithmetic here is the WCAG
 * definition, not a library, so the test cannot drift from the standard.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import { resolveWorkspaceSource } from "@/lib/automation-studio";
import { StudioWorkspace } from "../StudioWorkspace";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/engineering/studio",
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

/* ------------------------------------------------------------------ */
/* WCAG arithmetic                                                     */
/* ------------------------------------------------------------------ */

interface Rgb { readonly r: number; readonly g: number; readonly b: number }

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, UNROUNDED. */
function contrastRatio(fg: Rgb, bg: Rgb): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** White at `alpha` composited over an opaque background (source-over). */
function whiteOver(alpha: number, bg: Rgb): Rgb {
  return {
    r: 255 * alpha + bg.r * (1 - alpha),
    g: 255 * alpha + bg.g * (1 - alpha),
    b: 255 * alpha + bg.b * (1 - alpha),
  };
}

/** Effective backgrounds measured by the browser harness, per failing element. */
const MEASURED_BACKGROUNDS: readonly (readonly [string, Rgb])[] = [
  ["command bar <dt>",          { r: 4.9,  g: 7.7,  b: 14 }],
  ["companion / overview <dt>", { r: 7,    g: 11,   b: 20 }],
  ["output panel <th>",         { r: 3.15, g: 4.95, b: 9 }],
  ["status bar",                { r: 4.2,  g: 6.6,  b: 12 }],
  // Not measured by the harness, but the lightest surface muted text can sit
  // on: a hovered row (bg-white/10) over the companion panel.
  ["hovered row (white/10)",    { r: 31.8, g: 35.4, b: 43.5 }],
];

const REQUIRED = 4.5;
const MUTED_ALPHA = 0.5;

describe("109-C1 · muted text token arithmetic", () => {
  it.each(MEASURED_BACKGROUNDS)("text-white/50 passes 4.5:1 unrounded on the %s", (_label, bg) => {
    expect(contrastRatio(whiteOver(MUTED_ALPHA, bg), bg)).toBeGreaterThanOrEqual(REQUIRED);
  });

  it("the previous tokens really failed — the threshold is not decorative", () => {
    // Reproduces the harness numbers to two decimals so a future change to
    // the arithmetic above would be noticed, not just a change to the token.
    const cmdBar = MEASURED_BACKGROUNDS[0][1];
    const thead = MEASURED_BACKGROUNDS[2][1];
    expect(contrastRatio(whiteOver(0.40, cmdBar), cmdBar)).toBeCloseTo(3.74, 2);
    expect(contrastRatio(whiteOver(0.45, thead), thead)).toBeCloseTo(4.45, 2);
    expect(contrastRatio(whiteOver(0.40, cmdBar), cmdBar)).toBeLessThan(REQUIRED);
    expect(contrastRatio(whiteOver(0.45, thead), thead)).toBeLessThan(REQUIRED);
  });

  it("50 % is the smallest 5 % step that passes everywhere", () => {
    const worst = (alpha: number) =>
      Math.min(...MEASURED_BACKGROUNDS.map(([, bg]) => contrastRatio(whiteOver(alpha, bg), bg)));
    expect(worst(0.45)).toBeLessThan(REQUIRED);
    expect(worst(0.50)).toBeGreaterThanOrEqual(REQUIRED);
  });

  it("does not round before comparing", () => {
    // 4.4996 must fail. Rounding first would turn it into a pass, which is the
    // wrong direction to be generous in.
    const fg = { r: 116.4825, g: 117.4725, b: 119.7 };
    const bg = { r: 3.15, g: 4.95, b: 9 };
    const ratio = contrastRatio(fg, bg);
    expect(Number(ratio.toFixed(1))).toBe(4.5);
    expect(ratio).toBeLessThan(REQUIRED);
  });
});

/* ------------------------------------------------------------------ */
/* the tokens as shipped                                               */
/* ------------------------------------------------------------------ */

const STUDIO_UI = join(__dirname, "..");

function studioComponentSources(): string[] {
  return readdirSync(STUDIO_UI)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => join(STUDIO_UI, name));
}

describe("109-C1 · the failing tokens are gone from the Studio", () => {
  it("no Studio component uses text-white/40 or text-white/45 for text", () => {
    const offenders: string[] = [];
    for (const file of studioComponentSources()) {
      const src = readFileSync(file, "utf8");
      for (const token of ["text-white/40", "text-white/45"]) {
        // A word boundary: text-white/40 must not match text-white/400 (no such
        // class), but must not be fooled by a following quote or space either.
        const re = new RegExp(`${token.replace("/", "\\/")}(?![0-9])`, "g");
        if (re.test(src)) offenders.push(`${file}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("109-C1 · the corrected classes reach the rendered DOM", () => {
  async function render(): Promise<HTMLElement> {
    document.body.replaceChildren();
    const { container } = await mount(
      <NextIntlClientProvider locale="en" messages={en}>
        <StudioWorkspace source={resolveWorkspaceSource()} />
      </NextIntlClientProvider>,
    );
    return container;
  }

  it("every <dt> label — command bar, companion summary, inspector — is text-white/50", async () => {
    const el = await render();
    const labels = [...el.querySelectorAll("dt")];
    expect(labels.length).toBeGreaterThan(0);
    for (const dt of labels) {
      expect(dt.className, dt.textContent ?? "").toContain("text-white/50");
      expect(dt.className).not.toMatch(/text-white\/4\d(?![0-9])/);
    }
  });

  it("the status bar, its toggle and the adapter identifier are text-white/50", async () => {
    const el = await render();
    const adapter = el.querySelector("#studio-adapter-id");
    expect(adapter).not.toBeNull();
    const bar = adapter!.parentElement!;
    expect(bar.className).toContain("text-white/50");
    // The toggle and the draft notice inherit the bar's colour; nothing inside
    // re-lowers it.
    for (const child of [...bar.children]) {
      expect(child.className).not.toMatch(/text-white\/[0-4]\d(?![0-9])/);
    }
  });

  it("the output panel's table header is text-white/50", async () => {
    const el = await render();
    const thead = el.querySelector("thead");
    expect(thead, "the problems table renders with the demo findings").not.toBeNull();
    expect(thead!.className).toContain("text-white/50");
  });
});
