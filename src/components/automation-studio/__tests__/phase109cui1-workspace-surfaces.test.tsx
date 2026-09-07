// @vitest-environment jsdom
/**
 * PHASE 109-C-UI.1 — the surfaces this stage added, asserted as BEHAVIOUR.
 *
 * Every test here fails on the pre-stage tree. That is the point: the nine
 * suites already in the repository all stayed green through this work, so
 * without these the workspace could lose an entire pane again and nothing would
 * notice — which is exactly how fourteen of eighteen artifacts came to render a
 * single centred sentence in the first place.
 *
 * What is asserted, and what is deliberately NOT:
 *
 *   - the artifact surface shows what the MODEL holds (identity, provenance,
 *     bindings, alarms, findings) and refuses to show anything that would need a
 *     live connection. The negative is checked against the rendered text, not
 *     against the projection, because the projection is already covered in
 *     `phase109cui1-artifact-dossier`;
 *   - the changes surface reads the workspace's own version list;
 *   - the kind of every artifact reaches the accessibility tree;
 *   - the inspector is reachable at every workspace width;
 *   - the companion can inspect an artifact and still carries no editor.
 */

import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { click, focus, keyDown, mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import { resolveWorkspaceSource } from "@/lib/automation-studio";
import { StudioWorkspace } from "../StudioWorkspace";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/engineering/studio",
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

const CATALOGUES = { en, de, fa } as const;
type Loc = keyof typeof CATALOGUES;
const LOCALES: readonly Loc[] = ["en", "de", "fa"];
const T = en.automationStudio;

async function render(locale: Loc = "en"): Promise<HTMLElement> {
  document.body.replaceChildren();
  const { container } = await mount(
    <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]}>
      <StudioWorkspace source={resolveWorkspaceSource()} />
    </NextIntlClientProvider>,
  );
  return container;
}

/** Select an artifact through the project tree, the way an engineer does. */
async function openArtifact(el: HTMLElement, label: string): Promise<void> {
  const node = [...el.querySelectorAll('[role="treeitem"]')].find((n) =>
    (n.textContent ?? "").includes(label),
  );
  expect(node, `no tree node for ${label}`).toBeDefined();
  await click(node!);
}

const surface = (el: HTMLElement) => el.querySelector("[data-studio-artifact-surface]");

function buttonByText(el: HTMLElement, text: string): HTMLButtonElement | null {
  return [...el.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === text,
  ) as HTMLButtonElement | null;
}

const inspectorColumn = (el: HTMLElement) => el.querySelector("#studio-inspector-column")!;
const inspectorPanel = (el: HTMLElement) => el.querySelector("#inspector-panel")!;

/**
 * Give a node the box a browser would give it.
 *
 * jsdom performs no layout, so `offsetParent` is null for everything. The
 * product asks that question to tell a drawer from a column — a CSS fact — so a
 * test that wants to exercise the drawer path has to supply the answer jsdom
 * cannot. Everything else is measured from the real DOM.
 */
function paint(node: Element): void {
  Object.defineProperty(node, "offsetParent", {
    value: node.parentElement ?? document.body,
    configurable: true,
  });
}

/** The first control on the artifact surface for a given symbol. */
function inspectRow(el: HTMLElement, symbol: string): HTMLButtonElement {
  const pane = surface(el)!;
  const row = [...pane.querySelectorAll("button")].find((b) =>
    (b.getAttribute("aria-label") ?? "").endsWith(`: ${symbol}`),
  );
  expect(row, `no inspect control for ${symbol}`).toBeDefined();
  return row as HTMLButtonElement;
}

/* ── the artifact surface ─────────────────────────────────────────────────── */

