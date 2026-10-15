/**
 * Executive Management Center — horizontal-scroll containment.
 *
 * WHY THIS EXISTS
 * ---------------
 * Both executive tables are wider than a phone (`min-w-[40rem]` on the report
 * archive, `min-w-[34rem]` on the plants table) and are wrapped in
 * `overflow-x-auto` so they scroll inside their card instead of stretching the
 * page. That works for the table itself — but NOT for the `sr-only` labels
 * inside it. `sr-only` is `position: absolute`, and an absolutely positioned
 * element is clipped by a scroll container only when that container is its
 * containing block. A `position: static` wrapper is not, so the screen-reader
 * span escaped the scroller and set `document.scrollWidth` to its own right
 * edge: measured live at 375 px, the report archive reported scrollWidth 584
 * against clientWidth 375 in BOTH locales — a 209 px horizontal page scroll on
 * every phone. Removing `relative` at runtime brought the overflow straight
 * back (375 -> 584 -> 375), which is what identified the cause.
 *
 * Layout is not observable in jsdom, so this is deliberately a source contract
 * rather than a render test: it locks the one class that makes the wrapper the
 * containing block. A future table that adds a scroll wrapper without it fails
 * here instead of silently shipping a sideways-scrolling page.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");

/** Every executive surface that wraps a table in a horizontal scroller. */
const SURFACES = [
  "src/app/[locale]/dashboard/executive/reports/page.tsx",
  "src/components/executive/ExecutiveSummaryView.tsx",
] as const;

/** `className="..."` values that turn the element into a horizontal scroller. */
function scrollWrapperClassNames(source: string): string[] {
  const found: string[] = [];
  const pattern = /className="([^"]*\boverflow-x-auto\b[^"]*)"/g;
  for (const match of source.matchAll(pattern)) found.push(match[1]);
  return found;
}

describe("executive tables stay inside their scroll container", () => {
  for (const surface of SURFACES) {
    const source = readFileSync(join(ROOT, surface), "utf8");
    const wrappers = scrollWrapperClassNames(source);

    it(`${surface} still has a horizontal scroll wrapper`, () => {
      // Guards the test itself: if the markup is restructured away, the
      // assertion below would pass vacuously.
      expect(wrappers.length).toBeGreaterThan(0);
    });

    it(`${surface} makes every scroll wrapper a containing block`, () => {
      for (const className of wrappers) {
        expect(className.split(/\s+/)).toContain("relative");
      }
    });
  }

  it("the tables these wrappers hold are genuinely wider than a phone", () => {
    // If the tables ever stop being over-wide the wrappers are harmless, but
    // the comment above would be wrong — so state the premise as a check.
    const widths = SURFACES.flatMap(surface =>
      [...readFileSync(join(ROOT, surface), "utf8").matchAll(/min-w-\[(\d+)rem\]/g)].map(m =>
        Number(m[1]),
      ),
    );
    expect(widths.length).toBe(SURFACES.length);
    for (const rem of widths) expect(rem * 16).toBeGreaterThan(375);
  });
});
