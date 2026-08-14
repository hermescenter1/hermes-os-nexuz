import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ds";
// Server-safe deep import — see PublicHeader.tsx for the rationale.
import { buttonVariants } from "@/components/ds/logic";
import { SectionHeader } from "./SectionHeader";
import { PublicSection } from "./PublicSection";
import { PublicPageContainer } from "./PublicPageContainer";
import { CapabilityLink } from "@/components/analytics/CapabilityLink";
import { CapabilityViewTracker } from "@/components/analytics/CapabilityViewTracker";
import {
  CAPABILITY_CONNECTIONS,
  relatedHref,
  type CapabilityKey,
} from "@/lib/capabilities/registry";

// R2 — the rich public capability template (gap-closure roadmap, not a new
// engine). Every capability rendered through this component is already
// implemented in the authenticated workspace; this component only gives it a
// public explainer with a real, evidence-grounded connection graph to the
// rest of Hermes OS — no invented statistics, integrations or claims. See
// src/lib/capabilities/registry.ts for the evidence backing each capability.

interface NamedBullet {
  name: string;
  desc: string;
}

interface CapabilityContent {
  name: string;
  title: string;
  lede: string;
  problem: { body: string };
  whatItDoes: { bullets: NamedBullet[] };
  connects: { items: NamedBullet[] };
  value: { items: NamedBullet[] };
  automation: { body: string };
  cta: { title: string };
}

export interface CapabilityDetailProps {
  capabilityKey: CapabilityKey;
}

export async function CapabilityDetail({ capabilityKey }: CapabilityDetailProps) {
  const t = await getTranslations("services");
  const pub = await getTranslations("publicSite");

  const chrome = t.raw("capabilityChrome") as Record<string, string>;
  const c = t.raw(`capabilities.${capabilityKey}`) as CapabilityContent;
  const ctaLabel = pub("demoCta.requestDemo");

  const connections = CAPABILITY_CONNECTIONS[capabilityKey];

  return (
    <>
      {/* Fires exactly one consent-gated capability_view event; renders nothing. */}
      <CapabilityViewTracker capabilityKey={capabilityKey} />

      <PublicSection tone="deep">
        <PublicPageContainer>
          <SectionHeader as="h1" eyebrow={chrome.eyebrow} title={c.title} lede={c.lede} />
        </PublicPageContainer>
      </PublicSection>

      <PublicSection aria-labelledby="capability-problem-title">
        <PublicPageContainer>
          <SectionHeader id="capability-problem-title" title={chrome.problemLabel} />
          <p className="mt-4 max-w-3xl text-body-lg text-text-secondary">{c.problem.body}</p>
        </PublicPageContainer>
      </PublicSection>

      <PublicSection tone="deep" aria-labelledby="capability-what-title">
        <PublicPageContainer>
          <SectionHeader id="capability-what-title" title={chrome.whatItDoesLabel} />
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {c.whatItDoes.bullets.map((b) => (
              <li key={b.name} className="ds-glass-card rounded-lg p-5">
                <h3 className="text-title-lg font-semibold text-text-primary">{b.name}</h3>
                <p className="mt-2.5 text-body-compact text-text-secondary">{b.desc}</p>
              </li>
            ))}
          </ul>
        </PublicPageContainer>
      </PublicSection>

      <PublicSection aria-labelledby="capability-connects-title">
        <PublicPageContainer>
          <SectionHeader id="capability-connects-title" title={chrome.connectsLabel} />
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {c.connects.items.map((item, i) => {
              const target = connections[i];
              const href = target ? relatedHref(target) : undefined;
              return (
                <li key={item.name} className="ds-glass-card rounded-lg p-5">
                  <h3 className="text-title-lg font-semibold text-brand-primary">{item.name}</h3>
                  <p className="mt-2.5 text-body-compact text-text-secondary">{item.desc}</p>
                  {href ? (
                    <CapabilityLink
                      href={href}
                      from={capabilityKey}
                      kind="related"
                      to={target}
                      className={cn(
                        "ds-focus mt-3.5 inline-flex items-center gap-1.5 rounded-sm text-label font-semibold",
                        "text-brand-primary transition-colors duration-fast hover:text-brand-primary-hover",
                      )}
                    >
                      {item.name}
                      <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
                    </CapabilityLink>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </PublicPageContainer>
      </PublicSection>

      <PublicSection tone="deep" aria-labelledby="capability-value-title">
        <PublicPageContainer>
          <SectionHeader id="capability-value-title" title={chrome.valueLabel} />
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {c.value.items.map((b) => (
              <li key={b.name} className="ds-glass-card rounded-lg p-5">
                <h3 className="text-title-lg font-semibold text-status-success">{b.name}</h3>
                <p className="mt-2.5 text-body-compact text-text-secondary">{b.desc}</p>
              </li>
            ))}
          </ul>
        </PublicPageContainer>
      </PublicSection>

      <PublicSection aria-labelledby="capability-automation-title">
        <PublicPageContainer>
          <SectionHeader id="capability-automation-title" title={chrome.automationLabel} />
          <p className="mt-4 max-w-3xl text-body-lg text-text-secondary">{c.automation.body}</p>
        </PublicPageContainer>
      </PublicSection>

      <PublicSection tone="raised">
        <PublicPageContainer className="flex flex-col items-center gap-7 text-center">
          <h2 className="max-w-3xl text-role-h2 font-bold tracking-tight text-text-primary">{c.cta.title}</h2>
          <CapabilityLink
            href="/demo"
            from={capabilityKey}
            kind="cta"
            className={cn(buttonVariants("primary", "lg"), "min-w-44")}
          >
            {ctaLabel}
          </CapabilityLink>
        </PublicPageContainer>
      </PublicSection>
    </>
  );
}
