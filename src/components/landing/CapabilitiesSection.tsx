"use client";

import { useRef }           from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations }  from "next-intl";

function IconBrain() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M12 2C8.5 2 6 4.5 6 7c0 1 .3 2 .8 2.8C5.7 10.4 5 11.6 5 13c0 2.2 1.8 4 4 4h6c2.2 0 4-1.8 4-4 0-1.4-.7-2.6-1.8-3.2.5-.8.8-1.8.8-2.8 0-2.5-2.5-5-6-5z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 2v3M12 17v5M8 9l-2 2M16 9l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconMemory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 6V4M12 6V4M17 6V4M7 18v2M12 18v2M17 18v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 10h18M3 14h18" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
    </svg>
  );
}
function IconGraph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="4" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="20" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="4" cy="19" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="20" cy="19" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6.4 6.4L9.9 9.9M14.1 9.9l3.5-3.5M6.4 17.6l3.5-3.5M14.1 14.1l3.5 3.5"
        stroke="currentColor" strokeWidth="1" opacity="0.6"/>
    </svg>
  );
}
function IconAnalytics() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M4 20V14M8 20V10M12 20V4M16 20V12M20 20V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.25C16.5 22.15 20 17.25 20 12V6L12 2z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconDecision() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="5" cy="18" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="19" cy="18" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 6v6M12 12L5 16M12 12l7 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

const ACCENTS = ["#2DD4BF", "#38BDF8", "#7DD3FC", "#2DD4BF", "#38BDF8", "#7DD3FC"] as const;

const CAPABILITY_KEYS = [
  { key: "agents",   Icon: IconBrain    },
  { key: "memory",   Icon: IconMemory   },
  { key: "graph",    Icon: IconGraph    },
  { key: "domain",   Icon: IconAnalytics},
  { key: "risk",     Icon: IconShield   },
  { key: "decision", Icon: IconDecision },
] as const;

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.09 } },
};
const cardVariants = {
  hidden:  { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" as const } },
};

export function CapabilitiesSection() {
  const t        = useTranslations("landing.capabilities");
  const ref      = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="relative py-24" style={{ background: "#070E1C" }}>
      <div
        className="absolute top-0 inset-x-0 h-px"
        aria-hidden="true"
        style={{ background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.18), transparent)" }}
      />

      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: "easeOut" as const }}
          className="text-center mb-16"
        >
          <p className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: "#2DD4BF" }}>
            {t("eyebrow")}
          </p>
          <h2
            className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "#E8F4FF" }}
          >
            {t("title")}
          </h2>
          <p
            className="max-w-2xl mx-auto font-body"
            style={{ color: "rgba(140,175,210,0.75)", lineHeight: "1.7" }}
          >
            {t("lede")}
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {CAPABILITY_KEYS.map(({ key, Icon }, idx) => {
            const accent = ACCENTS[idx];
            return (
              <motion.div
                key={key}
                variants={cardVariants}
                className="group relative rounded-2xl p-7 overflow-hidden transition-all duration-300 landing-glass landing-glass-hover hs-card-depth"
              >
                {/* Top accent line */}
                <div
                  className="absolute top-0 inset-x-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}
                />
                {/* Left bar */}
                <div
                  className="absolute inset-y-6 start-0 w-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `linear-gradient(180deg, transparent, ${accent}, transparent)` }}
                />

                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-105"
                  style={{
                    background: `${accent}10`,
                    border:     `1px solid ${accent}28`,
                    color:      accent,
                  }}
                >
                  <Icon />
                </div>

                <h3 className="font-display font-semibold text-base mb-3" style={{ color: "#E8F4FF" }}>
                  {t(`${key}.title` as Parameters<typeof t>[0])}
                </h3>
                <p className="font-body text-sm leading-relaxed" style={{ color: "rgba(140,175,210,0.72)" }}>
                  {t(`${key}.desc` as Parameters<typeof t>[0])}
                </p>

                {/* Corner bloom */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at 0% 0%, ${accent}06 0%, transparent 60%)` }}
                />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
