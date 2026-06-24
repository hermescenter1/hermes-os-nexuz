"use client";

import { motion }          from "framer-motion";
import { useTranslations } from "next-intl";
import { Link }            from "@/i18n/navigation";
import HermesNexusVisual   from "@/components/HermesNexusVisual";

// ── Ambient particles — reduced, more subtle ─────────────────────────────────
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full animate-l-pulse"
          style={{
            width:  `${1 + (i % 2)}px`,
            height: `${1 + (i % 2)}px`,
            left:   `${(i * 37) % 100}%`,
            top:    `${(i * 53) % 100}%`,
            background: i % 3 === 0
              ? "rgba(45,212,191,0.35)"
              : i % 3 === 1
                ? "rgba(125,211,252,0.22)"
                : "rgba(255,255,255,0.12)",
            animationDelay:    `${(i * 0.4) % 5}s`,
            animationDuration: `${5 + (i % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Floating glass status chip — more restrained ─────────────────────────────
function StatusChip({
  label, value, live = false, delay = 0, className = "",
}: {
  label: string; value: string; live?: boolean; delay?: number; className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number,number,number,number], delay }}
      className={`absolute flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl pointer-events-none hidden sm:flex ${className}`}
      style={{
        background:     "rgba(11, 18, 25, 0.88)",
        backdropFilter: "blur(20px) saturate(1.4)",
        border:         "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.50)",
        zIndex: 2,
      }}
    >
      {live && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-signal"
          style={{ animation: "statusDot 2.5s ease-in-out infinite" }}
        />
      )}
      <div>
        <p
          className="font-mono leading-none"
          style={{
            fontSize: "8px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(148,163,184,0.60)",
          }}
        >
          {label}
        </p>
        <p
          className="font-mono font-semibold leading-none mt-0.5"
          style={{ fontSize: "11px", color: "#CBD5E1" }}
        >
          {value}
        </p>
      </div>
    </motion.div>
  );
}

// ── Decorative network lines ──────────────────────────────────────────────────
function NetworkLines() {
  return (
    <svg
      viewBox="0 0 540 440"
      fill="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0, opacity: 0.10 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nlg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0"/>
          <stop offset="50%" stopColor="#2DD4BF" stopOpacity="1"/>
          <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="nlg2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0"/>
          <stop offset="50%" stopColor="#7DD3FC" stopOpacity="0.7"/>
          <stop offset="100%" stopColor="#7DD3FC" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <line x1="270" y1="220" x2="90"  y2="100" stroke="url(#nlg1)" strokeWidth="0.8"/>
      <line x1="270" y1="220" x2="450" y2="100" stroke="url(#nlg1)" strokeWidth="0.8"/>
      <line x1="270" y1="220" x2="90"  y2="340" stroke="url(#nlg2)" strokeWidth="0.8"/>
      <line x1="270" y1="220" x2="450" y2="340" stroke="url(#nlg2)" strokeWidth="0.8"/>
      <line x1="270" y1="220" x2="270" y2="50"  stroke="url(#nlg1)" strokeWidth="0.8"/>
      <line x1="270" y1="220" x2="270" y2="400" stroke="url(#nlg2)" strokeWidth="0.8"/>
      <line x1="90"  y1="100" x2="450" y2="100" stroke="#2DD4BF" strokeWidth="0.5" opacity="0.25"/>
      <line x1="90"  y1="340" x2="450" y2="340" stroke="#7DD3FC" strokeWidth="0.5" opacity="0.25"/>
      {([[90,100],[450,100],[90,340],[450,340],[270,50],[270,400]] as [number,number][]).map(([cx,cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2.5" fill="#2DD4BF" opacity="0.45"/>
      ))}
      <circle cx="270" cy="220" r="5" fill="none" stroke="#2DD4BF" strokeWidth="1" opacity="0.55"/>
      <circle cx="270" cy="220" r="2" fill="#2DD4BF" opacity="0.80"/>
    </svg>
  );
}

// ── Animation helper ─────────────────────────────────────────────────────────
function fadeUp(delay = 0) {
  return {
    initial:    { opacity: 0, y: 20 },
    animate:    { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number,number,number,number], delay },
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
          "radial-gradient(ellipse 80% 70% at 72% 50%, rgba(0,40,80,0.18) 0%, transparent 65%)," +
          "radial-gradient(ellipse 45% 55% at 72% 50%, rgba(45,212,191,0.04) 0%, transparent 55%)," +
          "radial-gradient(ellipse 65% 75% at 20% 50%, rgba(0,5,20,0.50) 0%, transparent 65%)," +
          "linear-gradient(160deg, #03050A 0%, #060910 55%, #07091A 100%)",
      }}
    >
      {/* Depth layers */}
      <div className="absolute inset-0 landing-grid opacity-25" aria-hidden="true" />
      <div className="absolute inset-0 landing-scanlines"        aria-hidden="true" />
      <Particles />

      {/* Ambient glow — single, restrained */}
      <div
        className="absolute top-1/4 right-1/3 w-[700px] h-[700px] rounded-full pointer-events-none"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, rgba(45,212,191,0.040) 0%, transparent 65%)" }}
      />

      {/* ── Main layout ── */}
      <div className="relative z-10 flex-1 flex items-center">
        <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-[46%_54%] items-center min-h-[88vh] gap-0">

            {/* ── Text column ── */}
            <div className="flex flex-col justify-center py-24 lg:py-0 lg:pr-8">

              {/* Category badge */}
              <motion.div {...fadeUp(0)} className="mb-8 inline-flex self-start">
                <div
                  className="flex items-center gap-2.5 px-4 py-2 rounded-full"
                  style={{
                    background:     "rgba(255,255,255,0.04)",
                    border:         "1px solid rgba(255,255,255,0.10)",
                    backdropFilter: "blur(14px)",
                    boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-signal"
                    style={{ animation: "statusDot 2.5s ease-in-out infinite" }}
                  />
                  <span
                    className="font-mono uppercase"
                    style={{ fontSize: "11px", letterSpacing: "0.12em", color: "rgba(203,213,225,0.75)" }}
                  >
                    {t("badge")}
                  </span>
                </div>
              </motion.div>

              {/* Headline — authority, not neon */}
              <motion.h1
                {...fadeUp(0.08)}
                className="font-display font-extrabold leading-[1.04] tracking-tight mb-5"
                style={{ fontSize: "clamp(3rem,6vw,5.25rem)" }}
              >
                <span
                  style={{
                    background:           "linear-gradient(135deg, #F1F5F9 0%, #CBD5E1 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor:  "transparent",
                    backgroundClip:       "text",
                  }}
                >
                  Hermes
                </span>
                <span
                  style={{
                    background:           "linear-gradient(135deg, #2DD4BF 0%, #7DD3FC 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor:  "transparent",
                    backgroundClip:       "text",
                    marginInlineStart:    "0.3em",
                    filter:               "drop-shadow(0 0 24px rgba(45,212,191,0.20))",
                  }}
                >
                  OS
                </span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                {...fadeUp(0.17)}
                className="font-display font-semibold mb-5 leading-snug"
                style={{
                  fontSize: "clamp(1.05rem,2.2vw,1.5rem)",
                  color:    "rgba(203,213,225,0.85)",
                  letterSpacing: "-0.01em",
                }}
              >
                {t("subtitle")}
              </motion.p>

              {/* Description */}
              <motion.p
                {...fadeUp(0.26)}
                className="font-body leading-relaxed mb-10 max-w-lg"
                style={{ fontSize: "1rem", color: "rgba(148,163,184,0.80)", lineHeight: "1.80" }}
              >
                {t("desc")}
              </motion.p>

              {/* CTAs */}
              <motion.div {...fadeUp(0.34)} className="flex flex-col sm:flex-row flex-wrap gap-3">
                <Link
                  href="/platform"
                  className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-display font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
                  style={{
                    background: "linear-gradient(135deg, #2DD4BF 0%, #0EA5E9 100%)",
                    color:      "#060A0F",
                    boxShadow:  "0 4px 24px rgba(45,212,191,0.28), 0 2px 8px rgba(0,0,0,0.4)",
                    transition: "all 200ms cubic-bezier(0.16,1,0.3,1)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {t("ctaPrimary")}
                  <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-shrink-0 group-hover:translate-x-0.5 transition-transform">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Link>

                <Link
                  href="/engineering"
                  className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-display font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line2"
                  style={{
                    background:     "rgba(255,255,255,0.04)",
                    backdropFilter: "blur(16px) saturate(1.3)",
                    border:         "1px solid rgba(255,255,255,0.10)",
                    color:          "rgba(203,213,225,0.90)",
                    boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.06)",
                    transition:     "all 200ms cubic-bezier(0.16,1,0.3,1)",
                    letterSpacing:  "-0.01em",
                  }}
                >
                  {t("ctaSecondary")}
                  <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-shrink-0 opacity-50 group-hover:opacity-80 transition-opacity">
                    <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                    <rect x="9" y="2" width="5" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                    <rect x="9" y="7" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                    <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                  </svg>
                </Link>
              </motion.div>

              {/* Stats strip */}
              <motion.div {...fadeUp(0.45)} className="mt-12 max-w-xs">
                <div
                  className="grid grid-cols-3 rounded-2xl overflow-hidden"
                  style={{
                    background:     "rgba(255,255,255,0.03)",
                    backdropFilter: "blur(24px) saturate(1.3)",
                    border:         "1px solid rgba(255,255,255,0.07)",
                    boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.05)",
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
                        borderRight: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
                      }}
                    >
                      <p
                        className="metric text-2xl font-bold"
                        style={{ color: "#F1F5F9" }}
                      >
                        {value}
                      </p>
                      <p
                        className="font-mono mt-0.5 uppercase tracking-wider"
                        style={{ fontSize: "9px", color: "rgba(148,163,184,0.50)" }}
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
              initial={{ opacity: 0, scale: 0.93 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] as [number,number,number,number], delay: 0.1 }}
              className="relative w-full h-[480px] lg:h-[740px]"
            >
              {/* Ambient bloom */}
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true">
                <div className="absolute rounded-full" style={{
                  inset: "-8%",
                  background: "radial-gradient(ellipse 55% 55% at 50% 46%, rgba(45,212,191,0.07) 0%, rgba(0,60,120,0.04) 45%, transparent 68%)",
                }} />
              </div>

              <NetworkLines />

              <div
                className="absolute inset-0"
                style={{
                  zIndex: 1,
                  filter: "drop-shadow(0 0 50px rgba(45,212,191,0.14)) drop-shadow(0 0 20px rgba(45,212,191,0.08))",
                }}
              >
                <HermesNexusVisual />
              </div>

              {/* Floating status chips — neutral palette */}
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
        transition={{ delay: 2.0, duration: 0.6 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-20"
        aria-hidden="true"
      >
        <span
          className="font-mono uppercase"
          style={{ fontSize: "9px", letterSpacing: "0.22em", color: "rgba(148,163,184,0.28)" }}
        >
          scroll
        </span>
        <div
          className="w-[22px] h-[36px] rounded-full border flex items-start justify-center pt-[6px]"
          style={{ borderColor: "rgba(255,255,255,0.10)" }}
        >
          <div
            className="w-[3px] h-[8px] rounded-full"
            style={{ background: "rgba(255,255,255,0.25)", animation: "lFloat 1.8s ease-in-out infinite" }}
          />
        </div>
      </motion.div>

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
        aria-hidden="true"
        style={{ background: "linear-gradient(to bottom, transparent, #03050A)" }}
      />
    </section>
  );
}
