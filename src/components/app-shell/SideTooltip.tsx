"use client";

// PHASE 87C — side-placed, portaled tooltip for the collapsed sidebar rail.
//
// The ds/Tooltip is above-only, non-portaled (clips inside the scrollable nav)
// and mixes logical/physical centering; a collapsed icon rail needs an
// inline-END placed bubble that escapes the scroll container. This variant
// portals to document.body, positions from the trigger rect, and flips sides
// under RTL. Shown on hover AND keyboard focus; linked via aria-describedby.

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ds";

export interface SideTooltipProps {
  content: ReactNode;
  /** Single interactive trigger element. */
  children: ReactElement;
  /** Render the bubble at all (rail collapsed). When false, only aria-describedby text renders. */
  enabled?: boolean;
  className?: string;
}

export function SideTooltip({ content, children, enabled = true, className }: SideTooltipProps) {
  const id = useId();
  const [pos, setPos] = useState<{ top: number; left: number; rtl: boolean } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const show = useCallback((e: { currentTarget: EventTarget | null }) => {
    const el = e.currentTarget as HTMLElement | null;
    if (!el) return;
    triggerRef.current = el;
    const rect = el.getBoundingClientRect();
    const rtl = (el.ownerDocument?.dir || getComputedStyle(el).direction) === "rtl";
    setPos({
      top: rect.top + rect.height / 2,
      // inline-end of the trigger: right edge in LTR, left edge in RTL
      left: rtl ? rect.left : rect.right,
      rtl,
    });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-describedby": id,
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
      })
    : children;

  const open = enabled && pos !== null;

  return (
    <>
      {trigger}
      {/* Screen-reader description always present so the accessible name/desc
          never depends on hover state. */}
      <span id={id} className="sr-only">
        {content}
      </span>
      {mounted && open
        ? createPortal(
            <span
              role="tooltip"
              aria-hidden="true"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                transform: pos.rtl ? "translate(calc(-100% - 8px), -50%)" : "translate(8px, -50%)",
              }}
              className={cn(
                "pointer-events-none z-[110] whitespace-nowrap rounded-sm border border-border-default",
                "bg-surface-elevated px-2.5 py-1.5 text-caption text-text-primary shadow-e2",
                className,
              )}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
