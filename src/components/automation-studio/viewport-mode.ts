/**
 * PHASE 109-C1 — which responsive branch of the Studio is MOUNTED.
 *
 * THE DEFECT THIS REPLACES
 * Until the authenticated browser matrix ran, both responsive branches were
 * rendered at every width and CSS chose the visible one. That is the right
 * default for server rendering — the server cannot know the viewport — but it
 * left the full source editor in the DOM at 320 and 390. Hidden by
 * `display: none`, yes; absent, no. A textarea that exists can be reached by
 * script, by find-in-page, by an assistive technology that ignores CSS, and by
 * any future CSS change that forgets the breakpoint. The companion contract
 * says the phone view is READ-ONLY, and "read-only, except for the editor we
 * did not remove" is not read-only.
 *
 * THE RULE
 * Measure the viewport with the same media query Tailwind's `lg:` uses, and
 * mount only the branch that applies:
 *
 *     unmeasured   server render, hydration, and any host without matchMedia
 *                  (jsdom): BOTH branches mount and CSS decides, exactly as
 *                  before. The HTML the server sends is unchanged.
 *     companion    the phone branch only. The workspace — explorer, editor,
 *                  inspector, output panel — is not in the tree at all.
 *     workspace    the tablet/desktop branch only.
 *
 * `useSyncExternalStore` is what makes this hydration-safe: React hydrates
 * with the server snapshot ("unmeasured", so the client's first render matches
 * the server's HTML), then re-renders with the measured snapshot. There is no
 * `typeof window` branch during render and no mismatch to warn about.
 */

import { useSyncExternalStore } from "react";

export type ViewportMode = "unmeasured" | "companion" | "workspace";

/** Tailwind's `lg` breakpoint. The workspace branch is `hidden lg:flex`. */
export const WORKSPACE_MIN_WIDTH_PX = 1024;
export const WORKSPACE_MEDIA_QUERY = `(min-width: ${WORKSPACE_MIN_WIDTH_PX}px)`;

/** The subset of MediaQueryList this module relies on. */
export interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener?(type: "change", listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
  /** Legacy Safari (< 14) API. */
  addListener?(listener: () => void): void;
  removeListener?(listener: () => void): void;
}

/** The subset of Window this module relies on, so it can be tested with a stub. */
export interface MediaHost {
  matchMedia?: (query: string) => MediaQueryLike;
}

/**
 * Read the mode from a host. A host that cannot measure — no `matchMedia`, as
 * on the server and in jsdom — reports "unmeasured", never a guess.
 */
export function readViewportMode(host: MediaHost | undefined): ViewportMode {
  if (!host || typeof host.matchMedia !== "function") return "unmeasured";
  return host.matchMedia(WORKSPACE_MEDIA_QUERY).matches ? "workspace" : "companion";
}

/** Subscribe to breakpoint changes. Returns the unsubscribe function. */
export function subscribeViewportMode(host: MediaHost | undefined, onChange: () => void): () => void {
  if (!host || typeof host.matchMedia !== "function") return () => {};
  const list = host.matchMedia(WORKSPACE_MEDIA_QUERY);
  if (typeof list.addEventListener === "function") {
    list.addEventListener("change", onChange);
    return () => list.removeEventListener?.("change", onChange);
  }
  if (typeof list.addListener === "function") {
    list.addListener(onChange);
    return () => list.removeListener?.(onChange);
  }
  return () => {};
}

export function rendersCompanion(mode: ViewportMode): boolean {
  return mode !== "workspace";
}

export function rendersWorkspace(mode: ViewportMode): boolean {
  return mode !== "companion";
}

const hostWindow = (): MediaHost | undefined =>
  (typeof window === "undefined" ? undefined : (window as unknown as MediaHost));

const subscribe = (onChange: () => void) => subscribeViewportMode(hostWindow(), onChange);
const getSnapshot = () => readViewportMode(hostWindow());
const getServerSnapshot = (): ViewportMode => "unmeasured";

/**
 * The mounted responsive mode. "unmeasured" on the server and during
 * hydration; the measured value from the first client render after that, and
 * again whenever the viewport crosses the breakpoint.
 */
export function useViewportMode(): ViewportMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
