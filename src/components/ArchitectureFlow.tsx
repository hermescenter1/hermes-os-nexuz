import { useTranslations } from "next-intl";

// The flow is vertical (top -> bottom), so it reads identically under RTL and
// LTR — only text alignment flips, which is correct. Each layer is a labeled
// band; a downward connector sits between bands.
const LAYERS = [
  { key: "human", accent: false },
  { key: "gateway", accent: true },
  { key: "modules", accent: false },
  { key: "protocol", accent: true },
  { key: "buses", accent: false },
  { key: "factory", accent: false },
] as const;

function Connector() {
  return (
    <div className="flex h-10 items-center justify-center" aria-hidden="true">
      <svg width="24" height="40" viewBox="0 0 24 40" fill="none">
        <line x1="12" y1="0" x2="12" y2="32" stroke="var(--signal-dim)" strokeWidth="2" />
        <path d="M6 26 L12 34 L18 26" stroke="var(--signal)" strokeWidth="2" fill="none" />
      </svg>
    </div>
  );
}

export function ArchitectureFlow() {
  const t = useTranslations("architecture.layers");
  return (
    <div className="mx-auto max-w-2xl">
      {LAYERS.map((layer, i) => (
        <div key={layer.key}>
          <div
            className={[
              "rounded-xl border p-5 text-center",
              layer.accent
                ? "border-signal/40 bg-[#10231d]"
                : "border-line bg-surface",
            ].join(" ")}
          >
            <h3
              className={[
                "font-display text-base font-semibold",
                layer.accent ? "text-signal" : "text-ink",
              ].join(" ")}
            >
              {t(`${layer.key}.name`)}
            </h3>
            <p className="mt-1 font-body text-sm text-muted">
              {t(`${layer.key}.desc`)}
            </p>
          </div>
          {i < LAYERS.length - 1 && <Connector />}
        </div>
      ))}
    </div>
  );
}
