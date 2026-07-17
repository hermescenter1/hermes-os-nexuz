// PHASE 87D — /platform layer stack (server component).
//
// Five architecture layers per the approved Figma frames: Core Intelligence
// (visually emphasized with the brand border + "core layer" badge, matching
// the Figma selected state), then Engineering, Operations, Business, and the
// Security · Integration & Edge boundary. Desktop rows use the handoff's
// fixed 260px name column; mobile stacks each row into a card. All module
// names are real Hermes modules (mirrors the app-shell navigation registry).

import { useTranslations } from "next-intl";
import { Badge, cn } from "@/components/ds";

type LayerKey = "intelligence" | "engineering" | "operations" | "business" | "security";

const LAYERS: readonly { key: LayerKey; accent: string; core?: boolean }[] = [
  { key: "intelligence", accent: "text-brand-primary", core: true },
  { key: "engineering",  accent: "text-intelligence-azure" },
  { key: "operations",   accent: "text-status-success" },
  { key: "business",     accent: "text-reasoning-hypothesis" },
  { key: "security",     accent: "text-status-success" },
];

export function PlatformArchitecture({ className }: { className?: string }) {
  const t = useTranslations("publicSite.platform");

  return (
    <ol className={cn("flex flex-col gap-3", className)}>
      {LAYERS.map((layer) => (
        <li
          key={layer.key}
          className={cn(
            "rounded-md border p-5 md:grid md:grid-cols-[260px_minmax(0,1fr)] md:items-baseline md:gap-6",
            layer.core
              ? "border-brand-border bg-surface-interactive shadow-e2"
              : "border-border-default bg-surface-primary",
          )}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className={cn("text-title-lg font-bold", layer.accent)} dir="auto">
              {t(`layers.${layer.key}.name`)}
            </h3>
            {layer.core ? <Badge variant="brand">{t("coreBadge")}</Badge> : null}
          </div>
          <div className="mt-2 md:mt-0">
            <p className="text-body-compact font-medium text-text-primary" dir="auto">
              {t(`layers.${layer.key}.modules`)}
            </p>
            <p className="mt-1 text-body-compact text-text-secondary">
              {t(`layers.${layer.key}.desc`)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
