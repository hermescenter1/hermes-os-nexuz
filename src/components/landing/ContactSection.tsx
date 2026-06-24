"use client";

import { useRef }           from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations }  from "next-intl";

const CONTACT_CARDS = [
  {
    key:   "demo",
    color: "#2DD4BF",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M15 10l4.5-4.5M15 10h4M15 10v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M9 13l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key:   "sales",
    color: "#38BDF8",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M2 10h20M8 10v8M16 10v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      </svg>
    ),
  },
  {
    key:   "partner",
    color: "#0EA5E9",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M17 12h3M4 12h3M12 4v3M12 17v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="20" cy="12" r="2" stroke="currentColor" strokeWidth="1.3" opacity="0.7"/>
        <circle cx="4"  cy="12" r="2" stroke="currentColor" strokeWidth="1.3" opacity="0.7"/>
        <circle cx="12" cy="4"  r="2" stroke="currentColor" strokeWidth="1.3" opacity="0.7"/>
        <circle cx="12" cy="20" r="2" stroke="currentColor" strokeWidth="1.3" opacity="0.7"/>
      </svg>
    ),
  },
] as const;

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const cardVariants = {
  hidden:  { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" as const } },
};

export function ContactSection() {
  const t        = useTranslations("landing.contact");
  const ref      = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="relative py-24 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #050816 0%, #070E1C 100%)" }}>
      <div className="absolute top-0 inset-x-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.15), transparent)" }} />

      {/* Background radial glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px]"
          style={{ background: "radial-gradient(ellipse, rgba(0,184,255,0.04) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-6xl mx-auto px-6">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <p className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: "#2DD4BF" }}>
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
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {CONTACT_CARDS.map(({ key, color, icon }) => (
            <motion.div key={key} variants={cardVariants}
              className="group relative rounded-2xl p-8 landing-glass landing-glass-hover transition-all duration-300 overflow-hidden"
            >
              {/* Top accent */}
              <div className="absolute top-0 inset-x-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />

              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110"
                style={{ background: `${color}0D`, border: `1px solid ${color}25`, color }}
              >
                {icon}
              </div>

              <h3 className="font-display font-semibold text-lg mb-3" style={{ color: "#E8F4FF" }}>
                {t(`${key}Title` as Parameters<typeof t>[0])}
              </h3>
              <p className="font-body text-sm leading-relaxed mb-6" style={{ color: "rgba(140,175,210,0.7)" }}>
                {t(`${key}Desc` as Parameters<typeof t>[0])}
              </p>

              <button
                className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all duration-200"
                style={{
                  background: `${color}10`,
                  border: `1px solid ${color}25`,
                  color,
                }}
                onClick={() => {
                  const emailMap: Record<string, string> = {
                    demo:    "mailto:hermesnovinmehriric@gmail.com?subject=Demo Request",
                    sales:   "mailto:hermesnovinmehriric@gmail.com?subject=Sales Inquiry",
                    partner: "mailto:hermesnovinmehriric@gmail.com?subject=Partnership Inquiry",
                  };
                  window.location.href = emailMap[key] ?? "#";
                }}
              >
                {t(`${key}Btn` as Parameters<typeof t>[0])}
                <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 0% 100%, ${color}05 0%, transparent 60%)` }} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
