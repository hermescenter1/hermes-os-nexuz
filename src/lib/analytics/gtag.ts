declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer: any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag: (...args: any[]) => void;
  }
}

export interface GoogleConsentPrefs {
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

export function gtagReady(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.gtag === "function"
  );
}

export function initGtag(measurementId: string): void {
  if (typeof window === "undefined" || !measurementId) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.dataLayer = (window.dataLayer as any[]) ?? [];

  if (typeof window.gtag !== "function") {
    // Standard gtag initializer. A normal function is required because
    // the arguments object must be forwarded to dataLayer.
    window.gtag = function () {
      window.dataLayer.push(arguments); // eslint-disable-line prefer-rest-params
    };
  }

  window.gtag("js", new Date());

  window.gtag("config", measurementId, {
    anonymize_ip: true,
    send_page_view: true,
  });
}

export function updateConsent(prefs: GoogleConsentPrefs): void {
  if (!gtagReady()) return;

  const analyticsConsent = prefs.analytics ? "granted" : "denied";
  const marketingConsent = prefs.marketing ? "granted" : "denied";
  const preferenceConsent = prefs.preferences ? "granted" : "denied";

  window.gtag("consent", "update", {
    analytics_storage: analyticsConsent,

    ad_storage: marketingConsent,
    ad_user_data: marketingConsent,
    ad_personalization: marketingConsent,

    functionality_storage: preferenceConsent,
    personalization_storage: preferenceConsent,

    // Security-related storage is required for essential site security.
    security_storage: "granted",
  });
}
