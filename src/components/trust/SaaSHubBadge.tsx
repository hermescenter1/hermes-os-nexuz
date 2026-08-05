// Official SaaSHub "Approved" trust badge (server component).
//
// Rendered in the public footers alongside the eNAMAD and ProvenExpert seals.
// The destination URL and image endpoint are the official SaaSHub values and
// must be reproduced verbatim — do not proxy, recolor, crop or replace them.
//
// Plain <a>/<img> rather than next/image on purpose: the badge is an external
// vendor asset served from SaaSHub's own CDN and carries campaign parameters;
// routing it through the Next image optimizer would require a remote-image
// allowlist for no benefit. Explicit width/height preserve layout stability.
//
// This stays a server component (no client directive): the badge is fully
// static markup with no interactivity, so it ships zero client JavaScript.

export function SaaSHubBadge() {
  return (
    <a
      href="https://www.saashub.com/hermes-os?utm_source=badge&utm_campaign=badge&utm_content=hermes-os&badge_variant=color&badge_kind=approved"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View Hermes OS on SaaSHub"
      title="Hermes OS is approved on SaaSHub"
      className="ds-focus inline-flex items-center justify-center rounded-md"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- external vendor
          badge served from SaaSHub's CDN; next/image would proxy it through the
          optimizer for no benefit. Explicit width/height give the same
          layout-shift protection the rule enforces. */}
      <img
        src="https://cdn-b.saashub.com/img/badges/approved-color.png?v=1"
        alt="Hermes OS approved on SaaSHub"
        width={150}
        height={54}
        loading="lazy"
        decoding="async"
        // Compact trust-strip sizing: capped below the intrinsic 150px so the
        // badge reads as a peer of the other slots; h-auto preserves the
        // official aspect ratio (never stretched or recoloured).
        className="h-auto max-w-[136px]"
      />
    </a>
  );
}
