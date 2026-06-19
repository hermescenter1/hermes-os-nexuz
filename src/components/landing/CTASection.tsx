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
        borderColor: "rgba(0,229,255,0.06)",
      }}
    >
      <div
        className="absolute w-1.5 h-1.5 rounded-full animate-l-orbit"
        style={{
          background: "#00E5FF",
          top: "50%", left: "50%",
          marginTop: "-3px", marginLeft: `-${radius}px`,
          transformOrigin: `${radius}px 3px`,
          animationDelay: `${delay}s`,
          animationDuration: `${15 + delay * 2}s`,
          boxShadow: "0 0 6px rgba(0,229,255,0.6)",
          opacity: 0.6,
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
    <section ref={ref} className="relative py-32 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 100% 70% at 50% 50%, rgba(0,40,80,0.5) 0%, transparent 70%)," +
          "linear-gradient(180deg, #070E1C 0%, #050816 100%)",
      }}>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <OrbitRing radius={160} delay={0} />
        <OrbitRing radius={240} delay={4} />
        <OrbitRing radius={320} delay={8} />
      </div>
      <div className="absolute top-0 inset-x-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.2), transparent)" }} />

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-8 inline-flex"
        >
          <span className="font-mono text-xs px-4 py-2 rounded-full"
            style={{
              background: "rgba(0,184,255,0.08)",
              border: "1px solid rgba(0,184,255,0.2)",
              color: "#00B8FF",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>
            {t("badge")}
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-display font-bold mb-6 leading-tight"
          style={{ fontSize: "clamp(2rem,5vw,3.5rem)", color: "#E8F4FF" }}
        >
          {t("title")}<br />
          <span style={{ color: "#00E5FF" }}>{t("titleAccent")}</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="font-body text-lg mb-12 max-w-2xl mx-auto"
          style={{ color: "rgba(140,175,210,0.75)", lineHeight: "1.7" }}
        >
          {t("lede")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap gap-4 justify-center"
        >
          <Link
            href="/engineering"
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl font-body font-semibold text-sm transition-all duration-300"
            style={{
              background: "linear-gradient(135deg, #00B8FF 0%, #0055AA 100%)",
              color: "#fff",
              boxShadow: "0 0 32px rgba(0,184,255,0.4), 0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            {t("primary")}
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 group-hover:translate-x-1 transition-transform">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <Link
            href="/brain"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-body font-semibold text-sm transition-all duration-300 landing-glass landing-glass-hover"
            style={{ color: "rgba(180,220,255,0.9)", border: "1px solid rgba(0,229,255,0.2)" }}
          >
            {t("secondary")}
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-12 font-mono text-xs"
          style={{ color: "rgba(140,175,210,0.35)" }}
        >
          {t("footnote")}
        </motion.p>
      </div>
    </section>
  );
}
