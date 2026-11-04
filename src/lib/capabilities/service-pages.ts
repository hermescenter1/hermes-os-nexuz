/**
 * The five legacy service pages rendered by ServiceDetail (THIN-CONTENT lane).
 *
 * Pure data, no i18n and no JSX. The visible link labels live in
 * `services.items.<key>.detail.related` in each catalog, index-aligned with the
 * hrefs below, so a URL is typed once here instead of three times (and a
 * locale cannot silently point somewhere else). Every href is a public route
 * that the live sitemap already lists in fa, en and de.
 */

export type ServiceKey = "plc" | "scadaHmi" | "industrialAi" | "cybersecurity" | "knowledgeCloud";

export const SERVICE_KEYS: readonly ServiceKey[] = [
  "plc",
  "scadaHmi",
  "industrialAi",
  "cybersecurity",
  "knowledgeCloud",
] as const;

export const SERVICE_RELATED_HREFS: Record<ServiceKey, readonly string[]> = {
  plc: [
    "/articles/modern-plc-architecture-large-industrial-plants",
    "/articles/ladder-logic-versus-structured-text-selection",
    "/articles/plc-troubleshooting-evidence-based-diagnostics",
    "/library/plcBasics",
  ],
  scadaHmi: [
    "/articles/modern-scada-architecture-industrial-facilities",
    "/articles/high-performance-hmi-design",
    "/articles/industrial-alarm-management-rationalisation",
    "/library/hmiDesign",
  ],
  industrialAi: [
    "/industrial-brain",
    "/brain",
    "/copilot",
    "/articles/industrial-ai-fault-diagnosis-decision-support",
  ],
  cybersecurity: [
    "/articles/industrial-cybersecurity-plc-scada",
    "/articles/industrial-ethernet-vlan-segmentation",
    "/articles/secure-plc-scada-communication",
    "/services/ot-edge",
  ],
  knowledgeCloud: [
    "/library",
    "/brain",
    "/articles",
    "/library/vendor/siemens",
  ],
};
