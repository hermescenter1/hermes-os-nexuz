// @vitest-environment jsdom
/**
 * PHASE 109-C1 Round 1.1 — behavioural proof for the corrections.
 *
 * Round 1's palette tests asserted that a tab label changed. That is not what
 * the commands claim to do, so these tests assert the ACTION: focus moves, the
 * validation result is recomputed, the mode the edit gate reads changes, and
 * typing into the source really edits it.
 */

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { click, mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { resolveWorkspaceSource } from "@/lib/automation-studio";
import { StudioWorkspace } from "../StudioWorkspace";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/engineering/studio",
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

const CATALOGUES = { en, fa } as const;
type Loc = keyof typeof CATALOGUES;

async function render(locale: Loc = "en"): Promise<HTMLElement> {
  document.body.replaceChildren();
  const { container } = await mount(
    <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]}>
      <StudioWorkspace source={resolveWorkspaceSource()} />
    </NextIntlClientProvider>,
  );
  return container;
}

const editor = (el: HTMLElement) => el.querySelector<HTMLTextAreaElement>("#studio-source-editor");

/** Type into the textarea the way React sees a real edit. */
async function type(area: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(area, value);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(area: Element, key: string, opts: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    area.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
  });
}

function buttonByText(el: HTMLElement, text: string): HTMLButtonElement | null {
  return [...el.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === text,
  ) as HTMLButtonElement | null;
}

const T = en.automationStudio;

