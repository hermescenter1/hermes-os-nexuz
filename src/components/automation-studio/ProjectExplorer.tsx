"use client";

/**
 * PHASE 109-C1 — the project explorer.
 *
 * A real ARIA `tree` with roving tabindex: exactly one node is tabbable, arrows
 * move between nodes, Left/Right collapse and expand, Home/End jump. That is
 * the pattern engineers expect from a project tree, and it is also the only way
 * this is usable without a mouse.
 *
 * Severity is never carried by colour alone — every badge has a text label in
 * the accessibility tree.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/components/ds/cn";
import { FOCUS_RING } from "@/components/ds/a11y";
import type { DiagnosticFinding, TreeNode } from "@/lib/automation-studio";
import { visibleNodes, worstSeverity } from "@/lib/automation-studio";

interface ProjectExplorerProps {
  readonly tree: readonly TreeNode[];
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly onExpandAll: () => void;
  readonly onCollapseAll: () => void;
  readonly selectedId: string | null;
  readonly onSelect: (node: TreeNode) => void;
  readonly findingsByArtifactId: ReadonlyMap<string, readonly DiagnosticFinding[]>;
  readonly modifiedArtifactIds: ReadonlySet<string>;
}

const KIND_GLYPH: Record<string, string> = {
  folder: "▸",
  "program-block": "ƒ",
  "data-block": "▤",
  udt: "⌗",
  "tag-table": "≡",
  "hmi-screen": "▭",
  "hmi-faceplate": "◧",
  "hmi-alarm": "!",
  "hmi-trend": "∿",
  "scada-area": "▦",
  "scada-historian": "⌸",
  "scada-report": "▥",
  "test-scenario": "✓",
  document: "¶",
};

export function ProjectExplorer({
  tree,
  expanded,
  onToggle,
  onExpandAll,
  onCollapseAll,
  selectedId,
  onSelect,
  findingsByArtifactId,
  modifiedArtifactIds,
}: ProjectExplorerProps) {
  const t = useTranslations("automationStudio");
  const [filter, setFilter] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const treeRef = useRef<HTMLUListElement>(null);

  const rows = useMemo(() => {
    const base = visibleNodes(tree, expanded);
    const needle = filter.trim().toLowerCase();
    if (needle.length === 0) return base;
    if (needle.length > 128) return [];
    // Literal matching, never a compiled pattern.
    return base.filter((n) => n.label.toLowerCase().includes(needle));
  }, [tree, expanded, filter]);

  const activeId = focusedId && rows.some((r) => r.id === focusedId)
    ? focusedId
    : (rows.find((r) => r.id === selectedId)?.id ?? rows[0]?.id ?? null);

  const move = useCallback(
    (delta: number) => {
      const index = rows.findIndex((r) => r.id === activeId);
      const next = rows[Math.min(rows.length - 1, Math.max(0, index + delta))];
      if (next) {
        setFocusedId(next.id);
        treeRef.current
          ?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(next.id)}"]`)
          ?.focus();
      }
    },
    [rows, activeId],
  );

  const onKeyDown = (event: React.KeyboardEvent, node: TreeNode) => {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); move(1); break;
      case "ArrowUp": event.preventDefault(); move(-1); break;
      case "Home": event.preventDefault(); move(-rows.length); break;
      case "End": event.preventDefault(); move(rows.length); break;
      case "ArrowRight":
        if (node.kind === "folder" && !expanded.has(node.id)) {
          event.preventDefault();
          onToggle(node.id);
        }
        break;
      case "ArrowLeft":
        if (node.kind === "folder" && expanded.has(node.id)) {
          event.preventDefault();
          onToggle(node.id);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (node.kind === "folder") onToggle(node.id);
        else onSelect(node);
        break;
      default: break;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/70">
          {t("explorer.title")}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onExpandAll}
            aria-label={t("explorer.expandAll")}
            className={cn("rounded px-1.5 py-0.5 text-xs text-white/60 hover:bg-white/10 hover:text-white", FOCUS_RING)}
          >
            <span aria-hidden="true">⊞</span>
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            aria-label={t("explorer.collapseAll")}
            className={cn("rounded px-1.5 py-0.5 text-xs text-white/60 hover:bg-white/10 hover:text-white", FOCUS_RING)}
          >
            <span aria-hidden="true">⊟</span>
          </button>
        </div>
      </div>

      <div className="px-3 py-2">
        <label htmlFor="studio-explorer-filter" className="sr-only">
          {t("explorer.filterLabel")}
        </label>
        <input
          id="studio-explorer-filter"
          type="text"
          value={filter}
          maxLength={128}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("explorer.filterPlaceholder")}
          className={cn(
            "w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm text-white",
            "placeholder:text-white/35",
            FOCUS_RING,
          )}
        />
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-white/50">{t("explorer.noMatches")}</p>
      ) : (
        <ul
          ref={treeRef}
          role="tree"
          aria-label={t("explorer.treeLabel")}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-3"
        >
          {rows.map((node) => {
            const findings = node.artifact ? findingsByArtifactId.get(node.artifact.id) : undefined;
            const severity = worstSeverity(findings);
            const isSelected = node.kind === "artifact" && node.artifact?.id === selectedId;
            const isModified = node.artifact ? modifiedArtifactIds.has(node.artifact.id) : false;
            const glyph = node.kind === "folder"
              ? (expanded.has(node.id) ? "▾" : "▸")
              : (KIND_GLYPH[node.artifact?.kind ?? ""] ?? "•");

            return (
              <li key={node.id} role="none">
                <div
                  role="treeitem"
                  data-node-id={node.id}
                  /*
                    Artifact-scoped, machine-readable modified state. A harness
                    that looked for a bullet or an asterisk anywhere in the tree
                    would match a folder glyph, a severity badge, or any future
                    decoration, and would report "modified" for an artifact
                    nobody touched. These two attributes name WHICH artifact and
                    say plainly whether it changed.
                  */
                  data-artifact-id={node.artifact?.id}
                  data-artifact-modified={node.artifact ? String(isModified) : undefined}
                  aria-level={node.depth + 1}
                  aria-selected={isSelected}
                  aria-expanded={node.kind === "folder" ? expanded.has(node.id) : undefined}
                  tabIndex={node.id === activeId ? 0 : -1}
                  onFocus={() => setFocusedId(node.id)}
                  onKeyDown={(e) => onKeyDown(e, node)}
                  onClick={() => (node.kind === "folder" ? onToggle(node.id) : onSelect(node))}
                  style={{ paddingInlineStart: `${node.depth * 0.85 + 0.4}rem` }}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-[3px] text-sm",
                    "hover:bg-white/[0.06]",
                    isSelected ? "bg-cyan-400/15 text-white" : "text-white/80",
                    FOCUS_RING,
                  )}
                >
                  <span aria-hidden="true" className="w-3 shrink-0 text-center text-[11px] text-white/50">
                    {glyph}
                  </span>
                  <span className="truncate" dir="ltr">{node.label}</span>

                  {isModified && (
                    <span className="ms-auto shrink-0 rounded bg-amber-400/15 px-1 text-[10px] text-amber-200">
                      {t("explorer.modified")}
                    </span>
                  )}
                  {severity && (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1 text-[10px]",
                        isModified ? "ms-1" : "ms-auto",
                        severity === "error" ? "bg-rose-500/20 text-rose-200" : "bg-amber-400/15 text-amber-200",
                      )}
                    >
                      {/* Text, not colour: the severity is readable and announced. */}
                      {t(`severity.${severity}`)} {findings?.length}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
