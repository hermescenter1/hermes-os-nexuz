/**
 * Hermes Design System (PHASE 87B) — canonical UI primitives.
 *
 * Built on the additive `--color-*` / `--radius-*` / `--shadow-e*` / `--motion-*`
 * tokens in `src/app/globals.css` and their Tailwind mappings. This namespace is
 * separate from the legacy `@/components/ui/*` set, which is left untouched for
 * its existing consumers.
 *
 * Import:  import { Button, Card, Badge } from "@/components/ds";
 */

// ── Foundations ──
export { cn, type ClassValue } from "./cn";
export { FOCUS_RING, VisuallyHidden, describedBy } from "./a11y";
export { directionForLocale, isRtl, useDirection, type Direction } from "./direction";
export { TechnicalValue, type TechnicalValueProps } from "./TechnicalValue";
export { Spinner } from "./Spinner";

// ── Actions ──
export { Button, buttonVariants, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export { IconButton, type IconButtonProps, type IconButtonSize } from "./IconButton";

// ── Forms ──
export { Input, type InputProps } from "./Input";
export { Textarea, type TextareaProps } from "./Textarea";
export { FormField, fieldIds, type FormFieldProps } from "./FormField";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { Radio, type RadioProps } from "./Radio";
export { Switch, type SwitchProps } from "./Switch";

// ── Status & data display ──
export { Badge, badgeVariants, type BadgeProps, type BadgeVariant } from "./Badge";
export { StatusIndicator, statusDotClass, type StatusIndicatorProps, type StatusKind } from "./StatusIndicator";
export { Card, cardVariants, type CardProps, type CardVariant } from "./Card";
export { KpiCard, type KpiCardProps, type KpiDelta } from "./KpiCard";
export { InsightCard, type InsightCardProps } from "./InsightCard";
export { Alert, alertVariants, alertRole, type AlertProps, type AlertVariant } from "./Alert";
export { Skeleton, type SkeletonProps, type SkeletonShape } from "./Skeleton";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { ErrorState, type ErrorStateProps } from "./ErrorState";

// ── Navigation & overlays ──
export { Tabs, type TabsProps, type TabItem } from "./Tabs";
export { Tooltip, type TooltipProps } from "./Tooltip";
export { Dialog, type DialogProps, type DialogSize } from "./Dialog";
export { Drawer, type DrawerProps, type DrawerSide } from "./Drawer";
