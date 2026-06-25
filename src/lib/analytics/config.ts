export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
export const GTM_ID            = process.env.NEXT_PUBLIC_GTM_ID            ?? "";
export const analyticsEnabled  = Boolean(GA_MEASUREMENT_ID || GTM_ID);
