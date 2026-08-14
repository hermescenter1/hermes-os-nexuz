"use client";

// R2 — tiny client island (mirrors the AnalyticsProvider / gtag pattern
// already in this repo, not a second analytics framework). Fires exactly one
// consent-gated event on mount and renders nothing.

import { useEffect } from "react";
import { track } from "@/lib/analytics/events";
import type { CapabilityKey } from "@/lib/capabilities/registry";

export function CapabilityViewTracker({ capabilityKey }: { capabilityKey: CapabilityKey }) {
  useEffect(() => {
    track.capabilityView(capabilityKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilityKey]);

  return null;
}
