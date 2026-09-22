"use client";

import { useEffect } from "react";

const CLARITY_PROJECT_ID = "xqkjqosfi1";
const CLARITY_SCRIPT_ID = "hermes-microsoft-clarity";

type ClarityCommand = [string, ...unknown[]];

declare global {
  interface Window {
    clarity?: {
      (...args: ClarityCommand): void;
      q?: ClarityCommand[];
    };
  }
}

export function MicrosoftClarity() {
  useEffect(() => {
    if (document.getElementById(CLARITY_SCRIPT_ID)) return;

    const clarity = ((...args: ClarityCommand) => {
      (clarity.q ??= []).push(args);
    }) as NonNullable<Window["clarity"]>;

    window.clarity = window.clarity ?? clarity;

    const script = document.createElement("script");
    script.id = CLARITY_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
    document.head.appendChild(script);

    return () => {
      /*
       * Consent revocation stops future Clarity collection immediately and
       * removes the loader. A later grant can mount a fresh loader.
       */
      try {
        window.clarity?.("consent", false);
      } finally {
        document.getElementById(CLARITY_SCRIPT_ID)?.remove();
        delete window.clarity;
      }
    };
  }, []);

  return null;
}
