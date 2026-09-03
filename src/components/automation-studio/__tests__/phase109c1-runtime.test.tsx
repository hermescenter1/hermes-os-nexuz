// @vitest-environment jsdom
/**
 * PHASE 109-C1 — the workspace as it actually renders.
 *
 * Everything here is asserted against the produced DOM in all three locales:
 * the single h1 boundary, the tree and tab semantics, named controls, the
 * simulated disclosure, the engineer-authority statement, LTR-locked code under
 * an RTL page, and the absence of any compile/download claim.
 */

import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import { resolveWorkspaceSource } from "@/lib/automation-studio";
import { StudioWorkspace } from "../StudioWorkspace";
import { FALLBACK_EDITOR_ADAPTER } from "../editor-adapter";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/engineering/studio",
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

const CATALOGUES = { en, de, fa } as const;
type Loc = keyof typeof CATALOGUES;
const LOCALES: readonly Loc[] = ["en", "de", "fa"];

/** `mount` is async and returns a handle; the tests want the container. */
async function render(locale: Loc): Promise<HTMLElement> {
  // The previous container is removed first. Without that, every render leaves
  // a copy in the document and ids repeat - and jsdom resolves "#id" through
  // document.getElementById before checking containment, so a scoped
  // container.querySelector("#x") silently returns null once a second copy
  // exists. That is a test artefact that looks exactly like a missing element.
  document.body.replaceChildren();
  const { container } = await mount(
    <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]}>
      <StudioWorkspace source={resolveWorkspaceSource()} />
    </NextIntlClientProvider>,
  );
  return container;
}

