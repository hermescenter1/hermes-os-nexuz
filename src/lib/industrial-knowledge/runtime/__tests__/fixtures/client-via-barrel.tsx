"use client";
// FIXTURE — reaches the bridge through a barrel, so the chain is TWO hops.
// A direct-import check would report this file as clean.
import { bridgeFingerprint } from "./barrel";

export function BarrelFixture() {
  return <span>{bridgeFingerprint().nodes}</span>;
}
