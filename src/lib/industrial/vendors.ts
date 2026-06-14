/**
 * Vendor Knowledge Layer (Step 6).
 *
 * Detects vendor context from the question (product families, brand names,
 * Persian transliterations) so the reasoning pipeline can prioritize
 * vendor-matched engineering cases and, in LLM mode, ground the prompt in
 * vendor-specific evidence. Detection data only — no visible text.
 */

export type VendorId =
  | "siemens"
  | "abb"
  | "schneider"
  | "phoenix"
  | "delta"
  | "mitsubishi"
  | "omron";

export interface Vendor {
  id: VendorId;
  name: string; // canonical latin name (used in prompts/logs, not UI)
  keywords: string[];
}

export const VENDORS: Vendor[] = [
  {
    id: "siemens",
    name: "Siemens",
    keywords: ["siemens", "s7", "s7-1200", "s7-1500", "tia portal", "sinamics", "et200", "et 200", "logo!", "simatic", "wincc", "زیمنس", "سیماتیک"],
  },
  {
    id: "abb",
    name: "ABB",
    keywords: ["abb", "acs580", "acs880", "acs355", "ac500", "freelance", "ای بی بی", "ایبیبی"],
  },
  {
    id: "schneider",
    name: "Schneider Electric",
    keywords: ["schneider", "altivar", "atv320", "atv630", "modicon", "m580", "m340", "m241", "telemecanique", "tesys", "اشنایدر", "تله مکانیک"],
  },
  {
    id: "phoenix",
    name: "Phoenix Contact",
    keywords: ["phoenix contact", "phoenix", "plcnext", "axc f", "axioline", "interbus", "فونیکس"],
  },
  {
    id: "delta",
    name: "Delta Electronics",
    keywords: ["delta", "vfd-m", "vfd-el", "ms300", "dop-", "dvp", "as300", "دلتا"],
  },
  {
    id: "mitsubishi",
    name: "Mitsubishi Electric",
    keywords: ["mitsubishi", "melsec", "fx5", "fx3", "fx5u", "iq-r", "iq-f", "mr-j4", "mr-j5", "got2000", "میتسوبیشی"],
  },
  {
    id: "omron",
    name: "Omron",
    keywords: ["omron", "sysmac", "nx1p", "nx102", "nj-", "cj2", "cp1", "e5cc", "e5cn", "nb series", "امرون", "آمرون"],
  },
];

/** Returns matched vendor ids, most-specific keyword hits first. */
export function detectVendors(normalizedText: string): VendorId[] {
  const scored = VENDORS.map((v) => {
    let score = 0;
    for (const k of v.keywords) {
      const kk = k.replace(/\u200C/g, "").toLowerCase();
      if (normalizedText.includes(kk)) score += kk.length >= 5 ? 2 : 1;
    }
    return { id: v.id, score };
  })
    .filter((v) => v.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((v) => v.id);
}
