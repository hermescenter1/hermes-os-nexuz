"use client";

// PHASE 87C — Command palette (navigation-only, by design).
//
// No universal search backend exists (audit-verified), so this palette is
// explicitly a NAVIGATION switcher over the role-filtered app-nav registry —
// it never simulates unavailable search results. It is a custom top-anchored
// overlay (ds Dialog is a centered modal with fixed content padding — audit
// flagged it unsuitable), built on the shared useOverlayBehavior focus trap.
//
// Open via Ctrl/Cmd+K anywhere, the sidebar/topbar search triggers (they
// dispatch "hermes:command-palette"), Escape/backdrop closes, focus restores.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/components/ds";
import { useOverlayBehavior } from "@/components/ds/overlay";
import type { AppNavGroup } from "@/lib/navigation/app-nav";

export interface AppCommandPaletteProps {
  /** Role-filtered groups (server-resolved). */
  groups: AppNavGroup[];
}

interface Command {
  href: string;
  label: string;
  groupLabel: string;
}

export function AppCommandPalette({ groups }: AppCommandPaletteProps) {
  const t = useTranslations("appShell");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const onClose = useCallback(() => setOpen(false), []);
  useOverlayBehavior({ open, onClose, panelRef });

  // Global shortcut + custom trigger event.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("hermes:command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("hermes:command-palette", onOpenEvent);
    };
  }, []);

  // Reset state each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
    }
  }, [open]);

  const commands: Command[] = useMemo(
    () =>
      groups.flatMap((g) =>
        g.items.map((item) => ({
          href: item.href,
          label: t(`nav.items.${item.labelKey}`),
          groupLabel: t(`nav.groups.${g.groupKey}`),
        })),
      ),
    [groups, t],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.groupLabel.toLowerCase().includes(q),
    );
  }, [commands, query]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && filtered[highlighted]) {
      e.preventDefault();
      go(filtered[highlighted].href);
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("shell.commandPaletteTitle")}
        tabIndex={-1}
        data-hermes-signature="command"
        // `mt-24` moved into `.hermes-command-surface` as `margin-block-start:
        // var(--space-page)`, because the top offset is part of the height
        // budget the surface caps itself against.
        //
        // The surface takes its NATURAL height on a tall viewport and is capped
        // to the available height on a short one. Both need `align-self:
        // flex-start` in the CSS: this wrapper is a row flex container, so its
        // default `stretch` alignment would otherwise pull the panel down to
        // the cap — roughly 180px of empty space at 1440x900.
        className="hermes-command-surface ds-glass relative z-10 shadow-e4 outline-none"
      >
        <div className="border-b border-border-default p-3">
          <input
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={filtered[highlighted] ? `${listboxId}-${highlighted}` : undefined}
            aria-label={t("shell.commandPaletteInputLabel")}
            placeholder={t("shell.searchHint")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(0);
            }}
            onKeyDown={onInputKeyDown}
            // PHASE 104-D — the Hermes Command field. Its height comes from the
            // Command signature (56 mobile / 64 desktop): deliberately larger
            // than any other control in the product, which is what makes the
            // signature recognisable. Behaviour is untouched.
            className={cn(
              "hermes-command-field ds-focus w-full rounded-sm border border-border-default bg-surface-interactive px-3",
              "text-body text-text-primary placeholder:text-text-muted",
            )}
          />
          <p className="mt-2 text-caption text-text-muted">{t("shell.commandPaletteNavHint")}</p>
        </div>
        <ul id={listboxId} role="listbox" aria-label={t("shell.commandPaletteTitle")} className="hermes-command-list overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-body text-text-muted">{t("shell.noResults")}</li>
          ) : (
            filtered.map((c, i) => (
              <li
                key={c.href}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === highlighted}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(c.href);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-label",
                  i === highlighted ? "bg-surface-interactive text-text-primary" : "text-text-secondary",
                )}
              >
                <span className="truncate font-medium">{c.label}</span>
                <span className="shrink-0 text-caption text-text-muted">{c.groupLabel}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