describe("109-C-UI.1 · an artifact with no source gets a real surface", () => {
  it("renders the HMI screen's identity, kind, bindings and findings", async () => {
    const el = await render();
    await openArtifact(el, "Line01_Overview");

    const pane = surface(el);
    expect(pane, "no artifact surface for an HMI screen").not.toBeNull();
    expect(pane!.getAttribute("data-artifact-kind")).toBe("hmi-screen");
    expect(pane!.getAttribute("data-artifact-discipline")).toBe("hmi");

    const text = pane!.textContent ?? "";
    expect(text).toContain("Line01_Overview");
    expect(text).toContain("HMI/Screens/Line01_Overview.screen");
    // The kind as a LABEL, never the raw union member.
    expect(text).toContain(T.kinds.hmiScreen);
    expect(text).not.toContain("hmi-screen");
    // The two bindings the fixture declares, with their source context.
    expect(text).toContain("Motor_101_RunFb");
    expect(text).toContain("Motor_102_RunFb");
    expect(text).toContain("Tile.Motor101.Running -> Motor_101_RunFb");
    // The findings against it, with their stable codes.
    expect(text).toContain("AES-C1-004");
  });

  it("shows a SCADA area's write separately from its binding", async () => {
    const el = await render();
    await openArtifact(el, "Area_Packaging");
    const pane = surface(el)!;
    expect(pane.getAttribute("data-artifact-discipline")).toBe("scada");
    expect(pane.textContent).toContain("Area.Override.Motor101Run := TRUE");
    expect(pane.textContent).toContain(T.inspector.writes);
  });

  it("states the artifact's provenance and its simulation disclosure", async () => {
    const el = await render();
    await openArtifact(el, "Line01_Trends");
    const pane = surface(el)!;
    const text = pane.textContent ?? "";
    expect(text).toContain("local-demo-adapter");
    expect(text).toContain(T.artifact.disclosureLabel);
    // The reader gets the product's disclosure in their language; the record's
    // own adapter-authored text stays machine-readable beside it.
    expect(text).toContain(T.disclosure.body);
    const dd = pane.querySelector("[data-provenance-disclosure]");
    expect(dd, "the record's disclosure is not exposed").not.toBeNull();
    expect(dd!.getAttribute("data-provenance-disclosure")).toContain(
      "No controller, historian or plant network was contacted",
    );
  });

  it("puts no English disclosure paragraph on the Persian or German page", async () => {
    // The record's disclosure is English fixture data. Rendering it verbatim
    // dropped an English paragraph into the middle of both translated pages.
    for (const locale of ["fa", "de"] as const) {
      const el = await render(locale);
      await openArtifact(el, "Line01_Trends");
      const text = surface(el)!.textContent ?? "";
      expect(text, locale).toContain(CATALOGUES[locale].automationStudio.disclosure.body);
      expect(text, locale).not.toContain("No controller, historian or plant network");
    }
  });

  it("names a missing provenance record instead of leaving a blank field", async () => {
    // Shift_Report is the fixture's seeded AES-C1-009. A surface that rendered
    // an empty cell there would be hiding the exact thing the rule exists for.
    const el = await render();
    await openArtifact(el, "Shift_Report");
    expect(surface(el)!.textContent).toContain(T.inspector.provenanceMissing);
  });

  it("shows nothing that would require a live connection", async () => {
    // The negative, read off the DOM. No process value, no equipment state, no
    // active-alarm queue, no plotted series — because none of that exists in
    // the contract, so any of it appearing would have been invented.
    const el = await render();
    for (const label of ["Line01_Trends", "Line01_Alarms", "Line01_Points", "Area_Packaging"]) {
      await openArtifact(el, label);
      const text = (surface(el)!.textContent ?? "").toLowerCase();
      for (const forbidden of ["online", "connected", "live value", "current value", "running now", "actual value"]) {
        expect(text, `${label} claims "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("says plainly why there is no editor, and mounts none", async () => {
    const el = await render();
    await openArtifact(el, "FP_Motor");
    expect(surface(el)!.textContent).toContain(T.editor.nonTextual);
    expect(el.querySelector("#studio-source-editor")).toBeNull();
  });

  it("keeps the open tab's aria-controls pointing at a panel that exists", async () => {
    // Before this stage the tab panel was rendered only in the source branch,
    // so opening an artifact with no source left every tab in the strip
    // referencing an id that was not in the document.
    const el = await render();
    await openArtifact(el, "Line01_Alarms");
    for (const tab of el.querySelectorAll('[role="tab"]')) {
      const controls = tab.getAttribute("aria-controls");
      expect(controls).toBeTruthy();
      expect(el.querySelector(`#${controls}`), controls ?? "").not.toBeNull();
    }
  });

  it("does not force the surface to LTR, so Persian prose is not reversed", async () => {
    const el = await render("fa");
    await openArtifact(el, "Line01_Overview");
    // The panel is neutral; the identifiers inside carry their own direction.
    expect(el.querySelector("#source-tabpanel")!.getAttribute("dir")).toBeNull();
    const name = surface(el)!.querySelector("h3");
    expect(name!.getAttribute("dir")).toBe("ltr");
  });

  it("renders the surface in every locale, with no English leaking through", async () => {
    for (const locale of LOCALES) {
      const el = await render(locale);
      await openArtifact(el, "Line01_Overview");
      const text = surface(el)!.textContent ?? "";
      expect(text, locale).toContain(CATALOGUES[locale].automationStudio.kinds.hmiScreen);
      expect(text, locale).toContain(CATALOGUES[locale].automationStudio.artifact.identityHeading);
    }
  });
});

/* ── the changes surface ──────────────────────────────────────────────────── */

describe("109-C-UI.1 · the changes surface reads the workspace's versions", () => {
  it("lists every version with its approval state and its changed artifacts", async () => {
    const el = await render();
    const tab = el.querySelector<HTMLButtonElement>("#output-tab-changes");
    expect(tab, "the changes tab does not exist").not.toBeNull();
    await click(tab);
    expect(tab!.getAttribute("aria-selected")).toBe("true");

    const panel = el.querySelector("#output-panel")!;
    const text = panel.textContent ?? "";
    for (const label of ["v1.0.0-commissioned", "v1.0.1-reviewed", "v1.1.0-draft"]) {
      expect(text, label).toContain(label);
    }
    expect(text).toContain(T.versions.draft);
    expect(text).toContain(T.versions.commissioned);
    // The working version's three changed artifacts, by path.
    expect(text).toContain("PLC/ProgramBlocks/FB_Valve.scl");
    expect(text).toContain("HMI/Screens/Line01_Overview.screen");
    // Nothing has been typed yet, and it says so rather than showing an
    // unexplained empty list.
    expect(text).toContain(T.versions.noLocalChanges);
  });

  it("counts one changed artifact in the singular", async () => {
    // "1 changed artifacts" was the string this surface would have shipped.
    const el = await render();
    await click(el.querySelector("#output-tab-changes"));
    const text = el.querySelector("#output-panel")!.textContent ?? "";
    expect(text).toContain("1 changed artifact");
    expect(text).not.toContain("1 changed artifacts");
  });

  it("translates the access kind in the references list", async () => {
    // `r.access` was rendered verbatim — an English union member on the German
    // and Persian pages.
    const el = await render("de");
    await click(el.querySelector("#output-tab-references"));
    const text = el.querySelector("#output-panel")!.textContent ?? "";
    expect(text).toContain(de.automationStudio.access.binding);
    expect(text).not.toMatch(/\bbinding\b/);
  });
});

/* ── explorer, inspector, companion ───────────────────────────────────────── */

describe("109-C-UI.1 · the tree announces what each artifact IS", () => {
  it("carries the kind as text, not only as an aria-hidden glyph", async () => {
    const el = await render();
    const node = [...el.querySelectorAll('[role="treeitem"]')].find((n) =>
      (n.textContent ?? "").includes("FP_Motor"),
    )!;
    expect(node.textContent).toContain(T.kinds.hmiFaceplate);
  });

  it("does the same in German", async () => {
    const el = await render("de");
    const node = [...el.querySelectorAll('[role="treeitem"]')].find((n) =>
      (n.textContent ?? "").includes("Line01_Points"),
    )!;
    expect(node.textContent).toContain(de.automationStudio.kinds.scadaHistorian);
  });
});

describe("109-C-UI.1 · the inspector is reachable, not width-gated away", () => {
  it("offers a toggle that puts the column in the document at any width", async () => {
    const el = await render();
    const column = el.querySelector("#studio-inspector-column");
    expect(column, "the inspector column has no stable id").not.toBeNull();
    // The default is the breakpoint's, expressed in CSS so the server HTML and
    // the hydrated tree agree.
    expect(column!.getAttribute("data-inspector-open")).toBe("auto");
    expect(column!.className).toContain("xl:block");

    const toggle = buttonByText(el, T.inspector.toggle);
    expect(toggle, "no inspector toggle").not.toBeNull();
    await click(toggle);
    // Below xl nothing is visible, so the first press must OPEN rather than
    // close — otherwise the control needs two presses to do anything.
    expect(column!.getAttribute("data-inspector-open")).toBe("true");
    expect(column!.className).toContain("block");

    await click(toggle);
    expect(column!.getAttribute("data-inspector-open")).toBe("false");
  });
});

describe("109-C-UI.1 · the companion can inspect an artifact", () => {
  it("lists artifacts as touch targets and opens a read-only dossier", async () => {
    const el = await render();
    const list = el.querySelector('[data-studio-companion-section="artifacts"]');
    expect(list, "the companion has no artifact list").not.toBeNull();

    const rows = [...list!.querySelectorAll("button")];
    expect(rows.length).toBe(18);
    for (const row of rows) {
      // 44 px minimum hit area, asserted on the class the layout actually uses
      // rather than on a measurement jsdom cannot make.
      expect(row.className).toContain("min-h-[44px]");
    }

    await click(rows.find((r) => (r.textContent ?? "").includes("Motor_Detail"))!);
    const panes = el.querySelectorAll("[data-studio-artifact-surface]");
    // One in the companion branch; the workspace branch still shows the source
    // editor, so there is exactly one dossier on screen.
    expect(panes.length).toBe(1);
    expect(panes[0].textContent).toContain("HMI/Screens/Motor_Detail.screen");

    // Read-only means read-only: the companion adds no editor and no control
    // that claims to jump into one.
    const companionSurface = panes[0];
    expect(companionSurface.querySelectorAll("textarea").length).toBe(0);
    expect(companionSurface.querySelectorAll("[contenteditable]").length).toBe(0);

    await click(buttonByText(el, T.companion.backToList));
    expect(el.querySelector('[data-studio-companion-section="artifacts"]')).not.toBeNull();
  });

  it("tells a program block's reader that source needs a larger screen", async () => {
    // The generic "no textual source" sentence would be FALSE here: FB_Motor
    // has source, it simply cannot be edited on a phone.
    const el = await render();
    const list = el.querySelector('[data-studio-companion-section="artifacts"]')!;
    const row = [...list.querySelectorAll("button")].find((r) =>
      (r.textContent ?? "").includes("FB_Motor"),
    )!;
    await click(row);
    const pane = el.querySelector("[data-studio-artifact-surface]")!;
    expect(pane.textContent).toContain(T.companion.note);
    expect(pane.textContent).not.toContain(T.editor.nonTextual);
  });
});

describe("109-C-UI.1 · the symbol filters are wired to the query, not decorative", () => {
  it("narrows the result count when a scope is chosen", async () => {
    const el = await render();
    const { act } = await import("react");
    // Open the symbols surface through the palette command that owns it. The
    // palette trigger's label carries its keyboard hint, so it is opened the
    // way the shortcut does rather than by matching that composite label.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    const option = [...document.querySelectorAll('[role="option"]')].find((o) =>
      (o.textContent ?? "").includes(T.palette.searchSymbols),
    ) as HTMLButtonElement;
    await click(option);

    const scope = el.querySelector<HTMLSelectElement>("#studio-symbol-scope");
    expect(scope, "the scope filter is not rendered").not.toBeNull();
    const count = () =>
      Number(el.querySelector("#studio-symbol-result-count")!.getAttribute("data-result-count"));

    const before = count();
    expect(before).toBeGreaterThan(1);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(scope!, "scada");
      scope!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // A filter that changes nothing is a filter that is not wired.
    const after = count();
    expect(after).toBeLessThan(before);
    expect(after).toBe(1); // only Line_01_AutoMode is declared in the SCADA area
  });
});

/* ── BLOCKER B · the dossier's controls do something observable ───────────── */

describe("109-C-UI.1 R1 · every control on the artifact surface has an effect", () => {
  /*
   * THE DEFECT THIS PINS.
   *
   * These rows used to call a "navigate to artifact + line" handler. Every
   * reference the dossier holds belongs to the artifact ALREADY on screen — that
   * is what the projection selects — and that artifact has no textual source, so
   * the call re-selected the same pane and highlighted a line nothing renders.
   * From the default Properties tab, with the inspector closed below `xl`,
   * pressing a binding changed nothing a reader could see. Three tests below
   * would all have passed on a dead button before; none passes now unless the
   * press really selects the symbol, opens the inspector and switches the tab.
   */
  it("pressing a binding selects the symbol, opens the inspector and shows the cross-reference", async () => {
    const el = await render();
    await openArtifact(el, "Line01_Overview");

    // The starting state is the one the defect hid behind.
    expect(el.querySelector("#inspector-tab-properties")!.getAttribute("aria-selected")).toBe("true");
    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("auto");

    await click(inspectRow(el, "Motor_101_RunFb"));

    expect(
      el.querySelector("#inspector-tab-crossReference")!.getAttribute("aria-selected"),
      "the cross-reference tab was not selected",
    ).toBe("true");
    expect(
      inspectorColumn(el).getAttribute("data-inspector-open"),
      "the inspector was not opened, so the result was off screen below xl",
    ).toBe("true");

    const panel = inspectorPanel(el).textContent ?? "";
    expect(panel).toContain("Motor_101_RunFb");
    expect(panel).toContain(T.inspector.declaredIn);
  });

  it("does the same for a declared symbol row", async () => {
    const el = await render();
    await openArtifact(el, "Line01_Tags");
    await click(inspectRow(el, "Line_01_SpareTag"));
    expect(el.querySelector("#inspector-tab-crossReference")!.getAttribute("aria-selected")).toBe("true");
    expect(inspectorPanel(el).textContent).toContain("Line_01_SpareTag");
  });

  it("shows an UNRESOLVED symbol as not declared rather than as an empty panel", async () => {
    // Motor_102_RunFb is the fixture's seeded AES-C1-004: bound on a screen and
    // declared by no block. The panel has to say so.
    const el = await render();
    await openArtifact(el, "Line01_Overview");
    await click(inspectRow(el, "Motor_102_RunFb"));

    const panel = inspectorPanel(el).textContent ?? "";
    expect(panel).toContain("Motor_102_RunFb");
    expect(panel).toContain(T.inspector.notDeclared);
    expect(panel).not.toContain(T.inspector.noSelection);
  });

  it("names every control on the surface for what it does", async () => {
    const el = await render();
    await openArtifact(el, "Line01_Overview");
    const controls = [...surface(el)!.querySelectorAll("button")];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.getAttribute("aria-label"), control.outerHTML.slice(0, 80))
        .toContain(T.artifact.inspectSymbol);
    }
  });

  it("keeps the companion's rows non-interactive, because it has no inspector", async () => {
    const el = await render();
    const list = el.querySelector('[data-studio-companion-section="artifacts"]')!;
    const row = [...list.querySelectorAll("button")].find((r) =>
      (r.textContent ?? "").includes("Line01_Overview"),
    )!;
    await click(row);
    const pane = el.querySelector('[data-studio-artifact-surface]')!;
    // The dossier renders; the reference rows are text.
    expect(pane.textContent).toContain("Motor_101_RunFb");
    expect(pane.querySelectorAll("button").length).toBe(0);
  });
});

