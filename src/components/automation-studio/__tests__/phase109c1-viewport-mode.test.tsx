// @vitest-environment jsdom
/**
 * PHASE 109-C1 — the companion view carries no editor.
 *
 * The authenticated browser matrix (EN/DE/FA × 320/390/1024/1440) failed every
 * phone cell with COMPANION_EXPOSES_EDITOR and COMPANION_EDITABLE: the full
 * source editor's textarea was in the DOM at 320 and 390. It was display:none,
 * which is hidden, not absent. This file asserts the corrected contract at the
 * DOM level, in the only way jsdom allows — by stubbing the media query the
 * product measures, since jsdom performs no layout and has no matchMedia.
 *
 *   phone       the workspace branch — explorer, editor, inspector, output —
 *               is NOT mounted; no textarea exists anywhere in the tree
 *   tablet+     the workspace branch is mounted and the editor is editable;
 *               the companion branch is NOT mounted
 *   unmeasured  (server, hydration, hosts without matchMedia) both branches
 *               mount, exactly as the server renders them
 *   resize      crossing the breakpoint swaps the branches
 */

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import { resolveWorkspaceSource } from "@/lib/automation-studio";
import { StudioWorkspace } from "../StudioWorkspace";
import { SYMBOL_SEARCH_TARGETS, focusFirstVisible } from "../focus-target";
import {
  WORKSPACE_MEDIA_QUERY,
  WORKSPACE_MIN_WIDTH_PX,
  readViewportMode,
  rendersCompanion,
  rendersWorkspace,
  subscribeViewportMode,
  type MediaQueryLike,
} from "../viewport-mode";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/engineering/studio",
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

/* ------------------------------------------------------------------ */
/* a controllable matchMedia                                           */
/* ------------------------------------------------------------------ */

interface MediaStub {
  readonly queries: string[];
  readonly listeners: Set<() => void>;
  set(matches: boolean): void;
}

function installMatchMedia(matches: boolean): MediaStub {
  let current = matches;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  const list: MediaQueryLike = {
    get matches() {
      return current;
    },
    addEventListener: (_type, listener) => { listeners.add(listener); },
    removeEventListener: (_type, listener) => { listeners.delete(listener); },
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => { queries.push(query); return list; },
  });
  return {
    queries,
    listeners,
    set(next) {
      current = next;
      for (const listener of listeners) listener();
    },
  };
}

function uninstallMatchMedia(): void {
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
}

async function render(): Promise<HTMLElement> {
  document.body.replaceChildren();
  const { container } = await mount(
    <NextIntlClientProvider locale="en" messages={en}>
      <StudioWorkspace source={resolveWorkspaceSource()} />
    </NextIntlClientProvider>,
  );
  return container;
}

const surface = (el: HTMLElement, name: string) => el.querySelector(`[data-studio-surface="${name}"]`);

afterEach(() => {
  uninstallMatchMedia();
  document.body.replaceChildren();
});

/* ------------------------------------------------------------------ */
/* the pure part                                                       */
/* ------------------------------------------------------------------ */

