"use client";

import { HeroSection }         from "./HeroSection";
import { StatsSection }        from "./StatsSection";
import { HowHermesWorks }      from "@/components/HowHermesWorks";
import { AboutSection }        from "./AboutSection";
import { CapabilitiesSection } from "./CapabilitiesSection";
import { EcosystemSection }    from "./EcosystemSection";
import { IndustriesSection }   from "./IndustriesSection";
import { ProjectsSection }     from "./ProjectsSection";
import { PartnersSection }     from "./PartnersSection";
import { ArchitectureSection } from "./ArchitectureSection";
import { PricingSection }      from "./PricingSection";
import { ContactSection }      from "./ContactSection";
import { CTASection }          from "./CTASection";

export function LandingPage() {
  return (
    <>
      <HeroSection />
      <HowHermesWorks />
      <StatsSection />
      <AboutSection />
      <CapabilitiesSection />
      <EcosystemSection />
      <IndustriesSection />
      <ProjectsSection />
      <PartnersSection />
      <ArchitectureSection />
      <PricingSection />
      <ContactSection />
      <CTASection />
    </>
  );
}
