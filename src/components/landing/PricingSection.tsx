"use client";

import { useRef }           from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations }  from "next-intl";
import { Link } from "@/i18n/navigation";

type PlanKey = "community" | "professional" | "team" | "enterprise";

const PLANS: {
  key:          PlanKey;
  featured:     boolean;
  featureCount: number;
  icon:         React.ReactNode;
}[] = [
  {
    key:          "community",
    featured:     false,
    featureCount: 4,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <circle cx="9"  cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="15" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 20c0-4 2.7-6 6-6M15 14c3.3 0 6 2 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M9 14c1.5-1 3-1 4.5 0"                   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    key:          "professional",
    featured:     false,
    featureCount: 5,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key:          "team",
    featured:     true,
    featureCount: 5,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M17 20c0-3-2-5-5-5s-5 2-5 5M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 20c0-2-1.5-3.5-3.5-4M3 20c0-2 1.5-3.5 3.5-4"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="7"  cy="8" r="2" stroke="currentColor" strokeWidth="1.3" opacity="0.7"/>
        <circle cx="17" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" opacity="0.7"/>
      </svg>
    ),
  },
  {
    key:          "enterprise",
    featured:     false,
    featureCount: 5,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M3 21V9l9-6 9 6v12H3z"    stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 21v-6h6v6"              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 9v3"                   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      </svg>
    ),
  },
];

// Cyan checkmark for feature bullets
function Check({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
      <circle
        cx="7" cy="7" r="6"
        stroke={active ? "#2DD4BF" : "rgba(0,184,255,0.35)"}
        strokeWidth="1.2"
      />
      <path
        d="M4.5 7l2 2 3-3"
        stroke={active ? "#2DD4BF" : "rgba(0,184,255,0.35)"}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
      <div
        className="absolute top-0 inset-x-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.12), transparent)" }}
      />

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
          <h2
            className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "#E8F4FF" }}
          >
            {t("title")}
          </h2>
          <p
            className="max-w-xl mx-auto font-body"
            style={{ color: "rgba(140,175,210,0.75)", lineHeight: "1.7" }}
          >
            {t("lede")}
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {PLANS.map(({ key, featured, featureCount, icon }) => {
            const price    = t(`plans.${key}.price`);
            const audience = t(`plans.${key}.audience`);
            const cta      = t(`plans.${key}.cta`);
            const features = Array.from({ length: featureCount }, (_, i) =>
              t(`plans.${key}.f${i}`)
            );
            const isFree        = key === "community";
            const ctaHref       = isFree ? "/auth/register" : "/contact";

            return (
              <motion.div
                key={key}
                variants={cardVariants}
                className="relative rounded-2xl p-6 landing-glass transition-all duration-300 overflow-hidden flex flex-col"
                style={{
                  border: featured
                    ? "1px solid rgba(45,212,191,0.30)"
                    : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {/* Featured top-glow */}
                {featured && (
                  <div
                    className="absolute top-0 inset-x-0 h-px"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.6), transparent)" }}
                  />
                )}

                {/* Plan icon + name */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: featured ? "rgba(45,212,191,0.10)" : "rgba(255,255,255,0.04)",
                      border:     featured ? "1px solid rgba(45,212,191,0.25)" : "1px solid rgba(255,255,255,0.08)",
                      color:      featured ? "#2DD4BF" : "rgba(140,175,210,0.60)",
                    }}
                  >
                    {icon}
                  </div>
                  <h3 className="font-display font-semibold text-base" style={{ color: "#E8F4FF" }}>
                    {t(key)}
                  </h3>
                </div>

                {/* Price */}
                <div className="mb-3">
                  <div
                    className="font-display font-bold text-2xl leading-none mb-1"
                    style={{ color: featured ? "#2DD4BF" : "#E8F4FF" }}
                  >
                    {price}
                  </div>
                  <p
                    className="font-body text-xs leading-snug"
                    style={{ color: "rgba(140,175,210,0.55)" }}
                  >
                    {audience}
                  </p>
                </div>

                {/* Divider */}
                <div className="mb-4 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

                {/* Features */}
                <ul className="space-y-2.5 mb-6 flex-1">
                  {features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check active={featured} />
                      <span
                        className="font-body text-xs leading-snug"
                        style={{ color: "rgba(140,175,210,0.80)" }}
                      >
                        {feat}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={ctaHref}
                  className="mt-auto block w-full rounded-xl py-2.5 text-center font-mono text-xs uppercase tracking-wider transition-all hover:opacity-90"
                  style={{
                    background: featured ? "rgba(0,184,255,0.10)" : "rgba(255,255,255,0.04)",
                    border:     featured ? "1px solid rgba(45,212,191,0.25)" : "1px solid rgba(255,255,255,0.08)",
                    color:      featured ? "#2DD4BF" : "rgba(140,175,210,0.65)",
                  }}
                >
                  {cta}
                </Link>

                {featured && (
                  <div
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(45,212,191,0.04) 0%, transparent 60%)" }}
                  />
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {/* Payment channels disclaimer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="mt-12 flex flex-col items-center gap-4"
        >
          {/* Payment method badges */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Stripe */}
            <span
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <svg viewBox="0 0 28 10" className="h-3.5" aria-hidden="true">
                <text x="0" y="8" fontFamily="sans-serif" fontSize="9" fill="#2DD4BF" opacity="0.85" fontWeight="700">S</text>
                <text x="7" y="8" fontFamily="sans-serif" fontSize="7.5" fill="#8CAFD2" opacity="0.55">tripe</text>
              </svg>
              <span className="font-mono text-xs" style={{ color: "rgba(140,175,210,0.65)" }}>
                {t("paymentStripe")}
              </span>
            </span>
            {/* Visa */}
            <span
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <svg viewBox="0 0 28 10" className="h-3.5" aria-hidden="true">
                <text x="0" y="8.5" fontFamily="sans-serif" fontSize="8" fill="#8CAFD2" fontWeight="900" opacity="0.8">VISA</text>
              </svg>
              <span className="font-mono text-xs" style={{ color: "rgba(140,175,210,0.65)" }}>
                {t("paymentVisa")}
              </span>
            </span>
            {/* Mastercard */}
            <span
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <svg viewBox="0 0 28 16" className="h-4" aria-hidden="true">
                <circle cx="10" cy="8" r="7" fill="#EB001B" opacity="0.75"/>
                <circle cx="18" cy="8" r="7" fill="#F79E1B" opacity="0.75"/>
              </svg>
              <span className="font-mono text-xs" style={{ color: "rgba(140,175,210,0.65)" }}>
                {t("paymentMastercard")}
              </span>
            </span>
            {/* Zarinpal */}
            <span
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <svg viewBox="0 0 16 16" className="h-4" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" fill="none" stroke="#2DD4BF" strokeWidth="1.4" opacity="0.65"/>
                <text x="4.5" y="11.5" fontFamily="sans-serif" fontSize="7" fill="#2DD4BF" opacity="0.85" fontWeight="700">Z</text>
              </svg>
              <span className="font-mono text-xs" style={{ color: "rgba(140,175,210,0.65)" }}>
                {t("paymentZarinpal")}
              </span>
            </span>
          </div>

          {/* Disclaimer — NOT implying instant payment works */}
          <p
            className="font-body text-xs text-center max-w-sm"
            style={{ color: "rgba(140,175,210,0.35)", lineHeight: "1.6" }}
          >
            {t("paymentTitle")}
          </p>
        </motion.div>

      </div>
    </section>
  );
}
