export interface SocialLink {
  label: string;
  href: string;
  ariaLabel: string;
  icon: "linkedin" | "instagram" | "facebook" | "github";
}

export const SOCIAL_LINKS: SocialLink[] = [
  {
    label:     "LinkedIn",
    href:      "https://www.linkedin.com/in/hamid-reza-forozandeh",
    ariaLabel: "Hermes OS on LinkedIn",
    icon:      "linkedin",
  },
  {
    label:     "Instagram",
    href:      "https://www.instagram.com/hamidpro17",
    ariaLabel: "Hermes OS on Instagram",
    icon:      "instagram",
  },
  {
    label:     "Facebook",
    href:      "https://www.facebook.com/HermesOSNexus",
    ariaLabel: "Hermes OS Nexus on Facebook",
    icon:      "facebook",
  },
  {
    label:     "GitHub",
    href:      "https://github.com/hermescenter1/hermes-os-nexuz",
    ariaLabel: "Hermes OS on GitHub",
    icon:      "github",
  },
];
