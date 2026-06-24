"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView }            from "framer-motion";
import { useTranslations }              from "next-intl";

interface CounterProps { to: number; suffix?: string; prefix?: string }

function Counter({ to, suffix = "", prefix = "" }: CounterProps) {
  const [count, setCount] = useState(0);
  const ref               = useRef<HTMLSpanElement>(null);
  const isInView          = useInView(ref, { once: true, margin: "-80px" });

  useEffect(() => {
    if (!isInView) return;
    let current = 0;
    const duration = 2200;
    const frames   = (duration / 1000) * 60;
    const inc      = to / frames;
    const timer    = setInterval(() => {
      current += inc;
      if (current >= to) { setCount(to); clearInterval(timer); }
      else               { setCount(Math.floor(current)); }
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [isInView, to]);

  return <span ref={ref} suppressHydrationWarning>{prefix}{count.toLocaleString()}{suffix}</span>;
}

const STATS_META = [
  { value: 2400, suffix: "+", icon: "⊞", key: "projects", accent: "#2DD4BF" },
  { value: 120,  suffix: "+", icon: "◈", key: "domains",  accent: "#7DD3FC" },
  { value: 8500, suffix: "+", icon: "◎", key: "cases",    accent: "#CBD5E1" },
  { value: 7,    suffix: "",  icon: "⊙", key: "agents",   accent: "#2DD4BF" },
] as const;

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.12 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export function StatsSection() {
  const t           = useTranslations("landing.stats");
  const sectionRef  = useRef<HTMLElement>(null);
  const isInView    = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      ref={sectionRef}
      className="relative py-20"
      style={{ background: "linear-gradient(180deg, #050816 0%, #070E1C 50%, #050816 100%)" }}
    >
      <div
        className="absolute top-0 left-1/4 right-1/4 h-px"
        aria-hidden="true"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)" }}
      />

      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {STATS_META.map(stat => (
            <motion.div
              key={stat.key}
              variants={itemVariants}
              className="group relative rounded-2xl p-8 text-center landing-glass landing-glass-hover overflow-hidden"
            >
              {/* Top accent */}
              <div
                className="absolute top-0 inset-x-0 h-px"
                aria-hidden="true"
                style={{ background: `linear-gradient(90deg, transparent, ${stat.accent}45, transparent)` }}
              />

              {/* Hover bloom */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(circle at center, ${stat.accent}07 0%, transparent 70%)` }}
              />

              {/* Icon symbol */}
              <div
                className="text-2xl mb-4 transition-transform duration-300 group-hover:scale-110"
                style={{ color: stat.accent, opacity: 0.45, filter: `drop-shadow(0 0 4px ${stat.accent}60)` }}
              >
                {stat.icon}
              </div>

              {/* Metric */}
              <div
                className="metric text-4xl lg:text-5xl font-bold mb-2"
                style={{ color: stat.accent }}
              >
                <Counter to={stat.value} suffix={stat.suffix} />
              </div>

              <p className="type-eyebrow">{t(stat.key)}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div
        className="absolute bottom-0 left-1/4 right-1/4 h-px"
        aria-hidden="true"
        style={{ background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.15), transparent)" }}
      />
    </section>
  );
}
