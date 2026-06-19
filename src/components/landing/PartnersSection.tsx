"use client";

import { useRef }           from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations }  from "next-intl";

const PARTNERS = [
  {
    name: "Siemens",
    desc: "TIA Portal · S7-1200 · S7-1500 · WinCC",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
        <rect x="6" y="18" width="36" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
        <path d="M14 24h20M14 21h8M26 21h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
        <circle cx="24" cy="24" r="3" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
      </svg>
    ),
    color: "#00A0D1",
  },
  {
    name: "Schneider Electric",
    desc: "EcoStruxure · Modicon M580 · Unity Pro",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
        <path d="M24 6L6 18v24h36V18L24 6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M16 30v-6l8-6 8 6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
      </svg>
    ),
    color: "#3DCD58",
  },
  {
    name: "ABB",
    desc: "AC500 · Automation Builder · DCS 800xA",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
        <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2"/>
        <path d="M16 32l8-16 8 16M19 27h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    color: "#FF000F",
  },
  {
    name: "Rockwell Automation",
    desc: "Studio 5000 · ControlLogix · FactoryTalk",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
        <path d="M8 12h32v4H8zM8 32h32v4H8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" opacity="0.8"/>
        <path d="M16 16v16M24 16v16M32 16v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="24" cy="24" r="4" stroke="currentColor" strokeWidth="1.8" opacity="0.6"/>
      </svg>
    ),
    color: "#E31837",
  },
  {
    name: "Mitsubishi Electric",
    desc: "MELSEC iQ-R · GX Works3 · SCADA",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
        <path d="M24 8L8 18v22h32V18L24 8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M18 32v-8l6-4 6 4v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
      </svg>
    ),
    color: "#E40027",
  },
  {
    name: "Omron",
    desc: "NX/NJ Series · Sysmac Studio · Safety",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
        <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="2"/>
        <circle cx="24" cy="24" r="6"  stroke="currentColor" strokeWidth="1.5" opacity="0.6"/>
        <path d="M24 10v4M24 34v4M10 24h4M34 24h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
    color: "#CC0000",
  },
] as const;

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const cardVariants = {
  hidden:  { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: "easeOut" as const } },
};

export function PartnersSection() {
  const t        = useTranslations("landing.partners");
  const ref      = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="relative py-24 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #050816 0%, #070E1C 100%)" }}>
      <div className="absolute top-0 inset-x-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.12), transparent)" }} />

      <div className="max-w-6xl mx-auto px-6">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <p className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: "#00E5FF" }}>
            {t("eyebrow")}
          </p>
          <h2 className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "#E8F4FF" }}>
            {t("title")}
          </h2>
          <p className="max-w-xl mx-auto font-body" style={{ color: "rgba(140,175,210,0.75)", lineHeight: "1.7" }}>
            {t("lede")}
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
        >
          {PARTNERS.map(({ name, desc, icon, color }) => (
            <motion.div key={name} variants={cardVariants}
              className="group relative rounded-2xl p-5 text-center landing-glass landing-glass-hover transition-all duration-300"
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:scale-110"
                style={{ background: `${color}0A`, border: `1px solid ${color}20`, color }}
              >
                {icon}
              </div>
              <p className="font-display font-semibold text-xs mb-1.5" style={{ color: "#E8F4FF" }}>
                {name}
              </p>
              <p className="font-mono text-[9px] leading-relaxed" style={{ color: "rgba(140,175,210,0.45)" }}>
                {desc}
              </p>
              <div className="absolute inset-x-4 bottom-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${color}30, transparent)` }} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
