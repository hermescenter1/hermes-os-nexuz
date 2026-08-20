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
 * PHASE 107 — it now also carries the chrome. The four Copilot routes were the
 * only signed-in AI surface rendering with no sidebar, no topbar and no
 * `<main>` landmark, because this layout existed purely as a provider and
 * nothing above it supplies a shell. The provider boundary is unchanged and
 * still wraps the children; AppShell is composed inside it so the voice
 * availability context remains available to everything the shell renders.
 */

import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { VoiceAvailabilityProvider } from "@/components/copilot/voice-availability";
import { isExternalAiEnabled } from "@/lib/copilot/voice/config";

export const dynamic = "force-dynamic";

export default function CopilotLayout({ children }: { children: ReactNode }) {
  return (
    <VoiceAvailabilityProvider enabled={isExternalAiEnabled()}>
      <AppShell>{children}</AppShell>
    </VoiceAvailabilityProvider>
  );
}
