/**
 * PHASE 89 — WCAG AA contrast gate for readable text tokens (dark theme).
 *
 * The legacy `--faint` (#4A5A6E) was used to colour ~709 tiny metadata/caption
 * labels at ~2.1-2.8:1 — far below WCAG 2.1 SC 1.4.3 (4.5:1 for normal text;
 * these are 9-12px so "normal", not "large"). Phase 89 introduced a dedicated
 * readable token `--color-text-metadata` and migrated every legacy faint text
 * use to it, leaving `--faint` only for the decorative bg/border surfaces. This
 * suite:
 *   1. computes real WCAG contrast from the live globals.css token values, so a
 *      future token edit that drops below AA fails here (not in a screenshot);
 *   2. blocks regression — the legacy sub-AA text utility may not reappear in
 *      shipped source, and the readable token may never be dimmed by opacity.
 *
 * Contrast is checked against the LIGHTEST surface a text token can sit on —
 * passing there guarantees AA on every darker surface.
 *
 * NOTE: the forbidden/canonical class tokens below are assembled from fragments
 * on purpose. Tailwind's content scanner reads this file (content glob covers
 * src/**), and a bare literal here would make Tailwind re-emit the very utility
 * we are trying to keep out of the production bundle.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const LEGACY_TEXT_UTILITY = ["text", "faint"].join("-");   // the retired sub-AA token
const READABLE_TEXT_UTILITY = ["text", "metadata"].join("-"); // its AA successor

const ROOT = process.cwd();
const css = readFileSync(resolve(ROOT, "src/app/globals.css"), "utf8");

function hex(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\b`));
  if (!m) throw new Error(`CSS custom property --${name} not found in globals.css`);
  return m[1];
}
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(h: string): number {
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(fg: string, bg: string): number {
  const a = luminance(fg) + 0.05, b = luminance(bg) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
}

// Every surface a readable text token can sit on; the lightest is the worst case.
const SURFACE_TOKENS = [
  "bg", "surface", "surface-2", "surface-3",
  "color-background-deep", "color-background-base",
  "color-surface-primary", "color-surface-elevated", "color-surface-interactive",
];
const surfaces = SURFACE_TOKENS.map(hex);
const lightestSurface = surfaces.reduce((a, b) => (luminance(b) > luminance(a) ? b : a));

const AA_NORMAL = 4.5;

describe("readable text tokens meet WCAG AA on the lightest surface", () => {
  it("--color-text-metadata (readable tertiary/caption text) is >= 4.5:1", () => {
    const c = contrast(hex("color-text-metadata"), lightestSurface);
    expect(c, `--color-text-metadata on lightest surface ${lightestSurface}`).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("--color-text-primary and --color-text-secondary are >= 4.5:1", () => {
    expect(contrast(hex("color-text-primary"), lightestSurface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(hex("color-text-secondary"), lightestSurface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("legacy --muted secondary stays >= 4.5:1", () => {
    expect(contrast(hex("muted"), lightestSurface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("legacy --faint remains defined but is sub-AA — proving why it must not colour text", () => {
    // If someone ever makes --faint AA-compliant they should instead retire it;
    // this asserts the decorative token is genuinely decorative-only.
    expect(hex("faint")).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(contrast(hex("faint"), hex("bg"))).toBeLessThan(AA_NORMAL);
  });
});

// ── Regression guards over shipped (non-test) source ────────────────────────
function walkSource(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "__tests__") continue;
      walkSource(join(dir, e.name), acc);
    } else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\.(tsx|ts)$/.test(e.name)) {
      acc.push(join(dir, e.name));
    }
  }
  return acc;
}
const sourceFiles = walkSource(resolve(ROOT, "src"));

describe("the sub-AA legacy faint text utility cannot regress into shipped source", () => {
  it(`no \`${LEGACY_TEXT_UTILITY}\` utility remains — readable text must use \`${READABLE_TEXT_UTILITY}\``, () => {
    const re = new RegExp(`\\b${LEGACY_TEXT_UTILITY}\\b`);
    const offenders = sourceFiles
      .filter((f) => re.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });

  it("the readable metadata token is never dimmed by an opacity modifier", () => {
    const re = new RegExp(`${READABLE_TEXT_UTILITY}\\/\\d+`);
    const offenders = sourceFiles
      .filter((f) => re.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });
});
