"use client";

// PHASE 87C — topbar search/command trigger. Dispatches the same event the
// sidebar search field uses; AppCommandPalette listens globally.

import { IconButton } from "@/components/ds";

export function SearchTrigger({ label }: { label: string }) {
  return (
    <IconButton
      aria-label={label}
      variant="tertiary"
      size="md"
      onClick={() => window.dispatchEvent(new CustomEvent("hermes:command-palette"))}
      icon={
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-4 w-4"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      }
    />
  );
}
