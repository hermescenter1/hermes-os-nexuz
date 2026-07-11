// Inline SVG country flags — no external dependency.
// Rounded corners and subtle border are applied via CSS on the outer <span>,
// which avoids SVG clipPath ID collisions when the same flag renders twice.

import type { SupportedLocale } from "@/i18n/locales";

type FlagProps = { size?: number; className?: string };
export type FlagComponent = (props: FlagProps) => React.JSX.Element;

export function IranFlag({ size = 20, className }: FlagProps) {
  const h = Math.round(size * 0.7);
  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-sm ring-1 ring-inset ring-white/10${className ? ` ${className}` : ""}`}
      style={{ width: size, height: h }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 20 14" width={size} height={h} fill="none">
        <rect width="20" height="14" fill="#239f40" />
        <rect y="4.67" width="20" height="4.67" fill="#ffffff" />
        <rect y="9.34" width="20" height="4.67" fill="#da0000" />
      </svg>
    </span>
  );
}

export function UKFlag({ size = 20, className }: FlagProps) {
  const h = Math.round(size * 0.7);
  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-sm ring-1 ring-inset ring-white/10${className ? ` ${className}` : ""}`}
      style={{ width: size, height: h }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 20 14" width={size} height={h} fill="none">
        {/* Blue field */}
        <rect width="20" height="14" fill="#012169" />
        {/* St Andrew white diagonals */}
        <path d="M0,0 L20,14 M20,0 L0,14" stroke="#ffffff" strokeWidth="3.5" />
        {/* St Patrick red thin diagonals */}
        <path d="M0,0 L20,14 M20,0 L0,14" stroke="#C8102E" strokeWidth="1.8" />
        {/* St George white cross */}
        <rect x="0" y="5.5" width="20" height="3" fill="#ffffff" />
        <rect x="8.5" y="0" width="3" height="14" fill="#ffffff" />
        {/* St George red cross */}
        <rect x="0" y="6.1" width="20" height="1.8" fill="#C8102E" />
        <rect x="9.1" y="0" width="1.8" height="14" fill="#C8102E" />
      </svg>
    </span>
  );
}

export function GermanFlag({ size = 20, className }: FlagProps) {
  const h = Math.round(size * 0.7);
  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-sm ring-1 ring-inset ring-white/10${className ? ` ${className}` : ""}`}
      style={{ width: size, height: h }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 20 14" width={size} height={h} fill="none">
        <rect y="0"    width="20" height="4.67" fill="#000000" />
        <rect y="4.67" width="20" height="4.67" fill="#dd0000" />
        <rect y="9.34" width="20" height="4.67" fill="#ffce00" />
      </svg>
    </span>
  );
}

/**
 * Flag component per locale. Keyed by SupportedLocale so German's flag is
 * modeled before it is public — the switchers only render ACTIVE locales.
 */
export const LOCALE_FLAG: Record<SupportedLocale, FlagComponent> = {
  fa: IranFlag,
  en: UKFlag,
  de: GermanFlag,
};