describe.each(LOCALES)("109-C1 runtime · %s", (locale) => {
  const t = CATALOGUES[locale].automationStudio;

  it("renders the workspace without a single h1 of its own", async () => {
    const el = await render(locale);
    // The engineering TopBar owns the page's h1; the workspace must not add a
    // second one. Two h1s is the defect this asserts against.
    expect(el.querySelectorAll("h1").length).toBe(0);
    expect(el.querySelectorAll("h2").length).toBeGreaterThan(0);
  });

  it("states the simulated disclosure in this locale", async () => {
    const text = (await render(locale)).textContent ?? "";
    expect(text).toContain(t.disclosure.simulationWorkspace);
    expect(text).toContain(t.disclosure.noLiveController);
    expect(text).toContain(t.disclosure.noDownload);
  });

  it("states that engineering authority stays with the engineer", async () => {
    expect((await render(locale)).textContent ?? "").toContain(t.authority.banner);
  });

  it("declares the SIMULATED classification from the server descriptor", async () => {
    expect((await render(locale)).textContent ?? "").toContain("SIMULATED");
  });

  it("offers no compile, download or online COMMAND", async () => {
    // Scanned over control labels, not the whole page: the boundaries section
    // legitimately contains the words "go online" inside a sentence saying the
    // product does not. A claim is something a control OFFERS.
    const el = await render(locale);
    const labels = [...el.querySelectorAll("button, a[href], [role='option']")]
      .map((c) => `${c.textContent ?? ""} ${c.getAttribute("aria-label") ?? ""}`.toLowerCase());
    for (const claim of ["download", "compile", "go online", "force", "herunterladen", "übersetzen", "بارگذاری"]) {
      const offender = labels.find((l) => l.includes(claim));
      expect(offender, `a control offers "${claim}"`).toBeUndefined();
    }
  });

  it("renders a real ARIA tree with levels and a single tabbable node", async () => {
    const el = await render(locale);
    const tree = el.querySelector('[role="tree"]');
    expect(tree).not.toBeNull();
    expect(tree!.getAttribute("aria-label")).toBe(t.explorer.treeLabel);

    const items = [...el.querySelectorAll('[role="treeitem"]')];
    expect(items.length).toBeGreaterThan(10);
    for (const item of items) {
      expect(item.getAttribute("aria-level")).toBeTruthy();
    }
    // Roving tabindex: exactly one node is reachable by Tab.
    expect(items.filter((i) => i.getAttribute("tabindex") === "0").length).toBe(1);
  });

  it("wires every tab to its panel", async () => {
    const el = await render(locale);
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    expect(tabs.length).toBeGreaterThan(4);
    for (const tab of tabs) {
      expect(tab.getAttribute("aria-selected")).toMatch(/true|false/);
    }
    for (const list of el.querySelectorAll('[role="tablist"]')) {
      expect(list.getAttribute("aria-label")).toBeTruthy();
    }
    for (const panel of el.querySelectorAll('[role="tabpanel"]')) {
      const labelledBy = panel.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      expect(el.querySelector(`#${labelledBy}`)).not.toBeNull();
    }
  });

  it("names every interactive control", async () => {
    const el = await render(locale);
    const unnamed: string[] = [];
    /** Text a screen reader would actually announce: aria-hidden is excluded. */
    const visibleText = (node: Element): string => {
      const clone = node.cloneNode(true) as Element;
      for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
      return (clone.textContent ?? "").trim();
    };
    for (const control of el.querySelectorAll("button, a[href], input, select, textarea")) {
      const text = visibleText(control);
      const label = control.getAttribute("aria-label");
      const labelledBy = control.getAttribute("aria-labelledby");
      const id = control.getAttribute("id");
      const hasLabelElement = id ? Boolean(el.querySelector(`label[for="${id}"]`)) : false;
      if (!text && !label && !labelledBy && !hasLabelElement) {
        unnamed.push(control.outerHTML.slice(0, 90));
      }
    }
    expect(unnamed).toEqual([]);
  });

  it("never nests an interactive element inside another", async () => {
    const el = await render(locale);
    const nested: string[] = [];
    for (const control of el.querySelectorAll("button, a[href]")) {
      if (control.querySelector("button, a[href]")) nested.push(control.outerHTML.slice(0, 90));
    }
    expect(nested).toEqual([]);
  });

  it("conveys severity as text INSIDE the problems table, not colour alone", async () => {
    const el = await render(locale);
    // Scoped to the table. Asserting on the whole page passes on the summary
    // counters in the command bar even when the table itself is colour-only.
    const table = el.querySelector("table");
    expect(table).not.toBeNull();
    const cells = [...table!.querySelectorAll("tbody tr td:first-child")].map(
      (c) => (c.textContent ?? "").trim(),
    );
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect([t.severity.error, t.severity.warning, t.severity.info]).toContain(cell);
    }
  });

  it("renders diagnostics with their stable codes", async () => {
    const text = (await render(locale)).textContent ?? "";
    expect(text).toMatch(/AES-C1-\d{3}/);
  });

  it("locks code, paths and identifiers to LTR", async () => {
    const el = await render(locale);
    const ltrNodes = [...el.querySelectorAll('[dir="ltr"]')];
    expect(ltrNodes.length).toBeGreaterThan(5);
    // The source region itself must be explicitly LTR, whatever the page dir,
    // and so must the editable control inside it.
    const codeRegion = el.querySelector("#source-tabpanel");
    expect(codeRegion).not.toBeNull();
    expect(codeRegion!.getAttribute("dir")).toBe("ltr");

    const editor = el.querySelector<HTMLTextAreaElement>("#studio-source-editor");
    expect(editor, "the draft artifact is not editable").not.toBeNull();
    expect(editor!.getAttribute("dir")).toBe("ltr");
    expect(editor!.getAttribute("aria-label") ?? "").toContain(t.editor.label);
  });

  it("offers a skip link to the workspace", async () => {
    const el = await render(locale);
    const skip = el.querySelector('a[href="#studio-workspace"]');
    expect(skip).not.toBeNull();
    expect((skip!.textContent ?? "").trim()).toBe(t.a11y.skipToWorkspace);
    expect(el.querySelector("#studio-workspace")).not.toBeNull();
  });

  it("labels every landmark region", async () => {
    const el = await render(locale);
    for (const selector of ["nav", "main", "aside", "section"]) {
      for (const node of el.querySelectorAll(selector)) {
        const named = node.getAttribute("aria-label") ?? node.getAttribute("aria-labelledby");
        if (selector === "main") continue; // main needs no name when unique
        expect(named, `${selector} without a name`).toBeTruthy();
      }
    }
  });

  it("every tab resolves a real panel, and every panel a real tab", async () => {
    const el = await render(locale);
    for (const tab of el.querySelectorAll('[role="tab"]')) {
      const controls = tab.getAttribute("aria-controls");
      expect(controls, "a tab that controls nothing").toBeTruthy();
      expect(el.querySelector(`#${controls}`), controls ?? "").not.toBeNull();
    }
  });

  it("renders the source with line numbers beside an editable control", async () => {
    const el = await render(locale);
    const editor = el.querySelector<HTMLTextAreaElement>("#studio-source-editor");
    expect(editor).not.toBeNull();
    // Real content, not a placeholder.
    expect(editor!.value.split("\n").length).toBeGreaterThan(20);

    // The numbers are decorative and aria-hidden: the textarea already exposes
    // the text, and announcing every number would be noise.
    const gutter = el.querySelector('[aria-hidden="true"] > li');
    expect(gutter).not.toBeNull();
  });

  it("does not claim syntax highlighting it does not have", async () => {
    const text = (await render(locale)).textContent ?? "";
    expect(text).toContain(t.editor.capabilities);
    expect(text.toLowerCase()).not.toContain("monaco");
  });
});

