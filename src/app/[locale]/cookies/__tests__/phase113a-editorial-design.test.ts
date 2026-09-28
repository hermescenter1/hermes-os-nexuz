import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATEGORY_ORDER,
  STORAGE_INVENTORY,
  THIRD_PARTY_INVENTORY,
} from "@/lib/compliance/cookie-inventory";

/**
 * PHASE 113-A — the Cookie Policy's editorial design contract.
 *
 * The first implementation was rejected on design, not on content: every
 * category and every third party sat in its own rounded card, the controls were
 * large pills, and fourteen sections of legal text arrived as a dozen separate
 * bubbles. Nothing in the test suite could have caught that, because nothing
 * expressed the corner language or the document structure as a rule.
 *
 * These assertions are the rule. They are deliberately about STRUCTURE and
 * MEASURABLE geometry — the section list, the table columns, the radius ceiling,
 * the logical-property direction handling — and never about a specific pixel or
 * a specific shade, which would make routine visual work fail a gate for no
 * reason.
 *
 * The palette's provenance (the owner's own ZHARFA corporate repository) and the
 * "nothing exceeds 8px" corner law are recorded in `globals.css` beside the
 * rules themselves and in `docs/release/phase113-cookie-visual-system.md`.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const PAGE = "src/app/[locale]/cookies/page.tsx";
const CSS = "src/app/globals.css";
const BUTTON = "src/components/compliance/ManageCookiePreferencesButton.tsx";
const BANNER = "src/components/compliance/CookieConsentBanner.tsx";

/** The `.hz-legal` block only — no other part of globals.css is in scope. */
function hzBlock(): string {
  const css = read(CSS);
  const start = css.indexOf(".hz-legal {");
  expect(start, "the hz- visual system must exist in globals.css").toBeGreaterThan(-1);
  return css.slice(start);
}

/** One rule body, by selector. Safe because no rule body here contains a brace. */
function hzRule(selector: string): string {
  const block = hzBlock();
  const at = block.indexOf(`${selector} {`);
  expect(at, `the rule for \`${selector}\` must exist`).toBeGreaterThan(-1);
  return block.slice(at, block.indexOf("}", at) + 1);
}

/** Every rule in the block as selector + body, with comment lines discarded. */
function hzRules(): { selector: string; body: string }[] {
  return [...hzBlock().matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].split(/[\r\n]/).pop()!.trim(),
    body: m[2],
  }));
}

/* ── 1 · The corner language: nothing capsule-shaped ─────────────────────── */

