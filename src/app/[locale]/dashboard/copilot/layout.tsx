/**
 * PHASE 103 — the server boundary that tells the Copilot surface whether the
 * external-AI switch is on.
 *
 * This layout exists for exactly one reason: the Copilot page is a client
 * component, and a client component cannot read a server-only environment
 * variable. Reading it HERE, in a server component, and passing it down means
 * the panel and the API routes are driven by one function reading one variable
 * on one machine — they cannot disagree.
 *
 * `force-dynamic` is what makes that true at RUNTIME rather than at build time.
 * Without it the switch would be captured into a prerendered payload during
 * `next build`, and a container started later with the switch flipped would ship
 * a UI describing the wrong reality. The segment is an authenticated dashboard
 * route, so it was never usefully static.
 *
 * It adds no markup: the provider renders its children and nothing else.
 */

import type { ReactNode } from "react";

import { VoiceAvailabilityProvider } from "@/components/copilot/voice-availability";
import { isExternalAiEnabled } from "@/lib/copilot/voice/config";

export const dynamic = "force-dynamic";

export default function CopilotLayout({ children }: { children: ReactNode }) {
  return <VoiceAvailabilityProvider enabled={isExternalAiEnabled()}>{children}</VoiceAvailabilityProvider>;
}
