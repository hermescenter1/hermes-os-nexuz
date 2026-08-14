"use client";

// R2 — tiny client island: a normal locale-aware <Link> that also fires the
// matching capability-graph analytics event on click. Functions cannot cross
// the server->client boundary as props (RSC constraint), so this component
// takes plain, serializable identifiers and resolves the event itself —
// callers never pass a callback.

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { track } from "@/lib/analytics/events";

export interface CapabilityLinkProps {
  href: string;
  /** The capability page this link lives on. */
  from: string;
  /** "related" — from -> another capability. "cta" — the page's own demo CTA. */
  kind: "related" | "cta";
  /** Required for kind="related": which capability the link points to. */
  to?: string;
  className?: string;
  children: ReactNode;
}

export function CapabilityLink({ href, from, kind, to, className, children }: CapabilityLinkProps) {
  function handleClick() {
    if (kind === "related") {
      track.capabilityRelatedClick(from, to ?? href);
    } else {
      track.capabilityCtaClick(from);
    }
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
