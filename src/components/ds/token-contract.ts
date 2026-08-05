/**
 * PHASE 87 — Design Token Contract (versionable, machine-checked).
 *
 * Single source of truth that binds the Figma design file to the code. Each
 * entry ties a Figma semantic-color variable to the CSS custom property in
 * `src/app/globals.css` and the Tailwind key in `tailwind.config.ts`, with its
 * value, usage and measured WCAG contrast.
 *
 * Source of truth (verified live via Talk-to-Figma MCP during Phase 87 closure):
 *   File  : "Hermes OS – Design System"
 *   Frame : "03 — Variables and Tokens"  (node 12:4)
 *   Collection: "Semantic Colors"
 *
 * All but two entries were read directly from frame 12:4. The exceptions are
 * design-system foregrounds that the frame does not label but the code and the
 * committed 87A mapping record define:
 *   - `--color-reasoning-hypothesis` (#8B7CFF, Diagnostic Violet) — recorded in
 *     docs/design/phase-87a/05-figma-token-mapping.md.
 *   - `--color-text-inverse` (#071018) — a derived on-light / on-brand
 *     foreground (the Obsidian value reused as text on cyan/light surfaces).
 *
 * The companion test `__tests__/token-contract.test.ts` asserts that every
 * entry here is defined in globals.css with the exact value AND exposed in
 * Tailwind — so any drift between Figma, the CSS variables and the Tailwind
 * layer fails CI. This is the enforcement point for design-token traceability
 * (Phase 87 non-negotiable rule 16).
 *
 * Values are canonical and dark-theme (the product ships a single dark theme;
 * `text-inverse` / `brand-on-brand` are the on-light/on-brand foregrounds).
 * Do NOT edit a value here without editing the Figma variable in the same
 * change — the contract and the design file move together.
 */

export const FIGMA_SOURCE = {
  file: "Hermes OS – Design System",
  frame: "03 — Variables and Tokens",
  node: "12:4",
  collection: "Semantic Colors",
} as const;

export type TokenGroup =
  | "background"
  | "surface"
  | "brand"
  | "text"
  | "border"
  | "status"
  | "reasoning"
  | "focus";

export interface TokenContractEntry {
  /** Figma variable name in the "Semantic Colors" collection (frame 12:4). */
  figma: string;
  /** CSS custom property in `src/app/globals.css` `:root`. */
  cssVar: string;
  /** Canonical value — hex or rgba(), mirrored 1:1 in the Figma variable. */
  value: string;
  /** Tailwind theme key under `theme.extend.colors`, or null if intentionally not a utility. */
  tailwind: string | null;
  group: TokenGroup;
  /** What the token is for (and what it must NOT be used for). */
  usage: string;
  /** Measured WCAG contrast note, where the token is a foreground / critical color. */
  a11y?: string;
}

