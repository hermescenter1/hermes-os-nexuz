"use client";

/**
 * PHASE 109-C1 — the command palette.
 *
 * Two rules shape what appears here.
 *
 * A command that cannot run right now is listed and DISABLED with a stated
 * reason, so the keyboard user learns it exists and what would enable it.
 *
 * A command the product cannot do at all — compile, download, go online, force
 * a variable — is NOT listed. A greyed-out "Download to PLC" would tell an
 * engineer the capability is one permission away. It is not: it does not exist.
 * Absence is the honest presentation.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/components/ds/cn";
import { FOCUS_RING } from "@/components/ds/a11y";

export interface PaletteCommand {
  readonly id: string;
  readonly labelKey: string;
  readonly enabled: boolean;
  /** Why it is disabled. Required whenever `enabled` is false. */
  readonly disabledReasonKey?: string;
  readonly run: () => void;
}

interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly commands: readonly PaletteCommand[];
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const t = useTranslations("automationStudio");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return commands;
    if (needle.length > 128) return [];
    return commands.filter((c) => t(c.labelKey).toLowerCase().includes(needle));
  }, [commands, query, t]);

  if (!open) return null;

  const activate = (index: number) => {
    const command = results[index];
    if (!command || !command.enabled) return;
    command.run();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title")}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-white/15 bg-[#0b1220] shadow-2xl"
      >
        <div className="border-b border-white/10 p-2">
          <label htmlFor="studio-palette-input" className="sr-only">{t("palette.inputLabel")}</label>
          <input
            ref={inputRef}
            id="studio-palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="studio-palette-list"
            aria-activedescendant={results[active] ? `studio-palette-option-${results[active].id}` : undefined}
            autoComplete="off"
            maxLength={128}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); onClose(); }
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
              if (e.key === "Enter") { e.preventDefault(); activate(active); }
            }}
            placeholder={t("palette.placeholder")}
            className={cn("w-full rounded bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-white/35", FOCUS_RING)}
          />
        </div>

        {results.length === 0 ? (
          <p className="p-4 text-sm text-white/50">{t("palette.noResults")}</p>
        ) : (
          <ul id="studio-palette-list" role="listbox" aria-label={t("palette.listLabel")} className="max-h-72 overflow-y-auto p-1">
            {results.map((command, index) => (
              <li key={command.id} role="none">
                <button
                  type="button"
                  role="option"
                  id={`studio-palette-option-${command.id}`}
                  aria-selected={index === active}
                  aria-disabled={!command.enabled}
                  disabled={!command.enabled}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => activate(index)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded px-3 py-1.5 text-start text-sm",
                    index === active && command.enabled ? "bg-white/[0.1] text-white" : "text-white/75",
                    !command.enabled && "cursor-not-allowed text-white/35",
                    FOCUS_RING,
                  )}
                >
                  <span>{t(command.labelKey)}</span>
                  {!command.enabled && command.disabledReasonKey && (
                    <span className="text-[11px] text-white/35">{t(command.disabledReasonKey)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-white/10 px-3 py-1.5 text-end">
          <button
            type="button"
            onClick={onClose}
            className={cn("rounded px-2 py-0.5 text-[11px] text-white/50 hover:text-white", FOCUS_RING)}
          >
            {t("palette.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
