"use client";

import { useRef }           from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations }  from "next-intl";

const LAYERS = [
  {
    index: 4,
    tKey:  "l4",
    color: "#00E5FF",
    components: ["REST API", "Dashboard UI", "Brain Copilot", "Multi-locale"],
  },
  {
    index: 3,
    tKey:  "l3",
    color: "#00B8FF",
    components: ["Multi-Agent AI", "RAG Pipeline", "Decision Engine", "Confidence Scoring"],
  },
  {
    index: 2,
    tKey:  "l2",
    color: "#38BDF8",
    components: ["Engineering Memory", "Knowledge Graph", "Domain Analytics", "Project Intelligence"],
  },
  {
    index: 1,
    tKey:  "l1",
    color: "#0EA5E9",
    components: ["PostgreSQL / Prisma", "Session Storage", "Vector Index", "Audit Log"],
  },
] as const;

function DataFlow({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: color }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }} />
      ))}
    </div>
  );
}

export function ArchitectureSection() {
  const t        = useTranslations("landing.architecture");
  const ref      = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section ref={ref} className="relative py-24 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #050816 0%, #070E1C 50%, #050816 100%)" }}>
      <div className="max-w-5xl mx-auto px-6">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: "#00E5FF" }}>
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

        <div className="space-y-4">
          {LAYERS.map((layer, i) => (
            <motion.div key={layer.index}
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: i * 0.12 }}
              className="rounded-2xl p-6 landing-glass relative overflow-hidden group transition-all duration-300 landing-glass-hover"
            >
              <div className="absolute inset-y-0 start-0 w-1 rounded-s-2xl"
                style={{ background: `linear-gradient(180deg, ${layer.color}, transparent)` }} />

              <div className="flex flex-wrap items-start gap-6 ps-4">
                <div className="flex-none">
                  <div className="font-mono text-xs uppercase tracking-widest mb-1"
                    style={{ color: "rgba(140,175,210,0.5)" }}>
                    Layer {layer.index}
                  </div>
                  <div className="font-display font-bold text-lg" style={{ color: layer.color }}>
                    {t(`${layer.tKey}label` as Parameters<typeof t>[0])}
                  </div>
                </div>
                <div className="flex-1 flex flex-wrap gap-2 items-center">
                  {layer.components.map(c => (
                    <span key={c} className="font-mono text-[10px] px-2.5 py-1 rounded-lg"
                      style={{
                        background: `${layer.color}10`,
                        border: `1px solid ${layer.color}25`,
                        color: layer.color,
                      }}>
                      {c}
                    </span>
                  ))}
                </div>
                <div className="flex-none flex items-center gap-3">
                  <DataFlow color={layer.color} />
                </div>
              </div>

              <p className="font-body text-sm mt-4 ps-4 leading-relaxed" style={{ color: "rgba(140,175,210,0.65)" }}>
                {t(`${layer.tKey}desc` as Parameters<typeof t>[0])}
              </p>

              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at start 50%, ${layer.color}06 0%, transparent 60%)` }} />
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="text-center mt-8 font-mono text-xs"
          style={{ color: "rgba(140,175,210,0.4)" }}
        >
          {t("note")}
        </motion.p>
      </div>
    </section>
  );
}