describe("109-C1 · viewport mode — reading the host", () => {
  it("uses Tailwind's lg breakpoint, so the mount decision and the classes agree", () => {
    expect(WORKSPACE_MIN_WIDTH_PX).toBe(1024);
    expect(WORKSPACE_MEDIA_QUERY).toBe("(min-width: 1024px)");
  });

  it("reports unmeasured — never a guess — when the host cannot measure", () => {
    expect(readViewportMode(undefined)).toBe("unmeasured");
    expect(readViewportMode({})).toBe("unmeasured");
  });

  it("reports workspace when the query matches and companion when it does not", () => {
    expect(readViewportMode({ matchMedia: () => ({ matches: true }) })).toBe("workspace");
    expect(readViewportMode({ matchMedia: () => ({ matches: false }) })).toBe("companion");
  });

  it("asks the host exactly the workspace query", () => {
    const asked: string[] = [];
    readViewportMode({ matchMedia: (q) => { asked.push(q); return { matches: true }; } });
    expect(asked).toEqual([WORKSPACE_MEDIA_QUERY]);
  });

  it("unmeasured mounts both branches; a measured mode mounts exactly one", () => {
    expect([rendersCompanion("unmeasured"), rendersWorkspace("unmeasured")]).toEqual([true, true]);
    expect([rendersCompanion("companion"), rendersWorkspace("companion")]).toEqual([true, false]);
    expect([rendersCompanion("workspace"), rendersWorkspace("workspace")]).toEqual([false, true]);
  });

  it("subscribes through addEventListener and unsubscribes cleanly", () => {
    const listeners = new Set<() => void>();
    const host = {
      matchMedia: () => ({
        matches: true,
        addEventListener: (_t: "change", l: () => void) => { listeners.add(l); },
        removeEventListener: (_t: "change", l: () => void) => { listeners.delete(l); },
      }),
    };
    const onChange = vi.fn();
    const off = subscribeViewportMode(host, onChange);
    expect(listeners.size).toBe(1);
    for (const l of listeners) l();
    expect(onChange).toHaveBeenCalledTimes(1);
    off();
    expect(listeners.size).toBe(0);
  });

  it("falls back to the legacy addListener API", () => {
    const listeners = new Set<() => void>();
    const host = {
      matchMedia: () => ({
        matches: false,
        addListener: (l: () => void) => { listeners.add(l); },
        removeListener: (l: () => void) => { listeners.delete(l); },
      }),
    };
    const off = subscribeViewportMode(host, () => {});
    expect(listeners.size).toBe(1);
    off();
    expect(listeners.size).toBe(0);
  });

  it("is a no-op subscription on a host that cannot measure", () => {
    expect(() => subscribeViewportMode(undefined, () => {})()).not.toThrow();
    expect(() => subscribeViewportMode({}, () => {})()).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* the rendered contract                                               */
/* ------------------------------------------------------------------ */

describe("109-C1 · companion mode (320 / 390) mounts NO editor", () => {
  it("does not mount the workspace branch at all", async () => {
    installMatchMedia(false);
    const el = await render();
    expect(surface(el, "companion"), "companion surface").not.toBeNull();
    expect(surface(el, "workspace"), "workspace surface must be absent").toBeNull();
    expect(surface(el, "explorer"), "explorer").toBeNull();
    expect(surface(el, "inspector"), "inspector").toBeNull();
  });

  it("has no textarea and no editor anywhere in the DOM — absent, not hidden", async () => {
    installMatchMedia(false);
    const el = await render();
    // This is the exact measurement the browser harness makes for
    // COMPANION_EXPOSES_EDITOR and COMPANION_EDITABLE.
    expect(el.querySelector("#studio-source-editor")).toBeNull();
    expect(el.querySelectorAll("textarea").length).toBe(0);
    expect(el.querySelectorAll("[contenteditable]").length).toBe(0);
    // And nothing in the companion tree claims an editable save state.
    expect(el.querySelector("#studio-save-state")).toBeNull();
  });

  it("keeps every companion surface the contract names", async () => {
    installMatchMedia(false);
    const el = await render();
    for (const name of ["summary", "diagnostics", "symbolLookup"]) {
      expect(el.querySelector(`[data-studio-companion-section="${name}"]`), name).not.toBeNull();
    }
    expect(el.querySelector("#studio-symbol-search-mobile")).not.toBeNull();
    expect(el.querySelector("#studio-symbol-search"), "the desktop input is not mounted").toBeNull();
  });

  it("resolves the Search-symbols target to the companion input, with the desktop id absent", async () => {
    installMatchMedia(false);
    const el = await render();
    // jsdom performs no layout, so give the rendered input the box a browser
    // would give it. Everything else is measured from the real DOM.
    const mobile = el.querySelector("#studio-symbol-search-mobile")!;
    Object.defineProperty(mobile, "getClientRects", {
      value: () => [{ width: 280, height: 32 }] as unknown as DOMRectList,
      configurable: true,
    });
    const outcome = focusFirstVisible(document, SYMBOL_SEARCH_TARGETS);
    expect(outcome.selected).toBe("studio-symbol-search-mobile");
    expect(outcome.succeeded).toBe(true);
    expect(outcome.usedNoLayoutFallback).toBe(false);
    // The desktop id is now refused as ABSENT — not display-none — because it
    // is not in the tree.
    expect(outcome.refusals).toEqual([{ id: "studio-symbol-search", reason: "absent" }]);
    expect(document.activeElement).toBe(mobile);
  });

  it("still states the simulated disclosure and the read-only boundaries", async () => {
    installMatchMedia(false);
    const el = await render();
    const text = el.textContent ?? "";
    expect(text).toContain(en.automationStudio.disclosure.noLiveController);
    expect(text).toContain(en.automationStudio.boundaries.noDownload);
    expect(el.querySelector("[data-studio-classification]")?.getAttribute("data-studio-classification")).toBe("SIMULATED");
  });
});

describe("109-C1 · workspace mode (1024 / 1440) keeps the editable Studio", () => {
  it("mounts the workspace branch with an editable source editor", async () => {
    installMatchMedia(true);
    const el = await render();
    expect(surface(el, "workspace")).not.toBeNull();
    expect(surface(el, "explorer")).not.toBeNull();
    expect(surface(el, "inspector")).not.toBeNull();
    const editor = el.querySelector<HTMLTextAreaElement>("#studio-source-editor");
    expect(editor).not.toBeNull();
    expect(editor!.readOnly).toBe(false);
    expect(editor!.disabled).toBe(false);
    expect(el.querySelector("#studio-save-state")?.getAttribute("data-save-state")).toBe("unchanged");
  });

  it("does not mount the companion branch", async () => {
    installMatchMedia(true);
    const el = await render();
    expect(surface(el, "companion")).toBeNull();
    expect(el.querySelector("#studio-symbol-search-mobile")).toBeNull();
    expect(el.querySelectorAll("[data-studio-companion-section]").length).toBe(0);
  });
});

describe("109-C1 · unmeasured hosts render what the server renders", () => {
  it("mounts BOTH branches when matchMedia is unavailable, so hydration matches the HTML", async () => {
    uninstallMatchMedia();
    expect(typeof window.matchMedia).toBe("undefined");
    const el = await render();
    expect(surface(el, "companion")).not.toBeNull();
    expect(surface(el, "workspace")).not.toBeNull();
    // The CSS classes still decide visibility in this state.
    expect(surface(el, "companion")!.className).toContain("lg:hidden");
    expect(surface(el, "workspace")!.className).toContain("hidden");
    expect(surface(el, "workspace")!.className).toContain("lg:flex");
  });
});

describe("109-C1 · crossing the breakpoint swaps the branches", () => {
  it("unmounts the editor when the viewport narrows, and restores it when it widens", async () => {
    const media = installMatchMedia(true);
    const el = await render();
    expect(media.queries.every((q) => q === WORKSPACE_MEDIA_QUERY)).toBe(true);
    expect(el.querySelector("#studio-source-editor")).not.toBeNull();

    await act(async () => { media.set(false); });
    expect(el.querySelector("#studio-source-editor")).toBeNull();
    expect(surface(el, "workspace")).toBeNull();
    expect(surface(el, "companion")).not.toBeNull();

    await act(async () => { media.set(true); });
    expect(el.querySelector("#studio-source-editor")).not.toBeNull();
    expect(surface(el, "companion")).toBeNull();
  });
});
