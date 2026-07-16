"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";
import { FOCUS_RING } from "./a11y";

export interface TabItem {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
  className?: string;
}

/**
 * Tabs — accessible tablist (roving tabindex, aria-selected). Arrow keys move
 * selection and mirror correctly under RTL (resolved from the element's
 * computed direction); Home/End jump to ends. Pair each tab with a panel that
 * has `role="tabpanel"` and `aria-labelledby` the tab id.
 */
export function Tabs({ items, value, onValueChange, className, ...aria }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function move(fromValue: string, dir: 1 | -1) {
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.value === fromValue);
    if (idx === -1) return;
    const next = enabled[(idx + dir + enabled.length) % enabled.length];
    onValueChange(next.value);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
      ?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, itemValue: string) {
    const rtl =
      typeof window !== "undefined" && listRef.current
        ? getComputedStyle(listRef.current).direction === "rtl"
        : false;
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        move(itemValue, rtl ? -1 : 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        move(itemValue, rtl ? 1 : -1);
        break;
      case "Home": {
        e.preventDefault();
        const first = items.find((i) => !i.disabled);
        if (first) onValueChange(first.value);
        break;
      }
      case "End": {
        e.preventDefault();
        const last = [...items].reverse().find((i) => !i.disabled);
        if (last) onValueChange(last.value);
        break;
      }
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={aria["aria-label"]}
      className={cn("inline-flex items-center gap-1 border-b border-border-default", className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            data-value={item.value}
            id={`tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, item.value)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-label font-medium transition-colors duration-fast",
              FOCUS_RING,
              selected
                ? "border-brand-primary text-text-primary"
                : "border-transparent text-text-muted hover:text-text-secondary",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
