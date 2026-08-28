"use client";

/**
 * PHASE 104 R1 (V-M5) — one source for the platform counts on the dashboard.
 *
 * Three surfaces on the SAME screen printed the same three quantities from two
 * different sources: the command ribbon and the KPI band read the static
 * `PLATFORM_FACTS` (bundled seed content: 30 knowledge records, 14 engineering
 * cases), while the Executive Overview read `getDynamicPlatformFacts()` (live
 * counts of `published` rows). On an instance whose database has no published
 * cases or articles the screen therefore said "Knowledge Records 30" at the top
 * and "Knowledge Libraries 0" further down, both labelled the same thing.
 *
 * Neither number was wrong; publishing both on one screen was. Every surface
 * now reads this hook, so they cannot disagree: same fetch, same fallback, one
 * in-flight request shared by all consumers.
 *
 * Behaviour is unchanged in the fallback path — the static facts render first
 * and remain if the lookup fails or the instance is in session mode, exactly as
 * `getDynamicPlatformFacts` already promised.
 */
import { useEffect, useState } from "react";
import {
  PLATFORM_FACTS,
  getDynamicPlatformFacts,
  type PlatformFacts,
} from "./platform-facts";

/* Module-level so several components mounting in the same render share ONE
   request instead of each issuing their own. */
let inFlight: Promise<PlatformFacts> | null = null;

function loadOnce(): Promise<PlatformFacts> {
  if (!inFlight) {
    inFlight = getDynamicPlatformFacts().catch(() => PLATFORM_FACTS);
  }
  return inFlight;
}

/** Test seam: drops the cached promise so a suite can observe a fresh load. */
export function resetPlatformFactsCache(): void {
  inFlight = null;
}

/**
 * The platform counts, starting from the static baseline so the first paint is
 * never empty and SSR and client markup agree.
 */
export function usePlatformFacts(): PlatformFacts {
  const [facts, setFacts] = useState<PlatformFacts>(PLATFORM_FACTS);

  useEffect(() => {
    let live = true;
    loadOnce().then((f) => {
      if (live) setFacts(f);
    });
    return () => {
      live = false;
    };
  }, []);

  return facts;
}
