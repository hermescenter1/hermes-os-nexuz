/**
 * Every colour utility the executive surface uses must name a colour Tailwind
 * actually defines.
 *
 * Tailwind emits nothing for an unknown colour name, silently. The executive
 * views used `bg-base` and `text-fg` — neither exists in this config — and on
 * a `div` that merely looked transparent, but on the settings form's inputs it
 * left the browser's white field under near-white text. This test reads the
 * config itself, so a colour added there is accepted here with no edit.
 *
 * Opacity modifiers are refused on these colours too: every colour in the
 * config is a bare `var(--…)`, and Tailwind 3 cannot apply `/40` to a value it
 * cannot parse, so it emits nothing for `bg-signal/10` or `border-line/50` —
 * measured in the compiled stylesheet, which carries `border-amber-400/40` but
 * none of them. A dead border colour is worse than none: it falls back to the
 * default border colour. Use a token that carries its own tint
 * (`bg-surface-glass`, `border-border-subtle`, `bg-status-warning-subtle`…).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import config from "../../../../tailwind.config";

const ROOT = join(__dirname, "..", "..", "..", "..");
const DIRS = ["src/components/executive", "src/app/[locale]/dashboard/executive"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

const configColours = new Set(Object.keys((config.theme?.extend?.colors ?? {}) as Record<string, unknown>));
const colours = new Set([
  ...configColours,
  "transparent",
  "current",
  "inherit",
  "black",
  "white",
]);

/** Utilities sharing a colour prefix that are not colours. */
const NOT_A_COLOUR =
  /^(text-(xs|sm|base|lg|xl|[2-9]xl|start|end|left|right|center|justify)|border(-[xytbse])?(-[0-9]+)?|ring(-[0-9]+)?)$/;

describe("executive colour utilities", () => {
  const files = DIRS.flatMap(d => sources(join(ROOT, d)));

  it("finds the executive sources", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("uses only colours defined in tailwind.config.ts", () => {
    const unknown: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\b((?:bg|text|ring|border(?:-[xytbse])?)-([a-zA-Z][a-zA-Z0-9-]*))(\/\d+)?\b/g)) {
        const [, utility, name, opacity] = m;
        if (NOT_A_COLOUR.test(utility)) continue;
        const where = file.slice(ROOT.length + 1);
        if (!colours.has(name)) unknown.push(`${where}: ${utility}`);
        else if (opacity && configColours.has(name)) unknown.push(`${where}: ${utility}${opacity} (opacity modifier on a var() colour emits nothing)`);
      }
    }
    expect(unknown).toEqual([]);
  });
});