/* ── BLOCKER A · the inspector is a drawer below xl ───────────────────────── */

describe("109-C-UI.1 R1 · the inspector costs the centre nothing below xl", () => {
  it("is positioned out of flow below xl and back in flow at xl", async () => {
    const el = await render();
    const column = inspectorColumn(el);
    const className = column.className;

    // Drawer: absolutely positioned on the LOGICAL end edge, so it mirrors
    // under a Persian page and takes zero width from the flex row.
    expect(className).toContain("absolute");
    expect(className).toContain("end-0");
    expect(className).not.toContain("right-0");
    // Opaque and bounded, because it overlays source code.
    expect(className).toContain("bg-[#0b1220]");
    expect(className).toContain("border-s");
    expect(className).toMatch(/shadow-\[/);
    // Column again where there is room.
    expect(className).toContain("xl:static");
    expect(className).toContain("xl:block");

    // The row it overlays is a positioning context, or `absolute` would escape
    // to the page and the drawer would not sit over the workspace at all.
    const row = column.parentElement!;
    expect(row.className).toContain("relative");
  });

  it("keeps a close control that exists only while it is a drawer", async () => {
    const el = await render();
    const close = el.querySelector("#studio-inspector-close");
    expect(close, "the drawer has no close control").not.toBeNull();
    // Present in the tree, removed by CSS at xl — where the panel is a column
    // and there is nothing to close.
    expect(close!.parentElement!.className).toContain("xl:hidden");
  });

  it("leaves an inline column alone on Escape", async () => {
    // At xl the close control is display:none, so `offsetParent` is null and the
    // handler declines. A column that vanished on Escape would be a surprise.
    const el = await render();
    await click(buttonByText(el, T.inspector.toggle));
    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("true");
    const { act } = await import("react");
    await act(async () => {
      inspectorColumn(el).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("true");
  });

  it("gives the toggle a target and a determinate state", async () => {
    const el = await render();
    const toggle = buttonByText(el, T.inspector.toggle)!;
    expect(toggle.getAttribute("aria-controls")).toBe("studio-inspector-column");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("asks exactly one media query, which the C1 viewport contract requires", async () => {
    const asked: string[] = [];
    const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => {
        asked.push(query);
        return {
          matches: true,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MediaQueryList;
      },
    });
    try {
      await render();
      // The inspector learns whether it is a drawer from the DOM, not from a
      // second breakpoint query. `phase109c1-viewport-mode` pins this.
      expect(new Set(asked)).toEqual(new Set(["(min-width: 1024px)"]));
    } finally {
      if (original) Object.defineProperty(window, "matchMedia", original);
      else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });
});

/* ── BLOCKER C · no raw origin, and direction follows the value ───────────── */

describe("109-C-UI.1 R1 · the data origin is a translated word, not a union member", () => {
  it("renders the localised origin on the artifact surface in every locale", async () => {
    for (const locale of LOCALES) {
      const el = await render(locale);
      await openArtifact(el, "Line01_Overview");
      const pane = surface(el)!;
      const origin = pane.querySelector("[data-origin]")!;
      // The machine-readable value is untouched; the visible one is a word.
      expect(origin.getAttribute("data-origin"), locale).toBe("simulated");
      expect(origin.textContent, locale).toContain(
        CATALOGUES[locale].automationStudio.origins.simulated,
      );
      // The producer is an adapter identifier and stays LTR.
      const producer = origin.querySelector('[dir="ltr"]')!;
      expect(producer.textContent).toBe("local-demo-adapter");
    }
  });

  it("does the same in the inspector", async () => {
    for (const locale of LOCALES) {
      const el = await render(locale);
      const origin = el.querySelector('#inspector-panel [data-property="inspector.propertyOrigin"]')!;
      expect(origin.getAttribute("data-origin"), locale).toBe("authored");
      expect(origin.textContent, locale).toContain(
        CATALOGUES[locale].automationStudio.origins.authored,
      );
    }
  });

  it("puts no standalone English origin word on the Persian or German page", async () => {
    for (const locale of ["fa", "de"] as const) {
      const el = await render(locale);
      await openArtifact(el, "Line01_Overview");
      const text = el.textContent ?? "";
      for (const raw of ["simulated", "authored"]) {
        const pattern = new RegExp(String.raw`\b` + raw + String.raw`\b`);
        // The matcher itself is checked, so a broken escape cannot turn
        // this assertion into an unconditional pass.
        expect(pattern.test(`origin: ${raw} - local-demo-adapter`), "the matcher").toBe(true);
        expect(pattern.test(text), `${locale} shows "${raw}"`).toBe(false);
      }
    }
  });

  it("localises the classification label while keeping the code and the marker", async () => {
    for (const locale of LOCALES) {
      const el = await render(locale);
      const c = CATALOGUES[locale].automationStudio.classification;
      expect(el.textContent, locale).toContain(c.label);
      expect(el.textContent, locale).toContain(c.simulated);
      // The stable code stays readable, the way a diagnostic code does, and the
      // machine-readable attribute is untouched.
      expect(el.textContent, locale).toContain("SIMULATED");
      expect(
        el.querySelector("[data-studio-classification]")!.getAttribute("data-studio-classification"),
      ).toBe("SIMULATED");
    }
  });

  it("forces LTR on identifiers only, never on a translated word", async () => {
    // The whole property list used to be one `dir="ltr"` monospaced run, so the
    // Persian and German TYPE value was laid out left-to-right beside an English
    // path. Direction belongs to the VALUE.
    const el = await render("fa");
    const panel = el.querySelector("#inspector-panel")!;
    const ltr = (property: string) =>
      panel.querySelector(`[data-property="${property}"]`)!.getAttribute("dir");

    expect(ltr("inspector.propertyPath")).toBe("ltr");
    expect(ltr("inspector.propertyChecksum")).toBe("ltr");
    expect(ltr("inspector.propertyName")).toBe("ltr");
    // Translated words follow the page.
    expect(ltr("inspector.propertyKind")).toBeNull();
    expect(ltr("inspector.propertyOrigin")).toBeNull();
    expect(
      panel.querySelector('[data-property="inspector.propertyKind"]')!.closest('[dir="ltr"]'),
      "the kind sits inside an LTR run",
    ).toBeNull();
  });
});

/* ── §6 · the companion puts navigation where it can be reached ───────────── */

describe("109-C-UI.1 R1 · companion information architecture", () => {
  it("places artifact inspection directly after the overview, before problems", async () => {
    const el = await render();
    const order = [...el.querySelectorAll("[data-studio-companion-section]")].map((n) =>
      n.getAttribute("data-studio-companion-section"),
    );
    // It used to be last, after eight findings and up to twenty-five symbol
    // rows — roughly two screens down on a 390 px phone.
    expect(order).toEqual(["summary", "artifacts", "diagnostics", "symbolLookup"]);
  });

  it("keeps problems and symbol lookup intact", async () => {
    const el = await render();
    expect(el.querySelector('[data-studio-companion-section="diagnostics"]')!.children.length)
      .toBeGreaterThan(0);
    expect(el.querySelector("#studio-symbol-search-mobile")).not.toBeNull();
  });

  it("keeps every companion row a 44 px touch target", async () => {
    const el = await render();
    const list = el.querySelector('[data-studio-companion-section="artifacts"]')!;
    for (const row of list.querySelectorAll("button")) {
      expect(row.className).toContain("min-h-[44px]");
    }
    const row = [...list.querySelectorAll("button")][0];
    await click(row);
    expect(buttonByText(el, T.companion.backToList)!.className).toContain("min-h-[44px]");
  });

  it("adds no editor, no contenteditable and no save control to the companion", async () => {
    const el = await render();
    const list = el.querySelector('[data-studio-companion-section="artifacts"]')!;
    const row = [...list.querySelectorAll("button")].find((r) =>
      (r.textContent ?? "").includes("Area_Packaging"),
    )!;
    await click(row);
    const companion = el.querySelector('[data-studio-surface="companion"]')!;
    expect(companion.querySelectorAll("textarea").length).toBe(0);
    expect(companion.querySelectorAll("[contenteditable]").length).toBe(0);
    expect(companion.querySelector("#studio-save-state")).toBeNull();
  });
});

/* ── R2 · the drawer is operable from the keyboard ────────────────────────── */

describe("109-C-UI.1 R2 · opening the drawer moves focus into it, and Escape gives it back", () => {
  /*
   * THE DEFECT THIS PINS.
   *
   * R1 opened the drawer and left focus where it was — on the status-bar toggle,
   * OUTSIDE the panel. A keyboard user had to tab through the whole workspace to
   * reach what they had just opened, and Escape did nothing, because the handler
   * lives on the drawer and no descendant had focus to bubble from. R1's own
   * test dispatched Escape straight at the container, which proves the handler
   * exists and proves nothing about whether anyone can reach it.
   *
   * These tests use real focus, real activation and a keydown from the ACTUALLY
   * FOCUSED element. jsdom performs no layout, so `paint()` supplies the one
   * fact it cannot: whether the close control — which carries `xl:hidden` — is
   * on screen. That is the product's own test for "am I a drawer right now".
   */
  async function openDrawerFrom(el: HTMLElement, opener: HTMLElement) {
    paint(el.querySelector("#studio-inspector-close")!);
    await focus(opener);
    expect(document.activeElement, "the opener was not focused").toBe(opener);
    await click(opener);
  }

  it("moves focus to the close button when the toggle opens it", async () => {
    const el = await render();
    const toggle = buttonByText(el, T.inspector.toggle)!;
    const close = el.querySelector<HTMLElement>("#studio-inspector-close")!;

    await openDrawerFrom(el, toggle);

    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("true");
    expect(document.activeElement, "focus stayed outside the drawer").toBe(close);
    expect(close.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape pressed from the focused close button, not from the container", async () => {
    const el = await render();
    const toggle = buttonByText(el, T.inspector.toggle)!;
    await openDrawerFrom(el, toggle);

    const focused = document.activeElement as HTMLElement;
    expect(focused.id).toBe("studio-inspector-close");

    // Dispatched on the element that actually holds focus. It reaches the
    // handler only because it bubbles out through the drawer.
    await keyDown(focused, "Escape");

    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("false");
  });

  it("restores focus to the exact opener after Escape", async () => {
    const el = await render();
    const toggle = buttonByText(el, T.inspector.toggle)!;
    await openDrawerFrom(el, toggle);

    /*
      This assertion is the reason the test is not vacuous. Without it, the
      whole thing passes on the pre-R2 tree for the WRONG reason: focus never
      entered the drawer there, so it was still on the toggle at the end and
      "restored" was indistinguishable from "never moved". Proving focus LEFT
      first is what makes the restoration a claim about behaviour.
    */
    expect(inspectorColumn(el).contains(document.activeElement), "focus never entered the drawer").toBe(true);
    expect(document.activeElement).not.toBe(toggle);

    await keyDown(document.activeElement as HTMLElement, "Escape");

    // Not "something focusable" — the control the engineer pressed.
    expect(document.activeElement, "focus was stranded").toBe(toggle);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("restores focus to the close control's own opener too", async () => {
    const el = await render();
    const toggle = buttonByText(el, T.inspector.toggle)!;
    await openDrawerFrom(el, toggle);

    // Same guard as above: focus must have left the toggle before "restored"
    // can mean anything.
    expect(document.activeElement).not.toBe(toggle);
    expect(inspectorColumn(el).contains(document.activeElement)).toBe(true);

    await click(el.querySelector("#studio-inspector-close"));

    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("opens from an Inspect symbol row and lands focus in the drawer", async () => {
    // The same flow from the artifact surface, which is where a reader most
    // often opens the inspector — and where R1 left them furthest from it.
    const el = await render();
    await openArtifact(el, "Line01_Overview");
    const row = inspectRow(el, "Motor_101_RunFb");
    const close = el.querySelector<HTMLElement>("#studio-inspector-close")!;

    await openDrawerFrom(el, row);

    expect(el.querySelector("#inspector-tab-crossReference")!.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(close);

    await keyDown(close, "Escape");
    expect(document.activeElement, "focus did not return to the row").toBe(row);
    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("false");
  });

  it("activates the toggle from the keyboard, not only from a mouse", async () => {
    // A <button> activates on Enter through the browser's default action, which
    // jsdom implements as a click on the focused element. Asserted so a future
    // change to a non-button control cannot silently break keyboard operation.
    const el = await render();
    const toggle = buttonByText(el, T.inspector.toggle)!;
    paint(el.querySelector("#studio-inspector-close")!);
    await focus(toggle);

    const { act } = await import("react");
    await act(async () => {
      toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      (document.activeElement as HTMLElement).click();
    });

    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("true");
    expect(document.activeElement).toBe(el.querySelector("#studio-inspector-close"));
  });

  it("does NOT steal focus when the inspector is an inline column", async () => {
    // At xl the close control is display:none, so `offsetParent` is null and the
    // panel is a column that was already on screen. Pulling focus into it would
    // be a worse defect than the one this round fixes.
    const el = await render();
    const toggle = buttonByText(el, T.inspector.toggle)!;
    await focus(toggle);
    await click(toggle);   // the close control is NOT painted in this test

    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("true");
    expect(document.activeElement, "focus was pulled into an inline column").toBe(toggle);
  });

  it("leaves an inline column open on Escape", async () => {
    const el = await render();
    const toggle = buttonByText(el, T.inspector.toggle)!;
    await focus(toggle);
    await click(toggle);
    await keyDown(inspectorColumn(el), "Escape");
    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("true");
  });
});

/* ── R2 · aria-expanded follows the width while the default stands ────────── */

describe("109-C-UI.1 R2 · the toggle's announced state survives a resize", () => {
  /*
   * THE DEFECT THIS PINS.
   *
   * R1 read the breakpoint default ONCE at mount. Dragging the window across
   * 1280 px without pressing the toggle left `aria-expanded` describing the old
   * width: the panel appeared or vanished and the control kept announcing the
   * previous state. The fix is a `resize` listener — no second media query (the
   * Studio consults exactly one, which `phase109c1-viewport-mode` pins), no
   * ResizeObserver, no polling.
   */
  const resize = async (el: HTMLElement, painted: boolean) => {
    const column = inspectorColumn(el) as HTMLElement;
    Object.defineProperty(column, "offsetParent", {
      value: painted ? column.parentElement ?? document.body : null,
      configurable: true,
    });
    const { act } = await import("react");
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
  };

  it("flips aria-expanded in BOTH directions without a single press", async () => {
    const el = await render();
    const toggle = buttonByText(el, T.inspector.toggle)!;

    // jsdom paints nothing, so the mount reading is "not visible".
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("auto");

    // Widen past xl: CSS reveals the column, and the control must say so.
    await resize(el, true);
    expect(
      toggle.getAttribute("aria-expanded"),
      "the toggle still announced the pre-resize width",
    ).toBe("true");

    // Narrow again.
    await resize(el, false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    // The engineer never pressed anything, so the state is still the default.
    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("auto");
  });

  it("stops tracking the width once the engineer has chosen", async () => {
    // A choice outranks the breakpoint: after a press, a resize must not
    // silently overwrite what the reader asked for.
    const el = await render();
    const toggle = buttonByText(el, T.inspector.toggle)!;
    await focus(toggle);
    await click(toggle);
    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("true");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await resize(el, false);
    expect(inspectorColumn(el).getAttribute("data-inspector-open")).toBe("true");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("adds no second media query, no ResizeObserver and no polling", async () => {
    const asked: string[] = [];
    const originalMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    const originalRO = (window as unknown as { ResizeObserver?: unknown }).ResizeObserver;
    let observers = 0;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => {
        asked.push(query);
        return { matches: true, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList;
      },
    });
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      constructor() { observers += 1; }
      observe() {}
      disconnect() {}
    };
    const timers: number[] = [];
    const originalInterval = window.setInterval;
    (window as unknown as { setInterval: unknown }).setInterval = ((...a: unknown[]) => {
      timers.push(1);
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof window.setInterval;

    try {
      await render();
      expect(new Set(asked)).toEqual(new Set(["(min-width: 1024px)"]));
      expect(observers, "a ResizeObserver was constructed").toBe(0);
      expect(timers.length, "a polling interval was started").toBe(0);
    } finally {
      if (originalMedia) Object.defineProperty(window, "matchMedia", originalMedia);
      else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
      (window as unknown as { ResizeObserver?: unknown }).ResizeObserver = originalRO;
      (window as unknown as { setInterval: unknown }).setInterval = originalInterval;
    }
  });
});
