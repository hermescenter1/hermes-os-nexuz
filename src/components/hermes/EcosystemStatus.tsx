"use client";

// Hermes Intelligence Network — five ecosystem layers with live operational state.
// Derives state from PLATFORM_COMPONENTS (static import, always available).
// Each layer represents a distinct capability in the Hermes intelligence stack.

import { useTranslations } from "next-intl";
import { PLATFORM_COMPONENTS, type ComponentState } from "@/lib/industrial/platform-facts";
import { HermesSignal, type HermesSignalType }       from "@/components/hermes/HermesSignal";

// ── Ecosystem layer definitions ───────────────────────────────────────────────
// The order is load-order: reasoning depends on knowledge, knowledge depends on
// memory. Industrial Graph is last because it is the outermost data source.

const LAYERS = [
  {
    key:         "reasoningEngine",
    component:   "brainEngine",
    online:      "reasoning-active"  as HermesSignalType,
    simulated:   "reasoning-active"  as HermesSignalType,
  },
  {
    key:         "knowledgeCloud",
    component:   "knowledgeCloud",
    online:      "knowledge-active"  as HermesSignalType,
    simulated:   "knowledge-active"  as HermesSignalType,
  },
  {
    key:         "memoryEngine",
    component:   "caseEngine",
    online:      "memory-synced"     as HermesSignalType,
    simulated:   "memory-synced"     as HermesSignalType,
  },
  {
    key:         "telemetryNetwork",
    component:   "telemetry",
    online:      "telemetry-active"  as HermesSignalType,
    simulated:   "telemetry-active"  as HermesSignalType,
  },
  {
    key:         "industrialGraph",
    component:   "plcConnectivity",
    online:      "system-online"     as HermesSignalType,
    simulated:   "telemetry-active"  as HermesSignalType,
  },
] as const;

/* PHASE 104 R1 (V-M6) - the layer names, descriptions and state labels used to
   be English literals, so the Persian and German dashboards printed an English
   Intelligence Network panel. They now come from the catalogue. The state
   labels REUSE the keys the Industrial Platform Status card already uses
   (dashboard.exec.status.*, dashboard.status.offline) rather than introducing a
   second wording for the same three states. */
type StateLabels = { online: string; simulated: string; phase2: string; offline: string };

function resolve(
  state: ComponentState | undefined,
  layer: (typeof LAYERS)[number],
  labels: StateLabels,
): { signal: HermesSignalType; label: string; tier: string } {
  switch (state) {
    case "online":    return { signal: layer.online,     label: labels.online,    tier: "eco-layer--active" };
    case "simulated": return { signal: layer.simulated,  label: labels.simulated, tier: "eco-layer--simulated" };
    case "phase2":    return { signal: "warning-active", label: labels.phase2,    tier: "eco-layer--phase2" };
    default:          return { signal: "system-offline", label: labels.offline,   tier: "eco-layer--offline" };
  }
}

// ── EcosystemStatus ───────────────────────────────────────────────────────────
export function EcosystemStatus({ className = "" }: { className?: string }) {
  const t       = useTranslations("dashboard.ecosystem");
  const tStatus = useTranslations("dashboard.exec.status");
  const tState  = useTranslations("dashboard.status");
  const labels: StateLabels = {
    online:    tStatus("online"),
    simulated: tStatus("simulated"),
    phase2:    tStatus("phase2"),
    offline:   tState("offline"),
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {LAYERS.map((layer) => {
        const comp                    = PLATFORM_COMPONENTS.find((c) => c.key === layer.component);
        const { signal, label, tier } = resolve(comp?.state, layer, labels);

        return (
          <div key={layer.key} className={`eco-layer ${tier}`}>
            <HermesSignal type={signal} label={label} />
            <div className="min-w-0">
              <p className="font-body text-xs font-semibold text-ink leading-none">
                {t(`layers.${layer.key}.name`)}
              </p>
              <p
                className="kpi-label leading-snug mt-[3px]"
                style={{ color: "var(--faint)", fontSize: "0.54rem" }}
              >
                {t(`layers.${layer.key}.description`)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
