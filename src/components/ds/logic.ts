/**
 * Hermes Design System — pure, JSX-free logic core.
 *
 * Variant → class-string resolvers, id derivation, focus/aria helpers and
 * direction resolution live here (no React, no JSX) so they are directly
 * unit-testable under Vitest's node environment. The `.tsx` components import
 * from this module; tests import from here too.
 */
import { cn } from "./cn";
import { LOCALE_DIRECTION, type Direction, type SupportedLocale } from "@/i18n/locales";

/* ───────────────────────── accessibility ───────────────────────── */

/** Shared keyboard-focus class (backed by `.ds-focus` in globals.css). */
export const FOCUS_RING = "ds-focus";

/** Join ids into an aria-describedby value, or undefined when empty. */
export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const list = ids.filter(Boolean) as string[];
  return list.length ? list.join(" ") : undefined;
}

/* ───────────────────────── directionality ──────────────────────── */

export type { Direction };

/** Text direction for a locale string. Unknown locales default to LTR. */
export function directionForLocale(locale: string): Direction {
  return LOCALE_DIRECTION[locale as SupportedLocale] ?? "ltr";
}

/** True when the locale reads right-to-left. */
export function isRtl(locale: string): boolean {
  return directionForLocale(locale) === "rtl";
}

/* ───────────────────────── FormField ids ───────────────────────── */

export function fieldIds(baseId: string): { controlId: string; descriptionId: string; errorId: string } {
  return { controlId: baseId, descriptionId: `${baseId}-description`, errorId: `${baseId}-error` };
}

/* ───────────────────────────── Button ──────────────────────────── */

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-body font-semibold whitespace-nowrap " +
  "rounded-sm select-none transition-colors duration-standard ease-hermes " +
  FOCUS_RING +
  " disabled:opacity-40 disabled:pointer-events-none";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-primary text-brand-on-brand hover:bg-brand-primary-hover active:bg-brand-primary-pressed",
  secondary:
    "bg-transparent text-text-primary border border-border-default " +
    "hover:border-border-active hover:bg-surface-interactive active:bg-surface-elevated",
  tertiary: "bg-transparent text-brand-primary hover:text-brand-primary-hover underline-offset-4 hover:underline px-1",
  destructive: "bg-status-danger text-text-inverse hover:brightness-110 active:brightness-90",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-label-compact",
  md: "h-9 px-4 text-label",
  lg: "h-11 px-6 text-body", // 44px — meets mobile touch-target minimum
};

export function buttonVariants(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  opts: { fullWidth?: boolean } = {},
): string {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], opts.fullWidth && "w-full");
}

/* ───────────────────────────── Badge ───────────────────────────── */

export type BadgeVariant =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "information"
  | "hypothesis";

const BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-xs border px-2 py-0.5 text-label-compact font-semibold whitespace-nowrap";

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-surface-interactive text-text-secondary border-border-default",
  brand: "bg-brand-subtle text-brand-primary border-brand-border",
  success: "bg-status-success-subtle text-status-success border-status-success-border",
  warning: "bg-status-warning-subtle text-status-warning border-status-warning-border",
  danger: "bg-status-danger-subtle text-status-danger border-status-danger-border",
  information: "bg-status-information-subtle text-status-information border-status-information-border",
  hypothesis: "bg-reasoning-hypothesis-subtle text-reasoning-hypothesis border-reasoning-hypothesis-border",
};

export function badgeVariants(variant: BadgeVariant = "neutral"): string {
  return cn(BADGE_BASE, BADGE_VARIANTS[variant]);
}

/* ────────────────────────────── Card ───────────────────────────── */

export type CardVariant = "standard" | "elevated" | "interactive" | "glass" | "technical";

const CARD_VARIANTS: Record<CardVariant, string> = {
  standard: "bg-surface-primary border border-border-default rounded-md",
  elevated: "bg-surface-elevated border border-border-default rounded-md shadow-e2",
  interactive:
    "bg-surface-primary border border-border-default rounded-md transition-colors duration-standard ease-hermes " +
    "hover:border-border-active hover:bg-surface-elevated cursor-pointer ds-focus",
  glass: "ds-glass rounded-lg shadow-e3",
  technical: "bg-background-deep border border-border-default rounded-md",
};

export function cardVariants(variant: CardVariant = "standard", opts: { padded?: boolean } = {}): string {
  const { padded = true } = opts;
  return cn(CARD_VARIANTS[variant], padded && "p-5");
}

/* ────────────────────────────── Alert ──────────────────────────── */

export type AlertVariant = "success" | "warning" | "danger" | "information" | "neutral";

const ALERT_CONTAINER: Record<AlertVariant, string> = {
  success: "bg-status-success-subtle border-status-success-border",
  warning: "bg-status-warning-subtle border-status-warning-border",
  danger: "bg-status-danger-subtle border-status-danger-border",
  information: "bg-status-information-subtle border-status-information-border",
  neutral: "bg-surface-elevated border-border-default",
};

export const ALERT_ACCENT: Record<AlertVariant, string> = {
  success: "text-status-success",
  warning: "text-status-warning",
  danger: "text-status-danger",
  information: "text-status-information",
  neutral: "text-text-secondary",
};

export const ALERT_DEFAULT_ICON: Record<AlertVariant, string> = {
  success: "✓",
  warning: "⚠",
  danger: "⚠",
  information: "ℹ",
  neutral: "•",
};

export function alertVariants(variant: AlertVariant = "neutral"): string {
  return cn("flex gap-3 rounded-md border p-4", ALERT_CONTAINER[variant]);
}

/** Assertive (alert) for danger/warning; polite (status) otherwise. */
export function alertRole(variant: AlertVariant): "alert" | "status" {
  return variant === "danger" || variant === "warning" ? "alert" : "status";
}

/* ────────────────────────── StatusIndicator ────────────────────── */

export type StatusKind = "success" | "warning" | "danger" | "information" | "neutral";

const STATUS_DOT: Record<StatusKind, string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
  information: "bg-status-information",
  neutral: "bg-text-muted",
};

export function statusDotClass(status: StatusKind): string {
  return STATUS_DOT[status];
}
