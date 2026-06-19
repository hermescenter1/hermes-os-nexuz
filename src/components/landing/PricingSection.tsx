"use client";

import { useRef }           from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations }  from "next-intl";

type PlanKey = "community" | "professional" | "team" | "enterprise";

const PLANS: { key: PlanKey; featured: boolean; icon: React.ReactNode }[] = [
  {
    key:      "community",
    featured: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="15" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 20c0-4 2.7-6 6-6M15 14c3.3 0 6 2 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M9 14c1.5-1 3-1 4.5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    key:      "professional",
    featured: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key:      "team",
    featured: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M17 20c0-3-2-5-5-5s-5 2-5 5M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 20c0-2-1.5-3.5-3.5-4M3 20c0-2 1.5-3.5 3.5-4"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="7" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" opacity="0.7"/>
        <circle cx="17" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" opacity="0.7"/>
      </svg>
    ),
  },
  {
    key:      "enterprise",
    featured: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M3 21V9l9-6 9 6v12H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 9v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      </svg>
    ),
  },
];

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const cardVariants = {
  hidden:  { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" as const } },
};

export function PricingSection() {
  const t        = useTranslations("landing.pricing");
  const ref      = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="relative py-24" style={{ background: "#070E1C" }}>
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
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {PLANS.map(({ key, featured, icon }) => (
            <motion.div key={key} variants={cardVariants}
              className="relative rounded-2xl p-6 landing-glass transition-all duration-300 overflow-hidden"
              style={{
                border: featured
                  ? "1px solid rgba(0,229,255,0.3)"
                  : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {featured && (
                <div className="absolute top-0 inset-x-0 h-px"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.6), transparent)" }} />
              )}

              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: featured ? "rgba(0,229,255,0.1)" : "rgba(255,255,255,0.04)",
                    border: featured ? "1px solid rgba(0,229,255,0.25)" : "1px solid rgba(255,255,255,0.08)",
                    color: featured ? "#00E5FF" : "rgba(140,175,210,0.6)",
                  }}>
                  {icon}
                </div>
                <h3 className="font-display font-semibold text-base" style={{ color: "#E8F4FF" }}>
                  {t(key)}
                </h3>
              </div>

              {/* Pricing placeholder */}
              <div className="mb-5">
                <div className="font-display font-bold text-3xl mb-1" style={{ color: featured ? "#00E5FF" : "rgba(140,175,210,0.5)" }}>
                  —
                </div>
                <p className="font-mono text-xs" style={{ color: "rgba(140,175,210,0.4)" }}>
                  {t("free")}
                </p>
              </div>

              {/* Features placeholder */}
              <div className="space-y-2.5 mb-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full flex-none"
                      style={{ background: "rgba(0,184,255,0.08)", border: "1px solid rgba(0,184,255,0.15)" }} />
                    <div className="h-2 rounded-full flex-1"
                      style={{
                        width: `${50 + i * 15}%`,
                        background: "rgba(255,255,255,0.05)",
                      }} />
                  </div>
                ))}
              </div>

              {/* Coming soon button */}
              <button
                disabled
                className="w-full py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all"
                style={{
                  background: featured ? "rgba(0,184,255,0.08)" : "rgba(255,255,255,0.03)",
                  border: featured ? "1px solid rgba(0,229,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                  color: featured ? "#00B8FF" : "rgba(140,175,210,0.4)",
                  cursor: "not-allowed",
                }}
              >
                {t("comingSoon")}
              </button>

              {featured && (
                <div className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(0,229,255,0.04) 0%, transparent 60%)" }} />
              )}
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-center mt-8 font-body text-sm"
          style={{ color: "rgba(140,175,210,0.5)" }}
        >
          {t("comingSoonDesc")}
        </motion.p>
      </div>
    </section>
  );
}
