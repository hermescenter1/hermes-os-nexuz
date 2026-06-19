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
  { value: 2400, suffix: "+", icon: "⊞", key: "projects" },
  { value: 120,  suffix: "+", icon: "◈", key: "domains"  },
  { value: 8500, suffix: "+", icon: "◎", key: "cases"    },
  { value: 7,    suffix: "",  icon: "⊙", key: "agents"   },
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
      <div className="absolute top-0 left-1/4 right-1/4 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.3), transparent)" }} />

      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {STATS_META.map(stat => (
            <motion.div
              key={stat.key}
              variants={itemVariants}
              className="group relative rounded-2xl p-8 text-center landing-glass transition-all duration-300 landing-glass-hover"
            >
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: "radial-gradient(circle at center, rgba(0,184,255,0.06) 0%, transparent 70%)" }} />
              <div className="text-3xl mb-4 opacity-40" style={{ color: "#00E5FF" }}>{stat.icon}</div>
              <div className="metric text-4xl lg:text-5xl font-bold mb-2" style={{ color: "#00E5FF" }}>
                <Counter to={stat.value} suffix={stat.suffix} />
              </div>
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: "rgba(140,175,210,0.7)" }}>
                {t(stat.key)}
              </p>
              <div className="absolute bottom-0 left-1/4 right-1/4 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.3), transparent)" }} />
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-1/4 right-1/4 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.2), transparent)" }} />
    </section>
  );
}
