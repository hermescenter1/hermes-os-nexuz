"use client";

import { motion }          from "framer-motion";
import { useTranslations } from "next-intl";
import { Link }            from "@/i18n/navigation";
import HermesNexusVisual   from "@/components/HermesNexusVisual";

// ── Ambient particles ────────────────────────────────────────────────────────
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full animate-l-pulse"
          style={{
            width:  `${1 + (i % 2)}px`,
            height: `${1 + (i % 2)}px`,
            left:   `${(i * 37) % 100}%`,
            top:    `${(i * 53) % 100}%`,
            background: i % 2 === 0
              ? "rgba(0,229,255,0.45)"
              : "rgba(125,211,252,0.30)",
            animationDelay:    `${(i * 0.4) % 5}s`,
            animationDuration: `${4 + (i % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Floating glass status chip ───────────────────────────────────────────────
function StatusChip({
  label, value, live = false, delay = 0, className = "",
}: {
  label: string; value: string; live?: boolean; delay?: number; className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number,number,number,number], delay }}
      className={`absolute flex items-center gap-2 px-3 py-2 rounded-xl pointer-events-none hidden sm:flex ${className}`}
      style={{
        background:     "rgba(5, 8, 18, 0.82)",
        backdropFilter: "blur(20px) saturate(1.3)",
        border:         "1px solid rgba(255,255,255,0.09)",
        boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.07), 0 4px 16px rgba(0,0,0,0.45)",
        zIndex:         2,
      }}
    >
      {live && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: "#00E5FF", animation: "statusDot 2s ease-in-out infinite" }}
        />
      )}
      <div>
        <p
          className="font-mono leading-none"
          style={{ fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(125,211,252,0.55)" }}
        >
          {label}
        </p>
        <p
          className="font-mono font-semibold leading-none mt-0.5"
          style={{ fontSize: "11px", color: "#00E5FF" }}
        >
          {value}
        </p>
      </div>
    </motion.div>
  );
}

// ── Decorative industrial network lines ─────────────────────────────────────
function NetworkLines() {
  return (
    <svg
      viewBox="0 0 540 440"
      fill="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0, opacity: 0.15 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nlg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00E5FF" stopOpacity="0"/>
          <stop offset="50%" stopColor="#00E5FF" stopOpacity="1"/>
          <stop offset="100%" stopColor="#00E5FF" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="nlg2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0"/>
          <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.8"/>
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <line x1="270" y1="220" x2="90"  y2="100" stroke="url(#nlg1)" strokeWidth="0.8"/>
      <line x1="270" y1="220" x2="450" y2="100" stroke="url(#nlg1)" strokeWidth="0.8"/>
      <line x1="270" y1="220" x2="90"  y2="340" stroke="url(#nlg2)" strokeWidth="0.8"/>
      <line x1="270" y1="220" x2="450" y2="340" stroke="url(#nlg2)" strokeWidth="0.8"/>
      <line x1="270" y1="220" x2="270" y2="50"  stroke="url(#nlg1)" strokeWidth="0.8"/>
      <line x1="270" y1="220" x2="270" y2="400" stroke="url(#nlg2)" strokeWidth="0.8"/>
      <line x1="90"  y1="100" x2="450" y2="100" stroke="#00E5FF" strokeWidth="0.5" opacity="0.3"/>
      <line x1="90"  y1="340" x2="450" y2="340" stroke="#38BDF8" strokeWidth="0.5" opacity="0.3"/>
      {([[90,100],[450,100],[90,340],[450,340],[270,50],[270,400]] as [number,number][]).map(([cx,cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="3" fill="#00E5FF" opacity="0.55"/>
      ))}
      <circle cx="270" cy="220" r="5" fill="none" stroke="#00E5FF" strokeWidth="1" opacity="0.7"/>
      <circle cx="270" cy="220" r="2" fill="#00E5FF" opacity="0.9"/>
    </svg>
  );
}

// ── Animation helper ─────────────────────────────────────────────────────────
function fadeUp(delay = 0) {
  return {
    initial:    { opacity: 0, y: 24 },
    animate:    { opacity: 1, y: 0 },
    transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as [number,number,number,number], delay },
  };
}

// ── Hero ─────────────────────────────────────────────────────────────────────
export function HeroSection() {
  const t = useTranslations("landing.hero");

  return (
    <section
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 80% at 75% 50%, rgba(0,60,100,0.22) 0%, rgba(0,30,70,0.10) 40%, transparent 65%)," +
          "radial-gradient(ellipse 55% 60% at 74% 50%, rgba(0,229,255,0.06) 0%, transparent 52%)," +
          "radial-gradient(ellipse 70% 80% at 22% 50%, rgba(0,10,40,0.55) 0%, transparent 68%)," +
          "linear-gradient(135deg, #050816 0%, #061020 50%, #081428 100%)",
      }}
    >
      {/* Depth layers */}
      <div className="absolute inset-0 landing-grid opacity-30"  aria-hidden="true" />
      <div className="absolute inset-0 landing-scanlines"        aria-hidden="true" />
      <Particles />

      {/* Ambient glow orbs */}
      <div
        className="absolute top-1/4 right-1/4 w-[600px] h-[600px] rounded-full pointer-events-none"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, rgba(0,229,255,0.055) 0%, transparent 65%)" }}
      />
      <div
        className="absolute bottom-1/3 left-[10%] w-96 h-96 rounded-full pointer-events-none"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.04) 0%, transparent 70%)" }}
      />

      {/* ── Main layout ── */}
      <div className="relative z-10 flex-1 flex items-center">
        <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-[44%_56%] items-center min-h-[88vh] gap-0">

            {/* ── Text column ── */}
            <div className="flex flex-col justify-center py-24 lg:py-0 lg:pr-6">

              {/* Live badge */}
              <motion.div {...fadeUp(0)} className="mb-8 inline-flex self-start">
                <div
                  className="flex items-center gap-2 px-4 py-2 rounded-full"
                  style={{
                    background:     "rgba(0,229,255,0.06)",
                    border:         "1px solid rgba(0,229,255,0.26)",
                    backdropFilter: "blur(14px)",
                    boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: "#00E5FF", animation: "statusDot 2s ease-in-out infinite" }}
                  />
                  <span className="text-xs font-mono tracking-widest uppercase" style={{ color: "#00E5FF" }}>
                    {t("badge")}
                  </span>
                </div>
              </motion.div>

              {/* Headline */}
              <motion.h1
                {...fadeUp(0.1)}
                className="font-display font-bold leading-none tracking-tight mb-4"
                style={{ fontSize: "clamp(3rem,6.5vw,5.5rem)" }}
              >
                <span
                  style={{
                    background:           "linear-gradient(135deg, #00E5FF 0%, #38BDF8 50%, #7DD3FC 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor:  "transparent",
                    backgroundClip:       "text",
                    filter:               "drop-shadow(0 0 28px rgba(0,229,255,0.30))",
                  }}
                >
                  Hermes
                </span>
                <span style={{ color: "rgba(232,244,255,0.92)" }}> OS</span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                {...fadeUp(0.2)}
                className="font-display font-semibold mb-6"
                style={{ fontSize: "clamp(1rem,2.2vw,1.45rem)", color: "rgba(180,215,240,0.88)" }}
              >
                {t("subtitle")}
              </motion.p>

              {/* Description */}
              <motion.p
                {...fadeUp(0.3)}
                className="font-body leading-relaxed mb-10 max-w-lg"
                style={{ fontSize: "0.97rem", color: "rgba(140,180,215,0.75)", lineHeight: "1.78" }}
              >
                {t("desc")}
              </motion.p>

              {/* CTAs */}
              <motion.div {...fadeUp(0.4)} className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
                <Link
                  href="/platform"
                  className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-mono font-semibold text-sm uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]/50"
                  style={{
                    background: "linear-gradient(135deg, rgba(0,229,255,0.94) 0%, rgba(0,140,220,0.94) 100%)",
                    color:      "#050816",
                    boxShadow:  "0 0 28px rgba(0,229,255,0.32), 0 4px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.22)",
                    transition: "all 220ms cubic-bezier(0.16,1,0.3,1)",
                  }}
                >
                  {t("ctaPrimary")}
                  <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-shrink-0 group-hover:translate-x-0.5 transition-transform">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Link>

                <Link
                  href="/engineering"
                  className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-mono font-semibold text-sm uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]/40"
                  style={{
                    background:     "rgba(255,255,255,0.03)",
                    backdropFilter: "blur(16px) saturate(1.3)",
                    border:         "1px solid rgba(0,229,255,0.22)",
                    color:          "rgba(180,230,255,0.88)",
                    boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.06)",
                    transition:     "all 220ms cubic-bezier(0.16,1,0.3,1)",
                  }}
                >
                  {t("ctaSecondary")}
                  <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-shrink-0 opacity-55 group-hover:opacity-80 transition-opacity">
                    <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                    <rect x="9" y="2" width="5" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                    <rect x="9" y="7" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                    <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                  </svg>
                </Link>
              </motion.div>

              {/* Stats glass row */}
              <motion.div {...fadeUp(0.55)} className="mt-12 max-w-xs">
                <div
                  className="grid grid-cols-3 rounded-2xl overflow-hidden"
                  style={{
                    background:     "rgba(255,255,255,0.03)",
                    backdropFilter: "blur(24px) saturate(1.3)",
                    border:         "1px solid rgba(255,255,255,0.07)",
                    boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 40px rgba(0,229,255,0.04)",
                  }}
                >
                  {([
                    { value: "7",    key: "statAgents"  },
                    { value: "120+", key: "statDomains" },
                    { value: "∞",    key: "statMemory"  },
                  ] as const).map(({ value, key }, i) => (
                    <div
                      key={key}
                      className="text-center px-4 py-4"
                      style={{
                        borderRight: i < 2 ? "1px solid rgba(255,255,255,0.07)" : "none",
                      }}
                    >
                      <p
                        className="metric text-2xl font-bold"
                        style={{ color: "#00E5FF", textShadow: "0 0 18px rgba(0,229,255,0.40)" }}
                      >
                        {value}
                      </p>
                      <p
                        className="font-mono mt-0.5 uppercase tracking-wider"
                        style={{ fontSize: "9px", color: "rgba(140,178,215,0.50)" }}
                      >
                        {t(key)}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* ── Visual column ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] as [number,number,number,number], delay: 0.1 }}
              className="relative w-full h-[480px] lg:h-[740px]"
            >
              {/* Ambient bloom */}
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true">
                <div className="absolute rounded-full" style={{
                  inset: "-8%",
                  background: "radial-gradient(ellipse 60% 60% at 50% 46%, rgba(0,229,255,0.10) 0%, rgba(0,80,160,0.05) 45%, transparent 68%)",
                }} />
              </div>

              {/* Decorative network lines */}
              <NetworkLines />

              {/* Main visual */}
              <div
                className="absolute inset-0"
                style={{
                  zIndex: 1,
                  filter: "drop-shadow(0 0 60px rgba(0,229,255,0.20)) drop-shadow(0 0 24px rgba(0,229,255,0.12))",
                }}
              >
                <HermesNexusVisual />
              </div>

              {/* Floating status chips */}
              <StatusChip label="Intelligence"     value="ACTIVE"   live  delay={0.9} className="top-[8%]    left-[4%]"   />
              <StatusChip label="Risk Engine"      value="NOMINAL" live  delay={1.1} className="top-[8%]    right-[6%]"  />
              <StatusChip label="Assets Monitored" value="2,400+"        delay={1.3} className="bottom-[24%] left-[3%]"  />
              <StatusChip label="Knowledge"        value="SYNCED"  live  delay={1.5} className="bottom-[24%] right-[5%]" />
            </motion.div>

          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 0.6 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-20"
        aria-hidden="true"
      >
        <span
          className="font-mono uppercase"
          style={{ fontSize: "9px", letterSpacing: "0.22em", color: "rgba(0,229,255,0.28)" }}
        >
          scroll
        </span>
        <div
          className="w-[22px] h-[36px] rounded-full border flex items-start justify-center pt-[6px]"
          style={{ borderColor: "rgba(0,229,255,0.18)" }}
        >
          <div
            className="w-[3px] h-[8px] rounded-full"
            style={{ background: "rgba(0,229,255,0.40)", animation: "lFloat 1.8s ease-in-out infinite" }}
          />
        </div>
      </motion.div>

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
        aria-hidden="true"
        style={{ background: "linear-gradient(to bottom, transparent, #050816)" }}
      />
    </section>
  );
}
