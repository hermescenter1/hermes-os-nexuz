import type { IndustrialAssetType } from "@/lib/industrial/types";

interface AssetTypeIconProps {
  type:      IndustrialAssetType;
  className?: string;
}

/** Lightweight SVG icon for each industrial asset type. */
export function AssetTypeIcon({ type, className = "w-5 h-5" }: AssetTypeIconProps) {
  const cls = `${className} text-current`;

  switch (type) {
    case "PLC":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <rect x="2" y="5" width="16" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
          <line x1="5" y1="8" x2="5" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="8" y1="8" x2="8" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="11" y1="8" x2="11" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="15" cy="10" r="1.5" fill="currentColor"/>
        </svg>
      );
    case "SCADA":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <rect x="2" y="3" width="16" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
          <line x1="6" y1="17" x2="14" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="10" y1="14" x2="10" y2="17" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M5 10 L8 7 L11 9 L14 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case "HMI":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <rect x="3" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
          <rect x="7" y="15" width="6" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
          <line x1="7" y1="13" x2="7" y2="15" stroke="currentColor" strokeWidth="1.2"/>
          <line x1="13" y1="13" x2="13" y2="15" stroke="currentColor" strokeWidth="1.2"/>
          <circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
      );
    case "MOTOR":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/>
          <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.2"/>
          <line x1="10" y1="3" x2="10" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="10" y1="14" x2="10" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      );
    case "PUMP":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M10 5 L12 8.5 H8 Z" fill="currentColor" opacity="0.5"/>
          <path d="M14.2 12.6 L10.5 11.2 L12.8 8 Z" fill="currentColor" opacity="0.5"/>
          <path d="M5.8 12.6 L9.5 11.2 L7.2 8 Z" fill="currentColor" opacity="0.5"/>
          <line x1="1" y1="10" x2="4" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="16" y1="10" x2="19" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      );
    case "SENSOR":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <path d="M4 14 Q4 7 10 7 Q16 7 16 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M6 14 Q6 9 10 9 Q14 9 14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <circle cx="10" cy="15" r="1.5" fill="currentColor"/>
        </svg>
      );
    case "VFD":
    case "DRIVE":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <rect x="2" y="4" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M6 12 L8 8 L10 11 L12 9 L14 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="5" cy="7" r="1" fill="currentColor"/>
        </svg>
      );
    case "VALVE":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <path d="M3 10 H8 L10 6 L12 14 L14 10 H17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="10" y1="2" x2="10" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="10" cy="5" r="1.5" fill="currentColor" opacity="0.6"/>
        </svg>
      );
    case "COMPRESSOR":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M10 5 L10 9 M13 10 L9 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          <line x1="1" y1="10" x2="3" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="17" y1="10" x2="19" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      );
    case "CONVEYOR":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.4"/>
          <circle cx="4"  cy="13" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
          <circle cx="16" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
          <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.15"/>
        </svg>
      );
    case "PANEL":
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <rect x="2" y="2" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
          <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
          <circle cx="13" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="5" y="11" width="10" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 20 20" fill="none" className={cls}>
          <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/>
          <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
      );
  }
}

/** Short display label for each asset type. */
export const ASSET_TYPE_LABEL: Record<string, string> = {
  PLC:        "PLC",
  SCADA:      "SCADA",
  HMI:        "HMI",
  MOTOR:      "Motor",
  PUMP:       "Pump",
  COMPRESSOR: "Compressor",
  CONVEYOR:   "Conveyor",
  SENSOR:     "Sensor",
  DRIVE:      "Drive",
  VFD:        "VFD",
  VALVE:      "Valve",
  PANEL:      "Panel",
  OTHER:      "Other",
};
