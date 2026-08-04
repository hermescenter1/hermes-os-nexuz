/**
 * ProvenExpert PRO Seal controller (compliance security hotfix).
 *
 * Pure, framework-free DOM mechanics for the ProvenExpert reputation widget,
 * extracted so the consent gate can be unit-tested without rendering React or
 * contacting the vendor. The widget is a NON-ESSENTIAL, marketing-category
 * third party: nothing here runs until explicit marketing consent, and
 * `teardownProSeal` fully removes every runtime artefact the application
 * introduced so a later withdrawal leaves no script, DOM, callback or listener
 * behind.
 *
 * All functions take the target `document`/`window` explicitly so tests can
 * drive a synthetic DOM. They read the SAME authoritative consent record the
 * rest of the app uses (`hermes_cookie_consent` + the `hermes:consent-updated`
 * event) — this is a reader, never a second consent store.
 */

export const PROSEAL_SCRIPT_URL = "https://s.provenexpert.net/seals/proseal-v2.js";
export const PROSEAL_SCRIPT_ID = "provenexpert-proseal-script";
export const PROSEAL_CONTAINER_ID = "proSealWidget";
export const MARKETING_CONSENT_EVENT = "hermes:consent-updated";

const CONSENT_KEY = "hermes_cookie_consent";

type ProSealOptions = {
  widgetId: string;
  language: string;
  usePageLanguage: boolean;
  bannerColor: string;
  textColor: string;
  showBackPage: boolean;
  showReviews: boolean;
  hideDate: boolean;
  hideName: boolean;
  googleStars: boolean;
  displayReviewerLastName: boolean;
  embeddedSelector: string;
};

interface ProvenExpertApi {
  proSeal: (options: ProSealOptions) => void;
}

interface ProSealWindow {
  localStorage?: Storage;
  provenExpert?: ProvenExpertApi;
  loadProSeal?: () => void;
  __hermesProSeal?: { onLoad?: () => void; onError?: () => void };
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
}

// Official widget configuration — must match the ProvenExpert dashboard snippet.
const WIDGET_OPTIONS: ProSealOptions = {
  widgetId: "556c8c4c-1239-4292-a2fb-24c03d7c8443",
  language: "en-GB",
  usePageLanguage: false,
  bannerColor: "#097E92",
  textColor: "#FFFFFF",
  showBackPage: false,
  showReviews: true,
  hideDate: true,
  hideName: false,
  googleStars: false,
  displayReviewerLastName: false,
  embeddedSelector: `#${PROSEAL_CONTAINER_ID}`,
};

/**
 * True only when the stored consent record explicitly grants the marketing
 * category. Absence, a parse error or any other value fails closed to `false`.
 */
export function readMarketingConsent(win: ProSealWindow): boolean {
  try {
    const raw = win.localStorage?.getItem(CONSENT_KEY);
    if (!raw) return false;
    const prefs = JSON.parse(raw) as { marketing?: unknown } | null;
    return prefs?.marketing === true;
  } catch {
    return false;
  }
}

/** True when our vendor script tag is already present in the document. */
export function isProSealScriptPresent(doc: Document): boolean {
  return (
    !!doc.getElementById(PROSEAL_SCRIPT_ID) ||
    !!doc.querySelector(`script[src="${PROSEAL_SCRIPT_URL}"]`)
  );
}

function initContainer(doc: Document, win: ProSealWindow): void {
  const container = doc.getElementById(PROSEAL_CONTAINER_ID);
  if (!container) return;
  if ((container as HTMLElement).dataset.prosealInitialised === "true") return;
  const proSeal = win.provenExpert?.proSeal;
  if (typeof proSeal !== "function") return; // vendor API not ready yet
  container.replaceChildren();
  proSeal(WIDGET_OPTIONS);
  (container as HTMLElement).dataset.prosealInitialised = "true";
}

/**
 * Load and initialise the widget — ONLY when marketing consent is present.
 * Idempotent: repeated calls (re-render, multiple mounts) never inject a second
 * script. The consent re-check here is defence in depth on top of the caller's
 * own gate, guaranteeing no pre-consent network load can ever occur.
 */
export function mountProSeal(doc: Document, win: ProSealWindow): void {
  if (!readMarketingConsent(win)) return;

  const onLoad = () => initContainer(doc, win);
  const onError = () => {
    console.error("ProvenExpert PRO Seal script failed to load.");
  };

  // The vendor calls window.loadProSeal() once its API is ready; register it
  // before the script can execute.
  win.loadProSeal = onLoad;
  win.__hermesProSeal = { onLoad, onError };

  let script = doc.getElementById(PROSEAL_SCRIPT_ID) as HTMLScriptElement | null;
  if (!script) {
    script = doc.querySelector<HTMLScriptElement>(`script[src="${PROSEAL_SCRIPT_URL}"]`);
  }

  if (!script) {
    script = doc.createElement("script");
    script.id = PROSEAL_SCRIPT_ID;
    script.src = PROSEAL_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    // Keep optimisers from rewriting/delaying the official widget script.
    script.setAttribute("data-cfasync", "false");
    script.setAttribute("nowprocket", "");
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    doc.body.appendChild(script);
  } else {
    // Script already present (re-mount / prior navigation) — no second tag.
    script.addEventListener("load", onLoad, { once: true });
  }

  // Covers the "API already available" case (script executed on a prior page).
  initContainer(doc, win);
}

/**
 * Remove EVERYTHING the application introduced for ProvenExpert: the injected
 * script tag, the widget DOM, any vendor iframe, the global callback, the
 * vendor global, our listeners and the initialisation marker. After this a
 * later re-grant initialises cleanly and exactly once.
 */
export function teardownProSeal(doc: Document, win: ProSealWindow): void {
  const script =
    (doc.getElementById(PROSEAL_SCRIPT_ID) as HTMLScriptElement | null) ??
    doc.querySelector<HTMLScriptElement>(`script[src="${PROSEAL_SCRIPT_URL}"]`);
  if (script) {
    const handlers = win.__hermesProSeal;
    if (handlers?.onLoad) script.removeEventListener("load", handlers.onLoad);
    if (handlers?.onError) script.removeEventListener("error", handlers.onError);
    script.remove();
  }

  const container = doc.getElementById(PROSEAL_CONTAINER_ID);
  if (container) {
    container.replaceChildren();
    delete (container as HTMLElement).dataset.prosealInitialised;
  }

  // Any vendor-rendered iframe (defensive — the widget may inject one).
  doc.querySelectorAll('iframe[src*="provenexpert"]').forEach((el) => el.remove());

  // Remove the global callback and vendor global introduced via the script.
  delete win.loadProSeal;
  delete win.provenExpert;
  delete win.__hermesProSeal;
}
