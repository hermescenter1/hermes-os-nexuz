declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag: (...args: any[]) => void;
  }
}

export function gtagReady(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

export function initGtag(measurementId: string): void {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.dataLayer = (window.dataLayer as any[]) ?? [];
  // Standard gtag initializer — must use function keyword so `arguments` is correct
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    anonymize_ip:    true,
    send_page_view:  true,
  });
}

export function updateConsent(analyticsGranted: boolean): void {
  if (!gtagReady()) return;
  window.gtag("consent", "update", {
    analytics_storage:     analyticsGranted ? "granted" : "denied",
    ad_storage:            "denied",
    ad_user_data:          "denied",
    ad_personalization:    "denied",
    functionality_storage: "denied",
    personalization_storage: "denied",
  });
}
