/**
 * Phase 50A — Ambient Background.
 * Renders absolutely-positioned radial glow orbs that give the page depth.
 * Pure CSS — no JS animation, no layout impact, pointer-events: none.
 * Respects prefers-reduced-motion (opacity reduced but not removed).
 */

interface AmbientBackgroundProps {
  /** Intensity scale 1-3. Default 1 (subtle). */
  intensity?: 1 | 2 | 3;
}

export function AmbientBackground({ intensity = 1 }: AmbientBackgroundProps) {
  const alpha = intensity === 3 ? 0.12 : intensity === 2 ? 0.08 : 0.05;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {/* Top-left teal bloom */}
      <div
        className="absolute animate-ambient-pulse"
        style={{
          top:    "-15vh",
          left:   "-15vw",
          width:  "70vw",
          height: "70vw",
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(var(--signal-rgb), ${alpha}) 0%, transparent 65%)`,
          animationDelay: "0s",
        }}
      />
      {/* Bottom-right ice bloom */}
      <div
        className="absolute animate-ambient-pulse"
        style={{
          bottom: "-20vh",
          right:  "-20vw",
          width:  "65vw",
          height: "65vw",
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(var(--ice-rgb), ${alpha * 0.7}) 0%, transparent 65%)`,
          animationDelay: "2.5s",
        }}
      />
      {/* Center very faint horizon line */}
      <div
        className="absolute inset-x-0"
        style={{
          top: "45%",
          height: "1px",
          background: `linear-gradient(90deg, transparent, rgba(var(--signal-rgb), ${alpha * 0.4}), transparent)`,
        }}
      />
    </div>
  );
}
