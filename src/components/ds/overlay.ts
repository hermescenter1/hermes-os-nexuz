"use client";

import { useEffect, useSyncExternalStore, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * PHASE 104 R1 — modal-overlay registry.
 *
 * Every modal surface in the product (Dialog, Drawer, command palette) already
 * goes through `useOverlayBehavior`, so registering there covers all of them
 * with one change and cannot be forgotten by a future overlay: if a surface
 * traps focus, it is registered.
 *
 * The registry exists so NON-modal, site-wide notices can stand down while a
 * modal is open. The layer contract in `./layers` already places them below
 * `overlay`, but a notice dimmed behind a scrim is still a second dialog on
 * screen — the cookie-consent banner covering an open navigation drawer was
 * exactly this. See LAYER in ./layers for the full ordering.
 */
let modalOverlayCount = 0;
const modalOverlayListeners = new Set<() => void>();

function emitModalOverlayChange(): void {
  for (const listener of modalOverlayListeners) listener();
}

/** Registers an open modal overlay; returns the matching unregister. */
export function registerModalOverlay(): () => void {
  modalOverlayCount += 1;
  emitModalOverlayChange();
  let released = false;
  return () => {
    /* guarded: React may run a cleanup more than once in development, and a
       double decrement would report "no modal open" while one still is. */
    if (released) return;
    released = true;
    modalOverlayCount = Math.max(0, modalOverlayCount - 1);
    emitModalOverlayChange();
  };
}

function subscribeModalOverlay(listener: () => void): () => void {
  modalOverlayListeners.add(listener);
  return () => { modalOverlayListeners.delete(listener); };
}

/** True while at least one modal overlay is open. */
export function useAnyModalOverlayOpen(): boolean {
  return useSyncExternalStore(
    subscribeModalOverlay,
    () => modalOverlayCount > 0,
    /* server snapshot: nothing is open during SSR, so a notice renders in the
       initial HTML exactly as it did before this change. */
    () => false,
  );
}

/**
 * useOverlayBehavior — shared modal/drawer behaviour for Dialog and Drawer:
 * on open, remembers the previously focused element and moves focus into the
 * panel; Escape closes; Tab is trapped within the panel; on close, focus is
 * restored. Keeps the two overlay shells consistent and dependency-free.
 */
export function useOverlayBehavior({
  open,
  onClose,
  panelRef,
}: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
}): void {
  useEffect(() => {
    if (!open) return;

    /* Registered for the whole time this overlay is open, so non-modal notices
       can stand down. Released by the same cleanup that restores focus. */
    const unregister = registerModalOverlay();

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the panel (first focusable, else the panel itself).
    const focusables = panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    (focusables[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      unregister();
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, panelRef]);
}
