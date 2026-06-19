"use client";

import { useRef }           from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations }  from "next-intl";

const ABOUT_CARDS = [
  {
    key:   "mem",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M12 2a5 5 0 0 1 5 5v1h1a3 3 0 0 1 0 6h-1v1a5 5 0 0 1-10 0v-1H6a3 3 0 0 1 0-6h1V7a5 5 0 0 1 5-5z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 12h6M9 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: "#00E5FF",
  },
  {
    key:   "learn",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
          stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 7v2M12 15v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: "#38BDF8",
  },
  {
    key:   "conn",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <circle cx="5"  cy="12" r="2" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="19" cy="12" r="2" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="12" cy="5"  r="2" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="12" cy="19" r="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M7 12h5M12 7v5M17 12h-5M12 17v-5"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: "#00B8FF",
  },
  {
    key:   "decide",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
    color: "#0EA5E9",
  },
] as const;

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const cardVariants = {
  hidden:  { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

export function AboutSection() {
  const t        = useTranslations("landing.about");
  const ref      = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="relative py-24 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #050816 0%, #070E1C 50%, #050816 100%)" }}>

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full"
          style={{ background: "radial-gradient(ellipse, rgba(0,184,255,0.04) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-6xl mx-auto px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: "#00E5FF" }}>
            {t("eyebrow")}
          </p>
          <h2 className="font-display font-bold mb-6"
            style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "#E8F4FF" }}>
            {t("title")}
          </h2>
          <p className="max-w-2xl mx-auto font-body text-base"
            style={{ color: "rgba(140,175,210,0.8)", lineHeight: "1.8" }}>
            {t("lede")}
          </p>
        </motion.div>

        {/* Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {ABOUT_CARDS.map(({ key, icon, color }) => (
            <motion.div key={key} variants={cardVariants}
              className="group relative rounded-2xl p-6 landing-glass landing-glass-hover transition-all duration-300 text-center"
            >
              {/* Icon ring */}
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 transition-all duration-300 group-hover:scale-110"
                style={{
                  background: `${color}0D`,
                  border: `1px solid ${color}30`,
                  color,
                }}
              >
                {icon}
              </div>
              <h3 className="font-display font-semibold text-base mb-2" style={{ color: "#E8F4FF" }}>
                {t(`${key}Title` as Parameters<typeof t>[0])}
              </h3>
              <p className="font-body text-sm leading-relaxed" style={{ color: "rgba(140,175,210,0.7)" }}>
                {t(`${key}Desc` as Parameters<typeof t>[0])}
              </p>
              {/* Bottom glow on hover */}
              <div className="absolute inset-x-6 bottom-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
