"use client";

// Hermes Intelligence Network — five ecosystem layers with live operational state.
// Derives state from PLATFORM_COMPONENTS (static import, always available).
// Each layer represents a distinct capability in the Hermes intelligence stack.

import { PLATFORM_COMPONENTS, type ComponentState } from "@/lib/industrial/platform-facts";
import { HermesSignal, type HermesSignalType }       from "@/components/hermes/HermesSignal";

// ── Ecosystem layer definitions ───────────────────────────────────────────────
// The order is load-order: reasoning depends on knowledge, knowledge depends on
// memory. Industrial Graph is last because it is the outermost data source.

const LAYERS = [
  {
    key:         "reasoningEngine",
    name:        "Reasoning Engine",
    description: "Active inference · Root cause analysis · Fault detection",
    component:   "brainEngine",
    online:      "reasoning-active"  as HermesSignalType,
    simulated:   "reasoning-active"  as HermesSignalType,
  },
  {
    key:         "knowledgeCloud",
    name:        "Knowledge Cloud",
    description: "Engineering library · Domain expertise · Case repository",
    component:   "knowledgeCloud",
    online:      "knowledge-active"  as HermesSignalType,
    simulated:   "knowledge-active"  as HermesSignalType,
  },
  {
    key:         "memoryEngine",
    name:        "Memory Engine",
    description: "Case intelligence · Historical patterns · Retention layer",
    component:   "caseEngine",
    online:      "memory-synced"     as HermesSignalType,
    simulated:   "memory-synced"     as HermesSignalType,
  },
  {
    key:         "telemetryNetwork",
    name:        "Telemetry Network",
    description: "Industrial sensors · OT data streams · Live signal",
    component:   "telemetry",
    online:      "telemetry-active"  as HermesSignalType,
    simulated:   "telemetry-active"  as HermesSignalType,
  },
  {
    key:         "industrialGraph",
    name:        "Industrial Graph",
    description: "PLC connectivity · Asset topology · Field device registry",
    component:   "plcConnectivity",
    online:      "system-online"     as HermesSignalType,
    simulated:   "telemetry-active"  as HermesSignalType,
  },
] as const;

// ── State resolution ──────────────────────────────────────────────────────────
function resolve(
  state: ComponentState | undefined,
  layer: typeof LAYERS[number],
): { signal: HermesSignalType; label: string; tier: string } {
  switch (state) {
    case "online":    return { signal: layer.online,    label: "Online",    tier: "eco-layer--active" };
    case "simulated": return { signal: layer.simulated, label: "Simulated", tier: "eco-layer--simulated" };
    case "phase2":    return { signal: "warning-active",label: "Phase 2",   tier: "eco-layer--phase2" };
    default:          return { signal: "system-offline",label: "Offline",   tier: "eco-layer--offline" };
  }
}

// ── EcosystemStatus ───────────────────────────────────────────────────────────
export function EcosystemStatus({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {LAYERS.map((layer) => {
        const comp                = PLATFORM_COMPONENTS.find((c) => c.key === layer.component);
        const { signal, label, tier } = resolve(comp?.state, layer);

        return (
          <div key={layer.key} className={`eco-layer ${tier}`}>
            <HermesSignal type={signal} label={label} />
            <div className="min-w-0">
              <p className="font-body text-xs font-semibold text-ink leading-none">
                Hermes {layer.name}
              </p>
              <p
                className="kpi-label leading-snug mt-[3px]"
                style={{ color: "var(--faint)", fontSize: "0.54rem" }}
              >
                {layer.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