export const TOKEN_CONTRACT: readonly TokenContractEntry[] = [
  // ── Background & surface ──────────────────────────────────────────────────
  { figma: "Color/Background/Base", cssVar: "--color-background-base", value: "#071018", tailwind: "background-base", group: "background", usage: "app background — 70% of every screen (Hermes Obsidian)" },
  { figma: "Color/Background/Deep", cssVar: "--color-background-deep", value: "#040A0F", tailwind: "background-deep", group: "background", usage: "engineering void, full-screen canvases (Obsidian Deep)" },
  { figma: "Color/Surface/Primary", cssVar: "--color-surface-primary", value: "#0C1720", tailwind: "surface-primary", group: "surface", usage: "default cards, panels, table containers (E1)" },
  { figma: "Color/Surface/Elevated", cssVar: "--color-surface-elevated", value: "#11212C", tailwind: "surface-elevated", group: "surface", usage: "raised panels, dropdowns, popovers (E2–E3)" },
  { figma: "Color/Surface/Interactive", cssVar: "--color-surface-interactive", value: "#152A36", tailwind: "surface-interactive", group: "surface", usage: "hover/selected fills, input surfaces (E4)" },
  { figma: "Color/Surface/Glass", cssVar: "--color-surface-glass", value: "rgba(12, 23, 32, 0.78)", tailwind: "surface-glass", group: "surface", usage: "overlays only (modal, toolbar, command) — never opaque panels" },
  { figma: "Color/Surface/Glass (border)", cssVar: "--color-surface-glass-border", value: "rgba(139, 244, 248, 0.10)", tailwind: "surface-glass-border", group: "surface", usage: "1px ice border on glass overlays" },

  // ── Brand ─────────────────────────────────────────────────────────────────
  { figma: "Color/Brand/Primary", cssVar: "--color-brand-primary", value: "#16D9E3", tailwind: "brand-primary", group: "brand", usage: "CTAs, active states, live signal (Hermes Cyan)", a11y: "11.0:1 on Base" },
  { figma: "Color/Brand/Hover", cssVar: "--color-brand-primary-hover", value: "#8BF4F8", tailwind: "brand-primary-hover", group: "brand", usage: "hover on brand elements, focus halo (Hermes Ice)" },
  { figma: "Color/Brand/Pressed", cssVar: "--color-brand-primary-pressed", value: "#0795A5", tailwind: "brand-primary-pressed", group: "brand", usage: "pressed states, cyan on light surfaces (Cyan Deep)" },
  { figma: "Color/Brand/OnBrand", cssVar: "--color-brand-on-brand", value: "#071018", tailwind: "brand-on-brand", group: "brand", usage: "text/icons on cyan fills — white-on-cyan is prohibited", a11y: "dark-on-cyan 11.0:1" },

  // ── Text ──────────────────────────────────────────────────────────────────
  { figma: "Color/Text/Primary", cssVar: "--color-text-primary", value: "#EDF7FA", tailwind: "text-primary", group: "text", usage: "primary text", a11y: "17.6:1 on Base — AAA everywhere" },
  { figma: "Color/Text/Secondary", cssVar: "--color-text-secondary", value: "#A9BAC6", tailwind: "text-secondary", group: "text", usage: "secondary text (Titanium)", a11y: "9.6:1 on Base — AA on all surfaces" },
  { figma: "Color/Text/Muted", cssVar: "--color-text-muted", value: "#708694", tailwind: "text-muted", group: "text", usage: "metadata, captions — NOT body text on Elevated/Interactive" },
  { figma: "Color/Text/Disabled", cssVar: "--color-text-disabled", value: "#495C68", tailwind: "text-disabled", group: "text", usage: "disabled controls only — never for readable content" },
  { figma: "Color/Text/Inverse", cssVar: "--color-text-inverse", value: "#071018", tailwind: "text-inverse", group: "text", usage: "dark text on light / brand surfaces" },

  // ── Border ────────────────────────────────────────────────────────────────
  { figma: "Color/Border/Default", cssVar: "--color-border-default", value: "#203743", tailwind: "border-default", group: "border", usage: "structural separation, non-interactive (decorative, 1.5:1)" },
  { figma: "Color/Border/Active", cssVar: "--color-border-active", value: "#21C9D5", tailwind: "border-active", group: "border", usage: "active/selected component boundaries", a11y: "9.5:1 — passes SC 1.4.11" },

  // ── Status (semantic only, never decorative) ───────────────────────────────
  { figma: "Color/Status/Success", cssVar: "--color-status-success", value: "#38D996", tailwind: "status-success", group: "status", usage: "healthy, verified, safe, connected", a11y: "10.5:1" },
  { figma: "Color/Status/Warning", cssVar: "--color-status-warning", value: "#F5B942", tailwind: "status-warning", group: "status", usage: "warning, incomplete evidence, review required (Industrial Amber)", a11y: "10.9:1" },
  { figma: "Color/Status/Danger", cssVar: "--color-status-danger", value: "#F05D68", tailwind: "status-danger", group: "status", usage: "danger, failed interlock, destructive (Safety Red)", a11y: "5.9:1" },
  { figma: "Color/Status/Information", cssVar: "--color-status-information", value: "#54A6FF", tailwind: "status-information", group: "status", usage: "informational status", a11y: "7.6:1" },

  // ── Reasoning (Industrial Brain semantic layer) ────────────────────────────
  { figma: "Color/Reasoning/Hypothesis", cssVar: "--color-reasoning-hypothesis", value: "#8B7CFF", tailwind: "reasoning-hypothesis", group: "reasoning", usage: "model inference / hypothesis only (Diagnostic Violet)" },
  { figma: "Color/Reasoning/Evidence", cssVar: "--color-reasoning-evidence", value: "#3B82F6", tailwind: "reasoning-evidence", group: "reasoning", usage: "verified evidence, analytics, predictions (Intelligence Azure)" },
  { figma: "Color/Reasoning/Contradiction", cssVar: "--color-reasoning-contradiction", value: "#F05D68", tailwind: "reasoning-contradiction", group: "reasoning", usage: "evidence conflicting with the selected hypothesis" },
  { figma: "Color/Reasoning/Missing", cssVar: "--color-reasoning-missing", value: "#F5B942", tailwind: "reasoning-missing", group: "reasoning", usage: "absent evidence, data gaps — pair with dashed treatment" },
  { figma: "Color/Reasoning/Decision", cssVar: "--color-reasoning-decision", value: "#16D9E3", tailwind: "reasoning-decision", group: "reasoning", usage: "human decision, approved safe action" },

  // ── Focus ──────────────────────────────────────────────────────────────────
  { figma: "Color/Focus/Ring", cssVar: "--color-focus-ring", value: "#16D9E3", tailwind: "focus-ring", group: "focus", usage: "2px outline + 2px offset, :focus-visible only" },
  { figma: "Color/Focus/Halo", cssVar: "--color-focus-halo", value: "#8BF4F8", tailwind: "focus-halo", group: "focus", usage: "1px outer halo — keeps focus visible on cyan-filled elements" },
] as const;
