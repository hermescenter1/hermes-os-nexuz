export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

// GTM ID must start with "GTM-" — reject G-XXXXXXX (GA measurement IDs) or empty strings
const _rawGtm = process.env.NEXT_PUBLIC_GTM_ID ?? "";
export const GTM_ID = _rawGtm.startsWith("GTM-") ? _rawGtm : "";

export const analyticsEnabled = Boolean(GA_MEASUREMENT_ID || GTM_ID);
