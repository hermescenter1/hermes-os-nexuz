// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readMarketingConsent,
  mountProSeal,
  teardownProSeal,
  isProSealScriptPresent,
  PROSEAL_SCRIPT_URL,
  PROSEAL_SCRIPT_ID,
  PROSEAL_CONTAINER_ID,
} from "../proseal-controller";

const CONSENT_KEY = "hermes_cookie_consent";

function grantMarketing() {
  window.localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({ necessary: true, analytics: false, marketing: true, preferences: false }),
  );
}
function denyMarketing() {
  window.localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({ necessary: true, analytics: false, marketing: false, preferences: false }),
  );
}
function addContainer() {
  const div = document.createElement("div");
  div.id = PROSEAL_CONTAINER_ID;
  document.body.appendChild(div);
  return div;
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  window.localStorage.clear();
  delete (window as unknown as Record<string, unknown>).provenExpert;
  delete (window as unknown as Record<string, unknown>).loadProSeal;
  delete (window as unknown as Record<string, unknown>).__hermesProSeal;
});

describe("readMarketingConsent", () => {
  it("is false with no stored consent (default denied)", () => {
    expect(readMarketingConsent(window)).toBe(false);
  });
  it("is false when marketing is not granted", () => {
    denyMarketing();
    expect(readMarketingConsent(window)).toBe(false);
  });
  it("is true only when marketing is explicitly granted", () => {
    grantMarketing();
    expect(readMarketingConsent(window)).toBe(true);
  });
  it("fails closed on malformed consent", () => {
    window.localStorage.setItem(CONSENT_KEY, "{not-json");
    expect(readMarketingConsent(window)).toBe(false);
  });
});

describe("mountProSeal consent gate", () => {
  it("injects NO script before consent (PROVENEXPERT_PRECONSENT_LOAD=0)", () => {
    addContainer();
    mountProSeal(document, window);
    expect(isProSealScriptPresent(document)).toBe(false);
  });

  it("injects NO script after explicit denial", () => {
    denyMarketing();
    addContainer();
    mountProSeal(document, window);
    expect(isProSealScriptPresent(document)).toBe(false);
  });

  it("injects the vendor script after explicit marketing grant", () => {
    grantMarketing();
    addContainer();
    mountProSeal(document, window);
    const scripts = document.querySelectorAll(`script[src="${PROSEAL_SCRIPT_URL}"]`);
    expect(scripts.length).toBe(1);
    expect(document.getElementById(PROSEAL_SCRIPT_ID)).not.toBeNull();
  });

  it("does not inject a duplicate script across repeated mounts", () => {
    grantMarketing();
    addContainer();
    mountProSeal(document, window);
    mountProSeal(document, window);
    mountProSeal(document, window);
    expect(document.querySelectorAll(`script[src="${PROSEAL_SCRIPT_URL}"]`).length).toBe(1);
  });

  it("initialises the widget exactly once when the vendor API becomes ready", () => {
    grantMarketing();
    const container = addContainer();
    mountProSeal(document, window);
    const proSeal = vi.fn();
    (window as unknown as Record<string, unknown>).provenExpert = { proSeal };
    // Vendor signals readiness via the registered callback.
    (window as unknown as { loadProSeal: () => void }).loadProSeal();
    (window as unknown as { loadProSeal: () => void }).loadProSeal(); // idempotent
    expect(proSeal).toHaveBeenCalledTimes(1);
    expect(container.dataset.prosealInitialised).toBe("true");
  });
});

describe("teardownProSeal", () => {
  it("removes script, widget DOM, callback, vendor global and marker after withdrawal", () => {
    grantMarketing();
    const container = addContainer();
    mountProSeal(document, window);
    const proSeal = vi.fn(() => {
      const iframe = document.createElement("iframe");
      iframe.src = "https://d.provenexpert.net/widget";
      container.appendChild(iframe);
    });
    (window as unknown as Record<string, unknown>).provenExpert = { proSeal };
    (window as unknown as { loadProSeal: () => void }).loadProSeal();
    expect(container.querySelector("iframe")).not.toBeNull();

    teardownProSeal(document, window);

    expect(isProSealScriptPresent(document)).toBe(false);
    expect(document.querySelector('iframe[src*="provenexpert"]')).toBeNull();
    expect((window as unknown as Record<string, unknown>).loadProSeal).toBeUndefined();
    expect((window as unknown as Record<string, unknown>).provenExpert).toBeUndefined();
    expect(container.dataset.prosealInitialised).toBeUndefined();
    expect(container.children.length).toBe(0);
  });

  it("is safe to call with nothing mounted", () => {
    expect(() => teardownProSeal(document, window)).not.toThrow();
    expect(isProSealScriptPresent(document)).toBe(false);
  });

  it("supports a clean re-grant after withdrawal (mounts exactly once)", () => {
    grantMarketing();
    addContainer();
    mountProSeal(document, window);
    teardownProSeal(document, window);
    // Consent still granted → re-mount.
    mountProSeal(document, window);
    expect(document.querySelectorAll(`script[src="${PROSEAL_SCRIPT_URL}"]`).length).toBe(1);
  });
});
