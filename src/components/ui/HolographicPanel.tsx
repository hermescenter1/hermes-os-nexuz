import type { ReactNode } from "react";

interface HolographicPanelProps {
  children:   ReactNode;
  className?: string;
  /** Gradient accent color pair: default signal→ice */
  fromColor?: string;
  toColor?:   string;
}

/**
 * Phase 50A — HolographicPanel.
 * Featured panel with gradient-border effect: the outer wrapper carries
 * a 1px gradient "border" via the padding trick — no CSS hacks, no pseudo-elements.
 */
export function HolographicPanel({
  children,
  className = "",
  fromColor = "rgba(56, 224, 176, 0.50)",
  toColor   = "rgba(125, 211, 252, 0.25)",
}: HolographicPanelProps) {
  return (
    /* Gradient border wrapper */
    <div
      className="rounded-2xl p-px"
      style={{
        background: `linear-gradient(135deg, ${fromColor}, ${toColor} 50%, transparent)`,
        boxShadow: "0 0 48px rgba(56, 224, 176, 0.10), 0 16px 64px rgba(0,0,0,0.5)",
      }}
    >
      {/* Inner glass surface */}
      <div
        className={`rounded-[15px] glass overflow-hidden ${className}`}
        style={{
          background: "rgba(13, 19, 25, 0.90)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
