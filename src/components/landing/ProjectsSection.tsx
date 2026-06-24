"use client";

import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations }  from "next-intl";

const CATEGORIES = ["automation", "electrical", "control", "smart"] as const;

const CATEGORY_ICONS: Record<typeof CATEGORIES[number], React.ReactNode> = {
  automation: (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  electrical: (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <path d="M11 2L4 11h6l-1 7 7-9h-6l1-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  control: (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <rect x="2" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 9h2v2H6M10 9v2M13 9h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  smart: (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <path d="M2 16h16M4 16V9M7 16V5M10 16V7M13 16V11M16 16V4"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

export function ProjectsSection() {
  const t             = useTranslations("landing.projects");
  const ref           = useRef<HTMLElement>(null);
  const isInView      = useInView(ref, { once: true, margin: "-80px" });
  const [active, setActive] = useState<typeof CATEGORIES[number]>("automation");

  return (
    <section ref={ref} className="relative py-24" style={{ background: "#070E1C" }}>
      <div className="absolute top-0 inset-x-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.12), transparent)" }} />

      <div className="max-w-6xl mx-auto px-6">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: "#2DD4BF" }}>
            {t("eyebrow")}
          </p>
          <h2 className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "#E8F4FF" }}>
            {t("title")}
          </h2>
          <p className="max-w-xl mx-auto font-body"
            style={{ color: "rgba(140,175,210,0.75)", lineHeight: "1.7" }}>
            {t("lede")}
          </p>
        </motion.div>

        {/* Category tabs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex flex-wrap justify-center gap-3 mb-12"
        >
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all duration-200"
              style={{
                background:   active === cat ? "rgba(0,184,255,0.12)" : "rgba(255,255,255,0.04)",
                border:       active === cat ? "1px solid rgba(45,212,191,0.35)" : "1px solid rgba(255,255,255,0.08)",
                color:        active === cat ? "#2DD4BF" : "rgba(140,175,210,0.6)",
              }}
            >
              <span style={{ color: active === cat ? "#2DD4BF" : "rgba(140,175,210,0.5)" }}>
                {CATEGORY_ICONS[cat]}
              </span>
              {t(cat)}
            </button>
          ))}
        </motion.div>

        {/* Coming soon placeholder */}
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative rounded-3xl p-16 text-center landing-glass"
          style={{ minHeight: "240px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
        >
          {/* Decorative dots */}
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i}
              className="absolute rounded-full"
              style={{
                width: "4px", height: "4px",
                left: `${10 + (i % 3) * 40}%`,
                top:  `${15 + Math.floor(i / 3) * 35}%`,
                background: "rgba(45,212,191,0.12)",
              }}
            />
          ))}

          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: "rgba(0,184,255,0.06)", border: "1px solid rgba(0,184,255,0.15)" }}>
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8" style={{ color: "#00B8FF" }}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <h3 className="font-display font-bold text-xl mb-3" style={{ color: "#E8F4FF" }}>
            {t("comingSoon")}
          </h3>
          <p className="font-body text-sm max-w-md" style={{ color: "rgba(140,175,210,0.6)", lineHeight: "1.7" }}>
            {t("comingSoonDesc")}
          </p>

          {/* Neon badge */}
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
            style={{ background: "rgba(45,212,191,0.06)", border: "1px solid rgba(45,212,191,0.2)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-l-pulse" style={{ background: "#2DD4BF" }} />
            <span className="font-mono text-xs" style={{ color: "#2DD4BF" }}>
              {t(active)}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