describe("corner language — architectural, not SaaS", () => {
  it("declares a radius scale whose largest value is 8px", () => {
    const block = hzBlock();
    const button = /--hz-radius-button:\s*(\d+)px/.exec(block);
    const card   = /--hz-radius-card:\s*(\d+)px/.exec(block);
    const panel  = /--hz-radius-panel:\s*(\d+)px/.exec(block);
    expect(button, "--hz-radius-button must be declared").not.toBeNull();
    expect(card,   "--hz-radius-card must be declared").not.toBeNull();
    expect(panel,  "--hz-radius-panel must be declared").not.toBeNull();
    const values = [button, card, panel].map((m) => Number(m![1]));
    for (const v of values) expect(v).toBeLessThanOrEqual(8);
    // Controls must be the tightest of the three.
    expect(Number(button![1])).toBeLessThanOrEqual(Number(card![1]));
  });

  it("no rule anywhere in the document rounds past the 8px ceiling", () => {
    // PHASE 113 VISUAL ACCEPTANCE — this band used to stop short of 999px,
    // which left the capsule itself legal and let `.hz-chip` keep a pill. The
    // owner withdrew that exception, so the ceiling is now absolute: above 8px
    // there is no value a rule in this block may use, capsule or otherwise.
    const offenders = [...hzBlock().matchAll(/border-radius:\s*([0-9.]+)(px|rem|%)/g)]
      .map((m) => ({
        raw: m[0],
        px: m[2] === "rem" ? Number(m[1]) * 16 : m[2] === "%" ? Number(m[1]) * 10 : Number(m[1]),
      }))
      .filter((r) => r.px > 8);
    expect(offenders.map((o) => o.raw)).toEqual([]);
  });

  it("not one selector in the document is capsule-shaped", () => {
    // Rule-by-rule, so a selector pattern cannot greedily swallow the comment
    // above it. The first pass granted ITSELF one capsule and this test named
    // the beneficiary; the owner withdrew that grant at visual acceptance, so
    // the expected set is empty and any re-introduced pill fails here by name.
    const capsuleSelectors = hzRules()
      .filter((r) => /border-radius:\s*(9{3,}px|[5-9][0-9]%|100%)/.test(r.body))
      .map((r) => r.selector);
    expect(capsuleSelectors).toEqual([]);
  });

  it("the status chip carries the shared 3px button corner", () => {
    const chip = hzRule(".hz-chip");
    // The TOKEN, not a literal: a hard-coded 999px is how the chip drifted off
    // the scale to begin with, and a token cannot drift on its own without
    // moving the whole scale, which the ceiling test above would then catch.
    expect(chip).toMatch(/border-radius:\s*var\(--hz-radius-button\)/);
    // Everything else about the chip is deliberately unchanged: it stays a small
    // semantic label, not a button.
    const size = /font-size:\s*([0-9.]+)rem/.exec(chip);
    expect(Number(size![1])).toBeLessThanOrEqual(0.7);
    expect(chip).toMatch(/text-transform:\s*uppercase/);
    expect(chip).toMatch(/color:\s*var\(--hz-text-2\)/);
  });

  it("the page renders no oversized rounded container and no capsule utility", () => {
    const page = read(PAGE);
    // Tailwind's large-radius and capsule utilities, which produced the rejected
    // card-stack look. `rounded-xs`/`rounded-sm` (4px/6px) remain allowed.
    for (const banned of ["rounded-full", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-3xl"]) {
      expect(page, `the policy page must not use ${banned}`).not.toContain(banned);
    }
  });

  it("the consent dialog shares the same corner ceiling, keeping only the switch as a capsule", () => {
    const banner = read(BANNER);
    for (const banned of ["rounded-lg", "rounded-xl", "rounded-2xl"]) {
      expect(banner, `the consent dialog must not use ${banned}`).not.toContain(banned);
    }
    // The toggle track and knob are a switch — a control whose shape is its
    // meaning — so they stay round. Two, and only two.
    expect((banner.match(/rounded-full/g) ?? []).length).toBe(2);
  });
});

/* ── 1b · The light sheet beats the app's dark type colour ──────────────── */

describe("the editorial sheet states its own heading colour", () => {
  it("the site-wide h1-h6 element rule is the hazard being guarded against", () => {
    // This is the mechanism, asserted so the guard below is not mistaken for
    // decoration. globals.css paints EVERY heading element with the dark-chrome
    // ink. `.hz-legal` only sets `color` on its container, and inheritance loses
    // to a matching element selector — so on this light sheet a heading that
    // states no colour of its own renders near-white on near-white.
    const global = /h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{[^}]*\}/.exec(read(CSS));
    expect(global, "the site-wide heading rule must still exist").not.toBeNull();
    expect(global![0]).toMatch(/color:/);
  });

  it("every heading styled inside the sheet declares its own colour", () => {
    // A sweep rather than a list, so a heading added later is covered without
    // anyone remembering to edit this test. All fourteen section titles
    // measured 1.05:1 against the sheet because `.hz-section > h2` was the one
    // rule here that named no colour.
    const headings = hzRules().filter((r) => /(^|[\s>+~])h[1-6]([\s,:]|$)/.test(r.selector));
    expect(headings.length, "the sheet must style at least one heading").toBeGreaterThan(0);
    for (const rule of headings) {
      expect(rule.body, `\`${rule.selector}\` must state its own colour`).toMatch(
        /\bcolor:\s*var\(--hz-/,
      );
    }
  });

  it("the section heading takes the document ink, not the app ink", () => {
    const h2 = hzRule(".hz-section > h2");
    expect(h2).toMatch(/color:\s*var\(--hz-text\)/);
    expect(h2, "the app chrome ink is what made it invisible").not.toMatch(/var\(--ink\)/);
    // The fix is a colour and nothing else: copy, hierarchy, size and spacing
    // are unchanged, so the grid and the clamp must still be here.
    expect(h2).toMatch(/grid-template-columns:\s*2\.75rem/);
    expect(h2).toMatch(/font-size:\s*clamp\(/);
    expect(h2).toMatch(/font-weight:\s*600/);
  });
});

/* ── 2 · Document structure, not a card stack ───────────────────────────── */

describe("editorial document structure", () => {
  it("the section list is one source that feeds both the index and the body", () => {
    const page = read(PAGE);
    expect(page).toMatch(/const SECTIONS: readonly DocSection\[\]/);
    // Both renderers map the same array — the index cannot list a section that
    // does not exist, and a section cannot exist unindexed.
    expect((page.match(/SECTIONS\.map\(/g) ?? []).length).toBe(2);
  });

  it("the document has fourteen sections, four of which are the consent categories", () => {
    const page = read(PAGE);
    const block = /const SECTIONS: readonly DocSection\[\] = \[([\s\S]*?)\n\];/.exec(page);
    expect(block, "the SECTIONS array must be declared as a literal").not.toBeNull();
    const explicit = [...block![1].matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
    // The four category sections are generated from CATEGORY_ORDER, so the
    // literal holds the other ten.
    expect(block![1]).toContain("CATEGORY_ORDER.map");
    expect(explicit.length + CATEGORY_ORDER.length).toBe(14);
    expect(new Set(explicit).size, "section ids must be unique").toBe(explicit.length);
  });

  it("sections are separated by a rule, not wrapped in panels", () => {
    const block = hzBlock();
    expect(block).toMatch(/\.hz-section \+ \.hz-section \{\s*border-block-start:/);
    // A section must not be a filled, bordered, rounded box.
    const section = /\.hz-section \{[^}]*\}/.exec(block)![0];
    expect(section).not.toMatch(/background/);
    expect(section).not.toMatch(/border-radius/);
    expect(section).not.toMatch(/box-shadow/);
  });

  it("every section carries an ordinal and a real heading", () => {
    const page = read(PAGE);
    expect(page).toContain('className="hz-ord"');
    // The ordinal is decoration over the heading text, so it is hidden from AT.
    expect(page).toMatch(/className="hz-ord" aria-hidden="true"/);
    expect(page).toMatch(/const ordinal = \(i: number\)/);
  });

  it("the reading column is width-limited and the index is a landmark", () => {
    expect(hzBlock()).toMatch(/\.hz-doc \{\s*max-width:\s*\d+ch/);
    const page = read(PAGE);
    expect(page).toMatch(/<nav aria-labelledby="hz-toc-heading">/);
    expect(page).toMatch(/<details className="hz-toc" open>/);
  });
});

/* ── 3 · The inventory table ─────────────────────────────────────────────── */

describe("inventory table", () => {
  it("declares the five columns the governance brief asks for", () => {
    const page = read(PAGE);
    for (const col of ["colName", "colPurpose", "colCategory", "colRetention", "colProvider", "colScope"]) {
      expect(page, `table.${col} must be used`).toContain(`t("table.${col}")`);
    }
  });

  it("re-flows instead of overflowing below the table breakpoint", () => {
    const block = hzBlock();
    // The mobile rule set must exist, hide the header row accessibly, and label
    // each cell from its own data-label.
    expect(block).toMatch(/@media \(max-width: 767px\)/);
    expect(block).toMatch(/\.hz-table thead \{[^}]*clip-path: inset\(50%\)/);
    expect(block).toMatch(/content: attr\(data-label\)/);
    // No horizontal scroll container is introduced anywhere in the block.
    expect(block).not.toMatch(/overflow-x:\s*(auto|scroll)/);
    // …and a 320px-class breakpoint drops the label column entirely.
    expect(block).toMatch(/@media \(max-width: 360px\)/);
  });

  it("every cell is labelled, so the stacked view is never ambiguous", () => {
    const page = read(PAGE);
    const cells = (page.match(/<td data-label=/g) ?? []).length;
    const bodyHeaders = (page.match(/<th scope="row" data-label=/g) ?? []).length;
    expect(cells).toBeGreaterThan(0);
    expect(bodyHeaders).toBeGreaterThan(0);
    // No body cell may exist without a label.
    expect((page.match(/<td(?! data-label)/g) ?? []).length).toBe(0);
  });

  it("technical identifiers stay LTR inside a Persian document", () => {
    const block = hzBlock();
    const code = /\.hz-code \{[^}]*\}/.exec(block)![0];
    expect(code).toMatch(/direction:\s*ltr/);
    expect(code).toMatch(/unicode-bidi:\s*isolate/);
  });

  it("the table still renders the real inventory, with no retyped technical values", () => {
    const page = read(PAGE);
    // Names, purposes and retentions come from the inventory module.
    expect(page).toContain("storageForCategory");
    expect(page).toContain("THIRD_PARTY_INVENTORY");
    expect(page).toContain("entry.maxAgeSeconds");
    // No cookie name is written into the page.
    for (const entry of STORAGE_INVENTORY) {
      expect(page, `${entry.name} must not be hard-coded in the page`).not.toContain(`"${entry.name}"`);
    }
    // The first-party provider is the product constant, not a per-row literal.
    expect(page).toMatch(/data-label=\{COLS\.provider\}><span>\{SITE_NAME\}</);
    // A third party's own lifetimes are not invented.
    expect(page).toContain('t("storage.retentionProviderDefined")');
    expect(THIRD_PARTY_INVENTORY.length).toBeGreaterThan(0);
  });
});

/* ── 4 · Direction, motion and accessibility ─────────────────────────────── */

describe("direction, motion and accessibility", () => {
  it("uses logical properties so Persian RTL needs no mirrored stylesheet", () => {
    // The disclosure chevron is excised first and asserted on its own below: it
    // is a DRAWN GLYPH, not layout, and this very rule — applied to it without
    // that distinction — is what mirrored it under RTL.
    const block = hzBlock().replace(/\.hz-toc > summary::after \{[^}]*\}/, ' ');
    expect(block).toMatch(/border-block-start|border-block-end/);
    expect(block).toMatch(/padding-inline|margin-block-start/);
    expect(block).toMatch(/text-align:\s*start/);
    // Physical left/right layout properties would break RTL.
    expect(block, "no physical text-align").not.toMatch(/text-align:\s*(left|right)/);
    expect(block, "no physical border-left/right").not.toMatch(/border-(left|right):/);
    expect(block, "no physical padding-left/right").not.toMatch(/padding-(left|right):/);
    expect(block, "no physical margin-left/right").not.toMatch(/margin-(left|right):/);
  });

  it("draws the disclosure chevron with direction-independent geometry", () => {
    // Comments stripped: the rule EXPLAINS why it avoids the logical edge, so a
    // naive text search for that property would match the explanation.
    const rule = hzRule(".hz-toc > summary::after").replace(/\/\*[\s\S]*?\*\//g, ' ');
    // Logical inline edges swap sides under RTL while the two rotate() values
    // below are fixed, so in Persian the OPEN chevron pointed sideways instead
    // of up. Physical edges give one geometry in both directions.
    expect(rule, "a mirroring inline edge is the defect").not.toMatch(/border-inline-(start|end)/);
    expect(rule).toMatch(/border-right:/);
    expect(rule).toMatch(/border-bottom:/);
    // Closed points down, open points up.
    expect(rule).toMatch(/transform:\s*rotate\(45deg\)/);
    expect(hzBlock()).toMatch(/\.hz-toc\[open\] > summary::after \{ transform: rotate\(-135deg\); }/);
    // Still native, still no script: the affordance is the element itself.
    expect(read(PAGE)).toMatch(/<details/);
  });

  it("honours prefers-reduced-motion and forced-colors", () => {
    const block = hzBlock();
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(block).toMatch(/@media \(forced-colors: active\)/);
  });

  it("gives every interactive element a visible focus ring on both surfaces", () => {
    const block = hzBlock();
    expect(block).toMatch(/:focus-visible \{\s*outline:\s*2px solid/);
    expect(block).toMatch(/\.hz-masthead :where\(a, button\):focus-visible \{\s*outline-color:/);
  });

  it("keeps a 44px target on every control", () => {
    const block = hzBlock();
    expect(/\.hz-btn \{[^}]*min-height:\s*44px/.test(block)).toBe(true);
    expect(/\.hz-toc > summary \{[^}]*min-height:\s*44px/.test(block)).toBe(true);
  });

  it("the reopen control takes its appearance from the page, not from itself", () => {
    // Two placements on two surfaces; a baked-in style would have forced a
    // second component.
    const button = read(BUTTON);
    expect(button).toMatch(/className\?:\s*string/);
    const page = read(PAGE);
    expect((page.match(/<ManageCookiePreferencesButton className="hz-btn/g) ?? []).length).toBe(2);
  });

  it("the masthead uses the one accent that is AA-safe on it", () => {
    const block = hzBlock();
    // Signal Green measures 1.83:1 on white and 9.97:1 on forest-950, so it is
    // legal for text ONLY on the dark plate. The light sheet uses Brand Green.
    expect(/\.hz-eyebrow \{[^}]*color:\s*var\(--hz-signal\)/.test(block)).toBe(true);
    // No `s` flag: `[^}]*` already crosses newlines, and dotAll needs an ES2018
    // target this tsconfig does not set.
    expect(/\.hz-legal \{[^}]*--hz-accent:\s*var\(--hz-brand\)/.test(block)).toBe(true);
    // The document body must never colour text with Signal Green.
    const bodyRules = block.slice(block.indexOf(".hz-body"));
    expect(bodyRules).not.toMatch(/color:\s*var\(--hz-signal\)/);
  });
});

/* ── 5 · The redesign changed presentation only ─────────────────────────── */

describe("the redesign did not change the legal instrument", () => {
  it("the page no longer depends on the shared legal shell, and that shell is untouched", () => {
    const page = read(PAGE);
    expect(page).not.toContain("LegalPageShell");
    // The shared shell still serves /privacy, /terms, /gdpr, /data-request with
    // its original signature — this phase must not have widened into them.
    const shell = read("src/components/compliance/LegalPageShell.tsx");
    expect(shell).toMatch(/export function LegalPageShell\(\{ title, eyebrow, version, effective, children \}: Props\)/);
    expect(shell).not.toContain("versionLabel");
  });

  it("consent logic still lives in one place", () => {
    // Comment-stripped: the page DOES discuss the localStorage mirror in its
    // header comment, and explaining the consent layer is exactly what that
    // comment is for. What must be absent is the BEHAVIOUR.
    const page = read(PAGE)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    for (const banned of ["localStorage", "sessionStorage", "fetch(", "document.cookie", "cookie-consent"]) {
      expect(page, `the policy page must not itself ${banned}`).not.toContain(banned);
    }
    expect(page).not.toContain('role="dialog"');
  });

  it("the version stamp is still a code constant, not translatable copy", () => {
    expect(read(PAGE)).toContain("COOKIE_POLICY_VERSION");
  });
});