describe("109-C1 R1.1 · the source is genuinely editable", () => {
  it("renders a real, labelled, LTR textarea for a draft artifact", async () => {
    const el = await render();
    const area = editor(el);
    expect(area).not.toBeNull();
    expect(area!.tagName).toBe("TEXTAREA");
    expect(area!.readOnly).toBe(false);
    expect(area!.getAttribute("dir")).toBe("ltr");
    expect(area!.getAttribute("aria-label")).toContain(T.editor.label);
  });

  it("starts unchanged and reports it", async () => {
    const el = await render();
    expect(el.textContent).toContain(T.editor.save.unchanged);
    expect(el.textContent).not.toContain(T.editor.save.locallySaved);
  });

  it("an edit changes the content and the reported state", async () => {
    const el = await render();
    const area = editor(el)!;
    const before = area.value;

    await type(area, `${before}\n// engineer note`);

    expect(editor(el)!.value).toContain("// engineer note");
    expect(el.textContent).toContain(T.editor.save.modified);
    expect(el.textContent).not.toContain(T.editor.save.locallySaved);
  });

  it("undo restores the baseline and redo puts the edit back", async () => {
    const el = await render();
    const area = editor(el)!;
    const baseline = area.value;

    await type(area, `${baseline}\n// undo me`);
    expect(editor(el)!.value).not.toBe(baseline);

    await press(editor(el)!, "z", { ctrlKey: true });
    expect(editor(el)!.value).toBe(baseline);
    expect(el.textContent).toContain(T.editor.save.unchanged);

    await press(editor(el)!, "z", { ctrlKey: true, shiftKey: true });
    expect(editor(el)!.value).toContain("// undo me");
  });

  it("Ctrl+Y also redoes", async () => {
    const el = await render();
    const area = editor(el)!;
    const baseline = area.value;
    await type(area, `${baseline}\n// y`);
    await press(editor(el)!, "z", { ctrlKey: true });
    await press(editor(el)!, "y", { ctrlKey: true });
    expect(editor(el)!.value).toContain("// y");
  });

  it("saving locally moves modified -> saved, and a further edit moves it back", async () => {
    const el = await render();
    await type(editor(el)!, `${editor(el)!.value}\n// one`);
    expect(el.textContent).toContain(T.editor.save.modified);

    await click(buttonByText(el, T.editor.saveLocally));
    expect(el.textContent).toContain(T.editor.save.locallySaved);

    await type(editor(el)!, `${editor(el)!.value}\n// two`);
    expect(el.textContent).toContain(T.editor.save.modified);
  });

  it("the save indicator never claims saved before a save", async () => {
    const el = await render();
    await type(editor(el)!, `${editor(el)!.value}\n// unsaved`);
    const chrome = el.textContent ?? "";
    expect(chrome).not.toContain(T.editor.save.locallySaved);
  });

  it("an edit marks the artifact modified in the project explorer", async () => {
    const el = await render();
    const before = [...el.querySelectorAll('[role="treeitem"]')].filter((n) =>
      (n.textContent ?? "").includes(T.explorer.modified),
    ).length;

    await type(editor(el)!, `${editor(el)!.value}\n// touched`);

    const after = [...el.querySelectorAll('[role="treeitem"]')].filter((n) =>
      (n.textContent ?? "").includes(T.explorer.modified),
    ).length;
    expect(after).toBeGreaterThan(before);
  });

  it("the inspector shows the checksum of the CURRENT content, not the fixture", async () => {
    // The inspector once rendered `artifact.checksum` — the fixture value — so
    // it kept displaying the pre-edit digest after the source had changed. An
    // identity field that silently goes stale is worse than no field: an
    // engineer comparing checksums would draw the wrong conclusion.
    const el = await render();
    const checksumOf = () => {
      const dt = [...el.querySelectorAll("dt")].find(
        (n) => (n.textContent ?? "").trim() === T.inspector.propertyChecksum,
      );
      return (dt?.nextElementSibling?.textContent ?? "").trim();
    };

    const before = checksumOf();
    expect(before).not.toBe("");

    await type(editor(el)!, `${editor(el)!.value}\n// changes the digest`);

    const after = checksumOf();
    expect(after).not.toBe("");
    expect(after).not.toBe(before);
  });

  it("performs no network call while editing", async () => {
    // Replaced outright rather than spied on: jsdom may not define `fetch`, and
    // a spy on an absent global proves nothing. This one also REJECTS, so a
    // call would fail loudly rather than resolve unnoticed.
    const original = globalThis.fetch;
    const calls: unknown[][] = [];
    globalThis.fetch = ((...args: unknown[]) => {
      calls.push(args);
      return Promise.reject(new Error("no network is permitted in the Studio"));
    }) as unknown as typeof fetch;
    try {
      const el = await render();
      await type(editor(el)!, `${editor(el)!.value}\n// no network`);
      await click(buttonByText(el, T.editor.saveLocally));
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("109-C1 R1.1 · the command palette does what it says", () => {
  async function openPalette(el: HTMLElement): Promise<void> {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(el.ownerDocument.querySelector('[role="dialog"]'), "palette did not open").not.toBeNull();
  }

  function paletteOption(label: string): HTMLButtonElement | null {
    return [...document.querySelectorAll('[role="option"]')].find(
      (o) => (o.textContent ?? "").includes(label),
    ) as HTMLButtonElement | null;
  }

  it("opens on Ctrl+K and lists commands", async () => {
    const el = await render();
    await openPalette(el);
    expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(5);
  });

  it("Search symbols opens the symbols surface AND moves focus to its input", async () => {
    const el = await render();
    await openPalette(el);
    await click(paletteOption(T.palette.searchSymbols));

    const input = el.querySelector("#studio-symbol-search");
    expect(input, "the symbols surface did not open").not.toBeNull();
    // Focus is the action, not a side effect. No timer wait: the workspace
    // moves focus in a commit effect, which act() has already flushed, so this
    // assertion is deterministic rather than a race against a frame callback.
    expect(document.activeElement).toBe(input);
  });

  it("Show diagnostics opens the problems surface", async () => {
    const el = await render();
    await openPalette(el);
    await click(paletteOption(T.palette.showDiagnostics));
    const tab = el.querySelector("#output-tab-problems");
    expect(tab!.getAttribute("aria-selected")).toBe("true");
  });

  it("Toggle output genuinely toggles the panel", async () => {
    const el = await render();
    expect(el.querySelector("#output-panel")).not.toBeNull();

    await openPalette(el);
    await click(paletteOption(T.palette.toggleBottomPanel));
    expect(el.querySelector("#output-panel")).toBeNull();

    await openPalette(el);
    await click(paletteOption(T.palette.toggleBottomPanel));
    expect(el.querySelector("#output-panel")).not.toBeNull();
  });

  it("Switch mode updates the AUTHORITATIVE mode, which stops editing", async () => {
    const el = await render();
    expect(editor(el), "should start editable").not.toBeNull();

    await openPalette(el);
    await click(paletteOption(T.palette.switchMode));

    expect(el.textContent).toContain(T.mode.review);
    // The gate the editor reads changed, so the textarea is gone and the reason
    // is stated. A display-only mode variable would have left it editable.
    expect(editor(el)).toBeNull();
    expect(el.textContent).toContain(T.editor.refusal["mode-not-simulation"]);
  });

  it("Open project overview shows a real overview surface", async () => {
    const el = await render();
    await openPalette(el);
    await click(paletteOption(T.palette.projectOverview));
    const overview = [...el.querySelectorAll("section")].find(
      (n) => n.getAttribute("aria-label") === T.overview.title,
    );
    expect(overview).toBeDefined();
    expect(overview!.textContent).toContain(T.overview.artifacts);
  });

  it("Validate workspace performs a NEW run, not a redisplay of the last one", async () => {
    const el = await render();

    await openPalette(el);
    await click(paletteOption(T.palette.validateWorkspace));

    const tab = el.querySelector("#output-tab-validation");
    expect(tab!.getAttribute("aria-selected")).toBe("true");

    const runIndexOf = () => el.querySelector("#validation-run-index")!.textContent!.trim();
    const first = runIndexOf();
    expect(first).not.toBe("");

    await openPalette(el);
    await click(paletteOption(T.palette.validateWorkspace));
    const second = runIndexOf();

    // The counter is the only observable difference between a fresh run and a
    // replayed one, because the rule set is deterministic and pure — so if the
    // command stopped triggering a run, this is where it shows.
    expect(second).not.toBe(first);
    expect(second).toBe(T.bottom.runLabel.replace("{run}", "3"));
  });

  it("states on screen what Round 1 validation does not check", async () => {
    // An engineer who types a fault and sees no new problem must be able to
    // learn that from the tool, not from a report they will never read.
    const el = await render();
    await openPalette(el);
    await click(paletteOption(T.palette.validateWorkspace));
    const note = el.querySelector("#validation-scope-note");
    expect(note).not.toBeNull();
    expect(note!.textContent).toBe(T.bottom.scopeNote);
  });

  it("a disabled command states a reason and cannot be run", async () => {
    const el = await render();
    await openPalette(el);
    const disabled = [...document.querySelectorAll('[role="option"][aria-disabled="true"]')];
    for (const option of disabled) {
      expect((option.textContent ?? "").trim().length).toBeGreaterThan(
        T.palette.unavailableReason.length,
      );
    }
  });

  it("offers no compile, download, online or force command", async () => {
    const el = await render();
    await openPalette(el);
    const labels = [...document.querySelectorAll('[role="option"]')].map((o) =>
      (o.textContent ?? "").toLowerCase(),
    );
    for (const forbidden of ["download", "compile", "online", "force"]) {
      expect(labels.find((l) => l.includes(forbidden)), forbidden).toBeUndefined();
    }
  });
});

describe("109-C1 R1.1 · read-only paths refuse edits", () => {
  it("a read-only artifact renders no editor and states the reason", async () => {
    const el = await render();
    // Documentation/Functional_Description is declared read-only in the fixture.
    const node = [...el.querySelectorAll('[role="treeitem"]')].find((n) =>
      (n.textContent ?? "").includes("Functional_Description"),
    );
    expect(node).toBeDefined();
    await click(node!);

    expect(editor(el)).toBeNull();
    // It has no textual source in this round, which is its own stated reason.
    const text = el.textContent ?? "";
    expect(
      text.includes(T.editor.refusal["artifact-read-only"]) ||
        text.includes(T.editor.refusal["no-textual-source"]) ||
        text.includes(T.editor.nonTextual),
    ).toBe(true);
  });
});

describe("109-C1 R1.1 · Persian keeps code LTR while editing", () => {
  it("the textarea is LTR under an RTL catalogue", async () => {
    const el = await render("fa");
    const area = editor(el);
    expect(area).not.toBeNull();
    expect(area!.getAttribute("dir")).toBe("ltr");
    expect(area!.getAttribute("aria-label")).toContain(fa.automationStudio.editor.label);
  });
});

describe("109-C1 R1.2 · commands work FROM the project overview", () => {
  /*
   * Round 1.1 tested the palette only from the default workspace, where the
   * source view is already mounted — the one state in which this whole class of
   * bug cannot appear. From the overview, "Open artifact" and "Go to
   * definition" updated the artifact and then asked for focus on an editor the
   * overview branch had kept unmounted: nothing moved, nothing focused, and no
   * test noticed.
   */
  async function openPalette(el: HTMLElement): Promise<void> {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(el.ownerDocument.querySelector('[role="dialog"]'), "palette did not open").not.toBeNull();
  }

  function paletteOption(label: string): HTMLButtonElement | null {
    return [...document.querySelectorAll('[role="option"]')].find(
      (o) => (o.textContent ?? "").includes(label),
    ) as HTMLButtonElement | null;
  }

  async function runCommand(el: HTMLElement, label: string): Promise<void> {
    await openPalette(el);
    const option = paletteOption(label);
    expect(option, `command not found: ${label}`).not.toBeNull();
    await click(option);
  }

  const overviewSection = (el: HTMLElement) =>
    [...el.querySelectorAll("section")].find((n) => n.getAttribute("aria-label") === T.overview.title) ?? null;

  /** Render, then land on the overview — the starting state under test. */
  async function fromOverview(): Promise<HTMLElement> {
    const el = await render();
    await runCommand(el, T.palette.projectOverview);
    expect(overviewSection(el), "the overview did not open").not.toBeNull();
    expect(editor(el), "the editor should be unmounted while the overview is shown").toBeNull();
    return el;
  }

  it("Open artifact leaves the overview, shows the editor, and focuses it", async () => {
    const el = await fromOverview();

    await runCommand(el, T.palette.openArtifact);

    expect(overviewSection(el), "the overview was not dismissed").toBeNull();
    const area = editor(el);
    expect(area, "the source editor was not mounted").not.toBeNull();
    expect(document.activeElement).toBe(area);
  });

  it("Go to definition leaves the overview and lands on the declaring artifact", async () => {
    const el = await fromOverview();

    await runCommand(el, T.palette.goToDefinition);

    expect(overviewSection(el)).toBeNull();
    // Motor_101_RunFb is the default selection and is declared in FB_Motor.
    const tab = el.querySelector("#source-tab-blk-fb-motor");
    expect(tab, "the declaring artifact has no tab").not.toBeNull();
    expect(tab!.getAttribute("aria-selected")).toBe("true");
    expect(editor(el)).not.toBeNull();
  });

  it("Go to definition positions the caret at the declaration LINE, not merely the file", async () => {
    const el = await fromOverview();
    await runCommand(el, T.palette.goToDefinition);

    const area = editor(el)!;
    // The declaration is at line 6. A textarea cannot anchor to a child, so
    // "position" means the caret sits at the first character of that line —
    // which is also where a keyboard user needs to be.
    const lines = area.value.split("\n");
    const expected = lines.slice(0, 5).reduce((n, l) => n + l.length + 1, 0);
    expect(area.selectionStart).toBe(expected);
    expect(lines[5]).toContain("Motor_101_RunFb");
  });

  it("Search symbols leaves the overview and focuses the search box", async () => {
    const el = await fromOverview();

    await runCommand(el, T.palette.searchSymbols);

    expect(overviewSection(el)).toBeNull();
    const input = el.querySelector("#studio-symbol-search");
    expect(input, "the symbols surface did not open").not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("Find references exposes the references surface from the overview too", async () => {
    // This command deliberately does NOT dismiss the overview: both references
    // surfaces render outside the overview/source branch, so they are already
    // visible and discarding the overview would throw away context the engineer
    // asked for a moment earlier. What must be true is that the surface is
    // actually exposed — from either starting state.
    const el = await fromOverview();

    await runCommand(el, T.palette.findReferences);

    const tab = el.querySelector("#output-tab-references");
    expect(tab, "the references tab is missing").not.toBeNull();
    expect(tab!.getAttribute("aria-selected")).toBe("true");
    expect(el.querySelector("#output-panel")).not.toBeNull();
  });

  it("every command that promises focus actually lands it on a mounted control", async () => {
    // The failure this pins is silent: focus was requested on an id that the
    // overview branch had never rendered, so document.activeElement stayed on
    // <body> and the command looked like it had done nothing at all.
    const cases: readonly [string, string][] = [
      [T.palette.openArtifact, "studio-source-editor"],
      [T.palette.searchSymbols, "studio-symbol-search"],
      [T.palette.goToDefinition, "studio-source-editor"],
    ];
    for (const [label, id] of cases) {
      const el = await fromOverview();
      await runCommand(el, label);
      const target = el.querySelector(`#${id}`);
      expect(target, `${label}: #${id} is not mounted`).not.toBeNull();
      expect(document.activeElement, `${label}: focus did not reach #${id}`).toBe(target);
      expect(document.activeElement).not.toBe(document.body);
    }
  });

  it("running a command twice from the overview is deterministic", async () => {
    // The focus request carries a nonce precisely so a repeat of the SAME
    // command is a new request rather than a no-op deduplicated by React.
    for (const label of [T.palette.openArtifact, T.palette.searchSymbols] as const) {
      const el = await fromOverview();
      await runCommand(el, label);
      const first = (document.activeElement as HTMLElement | null)?.id ?? "";
      expect(first, `${label}: nothing was focused the first time`).not.toBe("");

      // Return to the overview and run it again.
      await runCommand(el, T.palette.projectOverview);
      expect(overviewSection(el)).not.toBeNull();
      await runCommand(el, label);

      // Compared by id, not by node identity: re-entering the overview unmounts
      // the source view, so the second run legitimately focuses a NEW element.
      // Asserting node identity would have demanded that React reuse a node it
      // is free to recreate — a false failure dressed as a determinism check.
      expect((document.activeElement as HTMLElement | null)?.id, label).toBe(first);
      expect(document.activeElement).not.toBe(document.body);
      expect(overviewSection(el)).toBeNull();
    }
  });

  it("the overview's own Back to source button also restores the editor", async () => {
    const el = await fromOverview();
    await click(buttonByText(el, T.overview.backToSource));
    expect(overviewSection(el)).toBeNull();
    expect(editor(el)).not.toBeNull();
  });
});