describe("109-C1 runtime · locale-independent structure", () => {
  it("produces the same control count in every locale", async () => {
    // Sequential on purpose: each render clears the document body, so three
    // concurrent renders would detach one another's containers.
    const counts: number[] = [];
    for (const l of LOCALES) {
      counts.push((await render(l)).querySelectorAll("button").length);
    }
    expect(new Set(counts).size, `counts: ${counts.join(", ")}`).toBe(1);
  });

  it("renders Persian content that is genuinely Persian, not English", async () => {
    const faText = (await render("fa")).textContent ?? "";
    const enText = (await render("en")).textContent ?? "";
    expect(faText).not.toBe(enText);
    // Persian script must actually be present.
    expect(/[؀-ۿ]/.test(faText)).toBe(true);
  });

  it("renders German content that is genuinely German", async () => {
    const deText = (await render("de")).textContent ?? "";
    expect(deText).toContain(de.automationStudio.disclosure.simulationWorkspace);
    expect(deText).not.toContain(en.automationStudio.disclosure.noLiveController);
  });
});


describe("109-C1 runtime · the adapter the status bar names is the adapter that runs", () => {
  it("displays exactly FALLBACK_EDITOR_ADAPTER.id, in every locale", async () => {
    // Round 1.1 shipped two constants for one identity: the adapter declared
    // "hermes-plain-source-editor" while the status bar rendered
    // "hermes-plain-source-view". Nothing failed, because nothing compared
    // them — so the product named an implementation that does not exist. An
    // identifier is precisely the field a reader trusts without checking, which
    // is what makes a drifting one worse than an absent one.
    for (const locale of LOCALES) {
      const el = await render(locale);
      const shown = el.querySelector("#studio-adapter-id");
      expect(shown, `${locale}: the adapter identity is not rendered`).not.toBeNull();
      expect((shown!.textContent ?? "").trim(), locale).toBe(FALLBACK_EDITOR_ADAPTER.id);
    }
  });

  it("keeps the identity LTR, because it is an identifier and not prose", async () => {
    const el = await render("fa");
    expect(el.querySelector("#studio-adapter-id")!.getAttribute("dir")).toBe("ltr");
  });

  it("names no OTHER adapter anywhere in the rendered workspace", async () => {
    // A second identifier on screen would reopen the same hole from the other
    // side: two plausible names, one of them wrong.
    const el = await render("en");
    const text = el.textContent ?? "";
    const ids = text.match(/hermes-plain-source-[a-z]+/g) ?? [];
    expect(new Set(ids)).toEqual(new Set([FALLBACK_EDITOR_ADAPTER.id]));
  });
});


