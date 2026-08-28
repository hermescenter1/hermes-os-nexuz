/**
 * PHASE 104 final closure §9 — footer links must be thumb-sized on touch.
 *
 * Measured in a real browser at 390×844 during the pre-merge visual pass, the
 * seventeen footer links rendered 34px tall with a ONE pixel gap between
 * neighbours: 0.5rem of block padding over a 1.4 line-height on a 13px font.
 * That is comfortable with a mouse and hazardous with a thumb, and the footer
 * is a surface this branch rewrote, so it is in scope rather than inherited.
 *
 * The fix raises the target only where the pointer is coarse or the viewport is
 * narrow, leaving the desktop rhythm the footer was designed around untouched.
 * This test pins the mechanism: without the touch block it fails, and it also
 * fails if the base rule silently grows a min-block-size and starts changing
 * desktop layout instead.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The declaration block for a selector, base rule only (no media wrapper). */
function baseRule(selector: string): string {
  const i = css.indexOf(`\n${selector} {`);
  if (i < 0) throw new Error(`base rule not found: ${selector}`);
  const start = css.indexOf("{", i);
  return css.slice(start + 1, css.indexOf("}", start));
}

describe("PublicFooter link touch targets", () => {
  it("the base rule keeps the desktop rhythm: no min-block-size, 0.5rem padding", () => {
    const base = baseRule(".hf-reg-link");
    expect(base).toContain("padding-block: 0.5rem");
    // A min-block-size here would enlarge every link on desktop too, which is a
    // layout change nobody reviewed.
    expect(base).not.toMatch(/min-block-size|min-height/);
  });

  it("a touch-scoped block raises the target to at least 44px", () => {
    // Find the media block that owns .hf-reg-link and is NOT the reduced-motion one.
    const blocks = [...css.matchAll(/@media ([^{]+)\{\s*\.hf-reg-link \{([^}]*)\}/g)]
      .map((m) => ({ query: m[1].trim(), body: m[2] }))
      .filter((b) => !/prefers-reduced-motion/.test(b.query));

    expect(blocks.length, "no touch-scoped .hf-reg-link block found").toBeGreaterThan(0);
    const touch = blocks[0];

    // It must be scoped to touch or narrow viewports — never applied globally.
    expect(touch.query).toMatch(/pointer:\s*coarse|max-width/);

    const size = touch.body.match(/min-block-size:\s*([\d.]+)rem/);
    expect(size, "touch block must set a min-block-size in rem").not.toBeNull();
    // 1rem = 16px in this stylesheet's root; 2.75rem = 44px.
    expect(Number(size![1]) * 16).toBeGreaterThanOrEqual(44);

    // A min-height alone would not centre the label inside the taller box.
    expect(touch.body).toMatch(/align-items:\s*center/);
  });
});
