"use client";

import { useRef }           from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations }  from "next-intl";
import { Link }             from "@/i18n/navigation";

function OrbitRing({ radius, delay }: { radius: number; delay: number }) {
  return (
    <div
      className="absolute rounded-full border"
      style={{
        width: radius * 2, height: radius * 2,
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        borderColor: "rgba(0,229,255,0.05)",
      }}
    >
      <div
        className="absolute w-1.5 h-1.5 rounded-full animate-l-orbit"
        style={{
          background:      "#00E5FF",
          top: "50%", left: "50%",
          marginTop:       "-3px",
          marginLeft:      `-${radius}px`,
          transformOrigin: `${radius}px 3px`,
          animationDelay:  `${delay}s`,
          animationDuration:`${15 + delay * 2}s`,
          boxShadow:       "0 0 8px rgba(0,229,255,0.55)",
          opacity:         0.55,
        }}
      />
    </div>
  );
}

export function CTASection() {
  const t        = useTranslations("landing.cta");
  const ref      = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section
      ref={ref}
      className="relative py-32 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 100% 70% at 50% 50%, rgba(0,40,80,0.5) 0%, transparent 70%)," +
          "linear-gradient(180deg, #070E1C 0%, #050816 100%)",
      }}
    >
      {/* Orbit rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <OrbitRing radius={160} delay={0} />
        <OrbitRing radius={240} delay={4} />
        <OrbitRing radius={320} delay={8} />
      </div>

      {/* Top/bottom dividers */}
      <div
        className="absolute top-0 inset-x-0 h-px"
        aria-hidden="true"
        style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.18), transparent)" }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">

        {/* Glass panel wrapper */}
        <div
          className="relative rounded-3xl overflow-hidden px-8 py-14 sm:px-16"
          style={{
            background:     "rgba(255,255,255,0.03)",
            backdropFilter: "blur(40px) saturate(1.4)",
            border:         "1px solid rgba(255,255,255,0.07)",
            boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 80px rgba(0,229,255,0.05)",
          }}
        >
          {/* Panel top accent */}
          <div
            className="absolute top-0 inset-x-0 h-px"
            aria-hidden="true"
            style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.28), transparent)" }}
          />

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-flex"
          >
            <span
              className="font-mono text-xs px-4 py-2 rounded-full"
              style={{
                background:    "rgba(0,184,255,0.07)",
                border:        "1px solid rgba(0,184,255,0.22)",
                color:         "#00B8FF",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                boxShadow:     "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              {t("badge")}
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display font-bold mb-6 leading-tight"
            style={{ fontSize: "clamp(2rem,5vw,3.5rem)", color: "#E8F4FF" }}
          >
            {t("title")}<br />
            <span
              style={{
                background:           "linear-gradient(135deg, #00E5FF 0%, #38BDF8 60%, #7DD3FC 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor:  "transparent",
                backgroundClip:       "text",
              }}
            >
              {t("titleAccent")}
            </span>
          </motion.h2>

          {/* Lede */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="font-body text-lg mb-12 max-w-2xl mx-auto"
            style={{ color: "rgba(140,175,210,0.75)", lineHeight: "1.7" }}
          >
            {t("lede")}
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap gap-4 justify-center"
          >
            <Link
              href="/engineering"
              className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-xl font-mono font-semibold text-sm uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]/50"
              style={{
                background: "linear-gradient(135deg, rgba(0,229,255,0.94) 0%, rgba(0,140,220,0.94) 100%)",
                color:      "#050816",
                boxShadow:  "0 0 32px rgba(0,229,255,0.35), 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.22)",
                transition: "all 220ms cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              {t("primary")}
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-shrink-0 group-hover:translate-x-0.5 transition-transform">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>

            <Link
              href="/brain"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-mono font-semibold text-sm uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]/40"
              style={{
                background:     "rgba(255,255,255,0.04)",
                backdropFilter: "blur(12px)",
                border:         "1px solid rgba(0,229,255,0.22)",
                color:          "rgba(180,220,255,0.90)",
                boxShadow:      "inset 0 1px 0 rgba(255,255,255,0.06)",
                transition:     "all 220ms cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              {t("secondary")}
            </Link>
          </motion.div>

          {/* Footnote */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-12 font-mono text-xs"
            style={{ color: "rgba(140,175,210,0.32)" }}
          >
            {t("footnote")}
          </motion.p>
        </div>
      </div>
    </section>
  );
}
