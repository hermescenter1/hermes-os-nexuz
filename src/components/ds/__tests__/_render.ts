import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

// React 19 requires this flag for act() outside a test renderer.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  container: HTMLElement;
  root: Root;
  unmount: () => Promise<void>;
  rerender: (ui: ReactNode) => Promise<void>;
}

/** Mount real React into a jsdom container. */
export async function mount(ui: ReactNode): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  return {
    container,
    root,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
    rerender: async (ui2: ReactNode) => {
      await act(async () => root.render(ui2));
    },
  };
}

/** Dispatch a real click within act(). */
export async function click(el: Element | null): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

/** Move focus within act(). */
export async function focus(el: Element | null): Promise<void> {
  await act(async () => {
    (el as HTMLElement).focus();
  });
}

/** Remove focus within act(). */
export async function blur(el: Element | null): Promise<void> {
  await act(async () => {
    (el as HTMLElement).blur();
  });
}

/** Dispatch a real keydown (bubbles, so React delegation and document capture both see it). */
export async function keyDown(el: Element | null, key: string, opts: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    (el as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }),
    );
  });
}

/** The element that currently has focus. */
export function active(): Element | null {
  return document.activeElement;
}
