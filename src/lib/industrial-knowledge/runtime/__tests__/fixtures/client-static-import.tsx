"use client";
// FIXTURE — the plainest violation: a Client Component importing the bridge
// directly. The walker must find a one-hop chain from here.
import { bridgeFingerprint } from "@/lib/industrial-knowledge/runtime/bridge";

export function StaticImportFixture() {
  return <span>{bridgeFingerprint().systems}</span>;
}
