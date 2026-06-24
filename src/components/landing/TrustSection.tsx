"use client";

import { useRef }           from "react";
import { motion, useInView } from "framer-motion";

// ── Icons ────────────────────────────────────────────────────────────────────
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.25C16.5 22.15 20 17.25 20 12V6L12 2z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconFactory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <rect x="2" y="7" width="6" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="3" width="6" height="14" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="16" y="9" width="6" height="8"  rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 20h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconNetwork() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <circle cx="5"  cy="12" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="19" cy="6"  r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="19" cy="18" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 12h5M14 8l3-2M14 16l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 12V7M12 12v5"           stroke="currentColor" strokeWidth="1.3" opacity="0.45"/>
    </svg>
  );
}
function IconGraph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="4"  cy="6"  r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="20" cy="6"  r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="4"  cy="18" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="20" cy="18" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 7.5l4.5 3.5M17.5 7.5 13 11M6 16.5l4.5-3.5M17.5 16.5 13 13"
        stroke="currentColor" strokeWidth="1" opacity="0.55" strokeLinecap="round"/>
    </svg>
  );
}
function IconCopilot() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M12 2C8.5 2 6 4.5 6 7c0 1 .3 2 .8 2.8C5.7 10.4 5 11.6 5 13c0 2.2 1.8 4 4 4h6c2.2 0 4-1.8 4-4 0-1.4-.7-2.6-1.8-3.2C19.7 9 20 8 20 7c0-2.5-4-5-8-5z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 17v5M9 20h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────
const TRUST_ITEMS = [
  {
    Icon:   IconShield,
    label:  "Secure by Design",
    desc:   "Zero-trust architecture with end-to-end encryption at rest and in transit. Built to meet industrial cybersecurity standards.",
    accent: "#2DD4BF",
  },
  {
    Icon:   IconFactory,
    label:  "Industrial-Grade Architecture",
    desc:   "Engineered for OT/IT convergence. Native support for PLC, SCADA, HMI, OPC-UA, MQTT, and Modbus protocols.",
    accent: "#CBD5E1",
  },
  {
    Icon:   IconNetwork,
    label:  "Multi-Site Intelligence",
    desc:   "Unified platform for geographically distributed industrial networks. Centralize telemetry, alerts, and predictive analytics.",
    accent: "#7DD3FC",
  },
  {
    Icon:   IconGraph,
    label:  "Knowledge Graph",
    desc:   "Persistent semantic memory that grows with your operation. Every asset, procedure, and incident permanently encoded.",
    accent: "#2DD4BF",
  },
  {
    Icon:   IconCopilot,
    label:  "Copilot V2",
    desc:   "AI assistant trained on industrial engineering workflows. Context-aware answers, automated maintenance recommendations, and predictive insights.",
    accent: "#38BDF8",
  },
] as const;

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.09 } },
};
const cardVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" as const } },
};

// ── Card ─────────────────────────────────────────────────────────────────────
function TrustCard({ item }: { item: typeof TRUST_ITEMS[number] }) {
  const { Icon, label, desc, accent } = item;
  return (
    <motion.div
      variants={cardVariants}
      className="group relative rounded-2xl p-7 overflow-hidden transition-all duration-300 landing-glass landing-glass-hover"
    >
      {/* Top accent */}
      <div
        className="absolute top-0 inset-x-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}
      />
      {/* Left bar */}
      <div
        className="absolute inset-y-6 start-0 w-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(180deg, transparent, ${accent}, transparent)` }}
      />

      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-105"
        style={{
          background: `${accent}10`,
          border:     `1px solid ${accent}28`,
          color:      accent,
        }}
      >
        <Icon />
      </div>

      <h3 className="font-display font-semibold text-base mb-3" style={{ color: "#E8F4FF" }}>
        {label}
      </h3>
      <p className="font-body text-sm leading-relaxed" style={{ color: "rgba(140,175,210,0.70)" }}>
        {desc}
      </p>

      {/* Corner bloom */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 0% 0%, ${accent}06 0%, transparent 60%)` }}
      />
    </motion.div>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────
export function TrustSection() {
  const ref      = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      ref={ref}
      className="relative py-24 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #070E1C 0%, #050816 100%)" }}
    >
      {/* Dividers */}
      <div
        className="absolute top-0 inset-x-0 h-px"
        aria-hidden="true"
        style={{ background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.16), transparent)" }}
      />
      <div
        className="absolute bottom-0 inset-x-0 h-px"
        aria-hidden="true"
        style={{ background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.08), transparent)" }}
      />

      {/* Ambient bloom */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
        aria-hidden="true"
        style={{ background: "radial-gradient(ellipse, rgba(45,212,191,0.04) 0%, transparent 65%)" }}
      />

      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: "easeOut" as const }}
          className="text-center mb-16"
        >
          <p className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: "#2DD4BF" }}>
            Enterprise Foundation
          </p>
          <h2
            className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "#E8F4FF" }}
          >
            Built for Industrial Trust
          </h2>
          <p
            className="max-w-2xl mx-auto font-body"
            style={{ color: "rgba(140,175,210,0.75)", lineHeight: "1.7" }}
          >
            Enterprise-grade security, reliability, and intelligence — designed for the demands of critical industrial infrastructure.
          </p>
        </motion.div>

        {/* 3 + 2 grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5"
        >
          {TRUST_ITEMS.slice(0, 3).map(item => <TrustCard key={item.label} item={item} />)}
        </motion.div>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:w-2/3 lg:mx-auto"
        >
          {TRUST_ITEMS.slice(3).map(item => <TrustCard key={item.label} item={item} />)}
        </motion.div>
      </div>
    </section>
  );
}
