// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import { DemoRequestForm } from "@/components/sales/DemoRequestForm";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";

/**
 * PHASE 104-I3 — public forms must be usable without sight.
 *
 * Both public request forms shipped a visible `<label>` with no `htmlFor` and
 * controls with no `id`. Every field therefore reached the accessibility tree
 * unnamed: a screen reader announced a column of anonymous "edit text"
 * controls, and clicking a label did nothing. That was MEASURED on the running
 * dev server (13 unnamed fields on /demo, 17 on /industrial-brain) before it
 * was fixed here, so these tests assert the property that was actually broken —
 * an accessible name for every control — rather than the presence of a class.
 */

const messagesFor = { en, de, fa } as const;

function withIntl(locale: keyof typeof messagesFor, ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={messagesFor[locale]} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

/**
 * The accessible name a control would expose, or null if it has none.
 *
 * Attribute VALUES are compared directly rather than built into selectors:
 * React's `useId` emits ids containing characters (`«`, `»`, `:`) that need
 * escaping in a selector, and this jsdom has no `CSS.escape`.
 */
function accessibleName(el: HTMLElement, root: HTMLElement): string | null {
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();

  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const ids = new Set(by.split(/\s+/));
    const t = [...root.querySelectorAll<HTMLElement>("[id]")]
      .filter((n) => ids.has(n.id))
      .map((n) => n.textContent ?? "")
      .join(" ")
      .trim();
    if (t) return t;
  }

  if (el.id) {
    const lab = [...root.querySelectorAll("label")].find((l) => l.getAttribute("for") === el.id);
    if (lab?.textContent?.trim()) return lab.textContent.trim();
  }

  const wrapping = el.closest("label");
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
  return null;
}

const fields = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>("input,select,textarea")]
    // The spam honeypot is removed from the accessibility tree on purpose.
    .filter((el) => el.getAttribute("aria-hidden") !== "true");

describe("104-I3 — /demo request form accessibility", () => {
  it("gives every field a programmatic name in every locale", async () => {
    for (const locale of ["en", "de", "fa"] as const) {
      const { container, unmount } = await mount(withIntl(locale, <DemoRequestForm locale={locale} />));
      const unnamed = fields(container)
        .filter((el) => accessibleName(el, container) === null)
        .map((el) => `${el.tagName.toLowerCase()}/${el.getAttribute("name") ?? "?"}`);
      expect(unnamed, `${locale}: fields with no accessible name`).toEqual([]);
      expect(fields(container).length, `${locale}: field count`).toBe(12);
      await unmount();
    }
  });

  it("renders German labels on the German form (they were English)", async () => {
    const { container, unmount } = await mount(withIntl("de", <DemoRequestForm locale="de" />));
    const labels = [...container.querySelectorAll("label")].map((l) => l.textContent ?? "");
    expect(labels.some((l) => l.includes("Vollständiger Name"))).toBe(true);
    expect(labels.some((l) => l.includes("Anwendungsfall"))).toBe(true);
    // the exact strings that used to leak through the isFa table
    expect(labels.some((l) => l.includes("Full name"))).toBe(false);
    expect(labels.some((l) => l.includes("Role / Title"))).toBe(false);
    await unmount();
  });

  it("keeps the persisted option VALUES canonical while translating their labels", async () => {
    const seen: string[][] = [];
    for (const locale of ["en", "de", "fa"] as const) {
      const { container, unmount } = await mount(withIntl(locale, <DemoRequestForm locale={locale} />));
      const interest = container.querySelector<HTMLSelectElement>('select[name="interest"]')!;
      const values = [...interest.options].map((o) => o.value).filter(Boolean);
      expect(values).toEqual([
        "INDUSTRIAL_BRAIN", "PREDICTIVE_MAINT", "EDMS", "CMMS", "EXPERT_NETWORK", "ENTERPRISE_SAAS",
      ]);
      seen.push([...interest.options].map((o) => o.textContent ?? "").filter(Boolean));
      await unmount();
    }
    // Labels differ per locale; values above did not.
    expect(new Set(seen.map((s) => s.join("|"))).size).toBe(3);
  });

  it("formats company-size ranges in the reader's own digits", async () => {
    const { container, unmount } = await mount(withIntl("fa", <DemoRequestForm locale="fa" />));
    const size = container.querySelector<HTMLSelectElement>('select[name="companySize"]')!;
    const labels = [...size.options].map((o) => o.textContent ?? "");
    // canonical values stay ASCII for the API …
    expect([...size.options].map((o) => o.value)).toContain("201-1000");
    // … while the Persian reader sees Persian digits
    expect(labels.some((l) => /[۰-۹]/.test(l))).toBe(true);
    await unmount();
  });

  it("never surfaces the API's own error string to a public reader", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/sales/DemoRequestForm.tsx"), "utf8");
    expect(src).toMatch(/setError\(t\("errorGeneric"\)\)/);
    expect(src).toMatch(/setError\(t\("errorNetwork"\)\)/);
    expect(src).not.toMatch(/setError\([^)]*data\.error/);
    // and the locale fork the whole form used to run on is gone
    expect(src).not.toMatch(/\bisFa\b/);
  });
});

describe("104-I3 — /industrial-brain diagnostic form accessibility", () => {
  const SRC = "src/components/industrial-brain/IndustrialBrainWorkspace.tsx";
  const src = readFileSync(resolve(process.cwd(), SRC), "utf8");

  it("binds every FieldLabel to a control id derived from the control's name", () => {
    // no label may be left unbound …
    expect(src.match(/<FieldLabel>/g)).toBeNull();

    // … and each binding must pair 1:1 with a control carrying the same id.
    const labelled = [...src.matchAll(/<FieldLabel htmlFor=\{fid\("([a-zA-Z]+)"\)\}>/g)].map((m) => m[1]);
    const controls = [...src.matchAll(/<(?:input|textarea|select) id=\{fid\("([a-zA-Z]+)"\)\} name="([a-zA-Z]+)"/g)];

    expect(labelled.length).toBe(17);
    expect(controls.length).toBe(17);
    // the id is derived from `name`, so the two can never drift apart
    for (const [, id, name] of controls) expect(id).toBe(name);
    expect([...labelled].sort()).toEqual(controls.map(([, id]) => id).sort());
  });
});

describe("104-I3 — the localized 404 is a landmark", () => {
  it("renders its content inside <main>, not a bare <div>", () => {
    // Measured: this route rendered ZERO <main> elements, so there was nothing
    // for a screen-reader user (or the shell's skip link) to jump to.
    const src = readFileSync(resolve(process.cwd(), "src/app/[locale]/not-found.tsx"), "utf8");
    expect(src).toMatch(/<main\s/);
    expect(src).toMatch(/<\/main>/);
  });
});