describe("109-C1 R1.3 · the machine-readable markers the browser contract reads", () => {
  /*
   * These attributes exist so a browser harness never has to infer product
   * facts from prose. Round 1.2's harness searched the page text for
   * "live controller" and matched the REQUIRED denial — "No live controller is
   * connected" — turning a safety statement into a reported violation. The
   * lesson is not to soften the denial; it is that a classification belongs in
   * a field. These tests keep the fields present and correct, in every locale.
   */
  it.each(LOCALES)("%s declares SIMULATED classification and no controller connection", async (locale) => {
    const el = await render(locale);
    const root = el.querySelector("[data-studio-classification]");
    expect(root, "the classification marker is missing").not.toBeNull();
    expect(root!.getAttribute("data-studio-classification")).toBe("SIMULATED");
    expect(root!.getAttribute("data-controller-connection")).toBe("none");
  });

  it("keeps the required negative disclosure as VISIBLE TEXT, not only as a marker", async () => {
    // The attributes are for machines. The engineer still has to be told, in
    // their own language, that nothing is connected.
    for (const locale of LOCALES) {
      const text = (await render(locale)).textContent ?? "";
      const d = CATALOGUES[locale].automationStudio.disclosure;
      expect(text, locale).toContain(d.noLiveController);
      expect(text, locale).toContain(d.noDownload);
      expect(text, locale).toContain(d.simulationWorkspace);
    }
  });

  it("names each responsive surface so visibility can be measured, not assumed", async () => {
    const el = await render("en");
    const surfaces = [...el.querySelectorAll("[data-studio-surface]")].map((n) =>
      n.getAttribute("data-studio-surface"),
    );
    // Which one is VISIBLE is a CSS decision at a breakpoint, which jsdom does
    // not make. What is asserted here is that every surface the harness looks
    // for exists and is uniquely named.
    for (const name of ["companion", "workspace", "explorer", "inspector"]) {
      expect(surfaces.filter((s) => s === name).length, name).toBe(1);
    }
  });

  it("names each companion section the browser contract measures", async () => {
    const el = await render("en");
    const sections = [...el.querySelectorAll("[data-studio-companion-section]")].map((n) =>
      n.getAttribute("data-studio-companion-section"),
    );
    // Inferring "the summary is there" from "the companion surface is there"
    // would repeat the mistake of reporting configuration as observation.
    for (const name of ["summary", "diagnostics", "symbolLookup"]) {
      expect(sections.filter((s) => s === name).length, name).toBe(1);
    }
  });

  it("marks modified state per artifact, not with a glyph anywhere in the tree", async () => {
    const el = await render("en");
    const marked = [...el.querySelectorAll("[data-artifact-modified]")];
    expect(marked.length).toBeGreaterThan(0);
    for (const node of marked) {
      expect(node.getAttribute("data-artifact-id"), "a modified marker with no artifact id").toBeTruthy();
      expect(["true", "false"]).toContain(node.getAttribute("data-artifact-modified"));
    }
  });

  it("exposes the save state as a value beside its translated label", async () => {
    for (const locale of LOCALES) {
      const el = await render(locale);
      const badge = el.querySelector("#studio-save-state");
      expect(badge, `${locale}: the save-state marker is missing`).not.toBeNull();
      expect(badge!.getAttribute("data-save-state")).toBe("unchanged");
      // The label stays translated; the attribute is the machine-readable twin.
      expect(badge!.textContent!.trim()).toBe(
        CATALOGUES[locale].automationStudio.editor.save.unchanged,
      );
    }
  });
});
