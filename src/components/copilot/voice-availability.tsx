"use client";

/**
 * PHASE 103 — how the browser learns whether the voice feature exists at all.
 *
 * THE PROBLEM THIS SOLVES
 * `HERMES_EXTERNAL_AI_ENABLED` is a SERVER switch. The three voice endpoints
 * refuse everything while it is off, which is the security boundary and stays
 * the security boundary. But a panel that cannot know the switch renders an
 * inviting Start control, opens the operator's microphone, and only then
 * discovers the feature is off — a permission prompt and a live microphone for a
 * request that was always going to be refused.
 *
 * THE RULE THIS ENFORCES
 * The value is read ON THE SERVER, at request time, by the SAME
 * `isExternalAiEnabled()` the routes are built on, and handed down through this
 * context. There is deliberately no `NEXT_PUBLIC_…` mirror of the switch: a
 * second variable is a second thing to set, and two variables that are supposed
 * to agree are two variables that will eventually disagree without anyone
 * noticing.
 *
 * THE DEFAULT IS OFF
 * A tree rendered without the provider — a panel dropped onto a page nobody
 * remembered to wrap — reads `false` and renders the disabled surface. Forgetting
 * the wiring fails towards "no microphone", never towards "microphone".
 */

import { createContext, useContext, type ReactNode } from "react";

/** Fail-closed: absent provider ⇒ the feature is unavailable. */
const VoiceAvailabilityContext = createContext<boolean>(false);

export function VoiceAvailabilityProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <VoiceAvailabilityContext.Provider value={enabled}>{children}</VoiceAvailabilityContext.Provider>
  );
}

/** True only when the server told this tree that external AI is switched on. */
export function useVoiceAvailability(): boolean {
  return useContext(VoiceAvailabilityContext);
}
