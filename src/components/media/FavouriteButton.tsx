"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { useTranslations } from "next-intl";

/**
 * PHASE 102 — the save / favourite toggle.
 *
 * A TOGGLE BUTTON, WITH `aria-pressed`. Not a checkbox (there is no form and no
 * value to submit) and not an icon-only `<div>` (it must be tabbable and it must
 * activate on Space and Enter). `IconButton` makes `aria-label` a required prop
 * precisely so an icon-only control cannot ship nameless.
 *
 * OPTIMISTIC, BUT IT TELLS THE TRUTH WHEN IT IS WRONG. The pressed state flips
 * immediately, and if the write rejects it flips back and an error is announced
 * politely. A save that silently failed would leave the user believing their
 * library contains something it does not — and `MediaSave` is subject-attributable
 * data registered in the Phase 97 erasure registry (ADR §8), so its state is not
 * cosmetic.
 *
 * SIGNED OUT IS ITS OWN STATE, NOT "NOT SAVED". `saved === null` means there is no
 * viewer identity to attach a save to. The control renders disabled with an
 * explanatory label instead of appearing to work and then failing on click.
 *
 * The result of the in-flight write is discarded if the component unmounts, so a
 * navigation mid-request cannot set state on a dead tree.
 */
export interface FavouriteButtonProps {
  /** Current state, or null when there is no authenticated viewer. */
  saved: boolean | null;
  /** Persists the new state. Rejecting reverts the optimistic flip. */
  onToggle: (next: boolean) => void | Promise<void>;
  /** Accessible name context, e.g. the asset title. */
  title: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function FavouriteButton({
  saved,
  onToggle,
  title,
  size = "sm",
  className,
}: FavouriteButtonProps) {
  const t = useTranslations("mediaHub");
  const [optimistic, setOptimistic] = useState<boolean>(saved ?? false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  // Follow the authoritative value when the caller re-renders with a fresh one.
  useEffect(() => {
    if (saved !== null) setOptimistic(saved);
  }, [saved]);

  // A navigation mid-request must not resolve into a torn-down tree.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (saved === null) {
    return (
      <IconButton
        variant="tertiary"
        size={size}
        disabled
        aria-label={t("favourite.signInRequired")}
        icon={<span aria-hidden="true">☆</span>}
        className={className}
      />
    );
  }

  const handleClick = async (): Promise<void> => {
    if (pending) return;
    const next = !optimistic;
    setOptimistic(next);
    setPending(true);
    setFailed(false);
    try {
      await onToggle(next);
    } catch {
      // Revert: the library does not contain what the user was just told it does.
      if (mountedRef.current) {
        setOptimistic(!next);
        setFailed(true);
      }
    } finally {
      if (mountedRef.current) setPending(false);
    }
  };

  return (
    <span className={cn("inline-flex flex-col items-center", className)}>
      <IconButton
        variant="tertiary"
        size={size}
        loading={pending}
        aria-pressed={optimistic}
        aria-label={
          optimistic ? t("favourite.remove", { title }) : t("favourite.add", { title })
        }
        icon={
          <span aria-hidden="true" className={optimistic ? "text-brand-primary" : undefined}>
            {optimistic ? "★" : "☆"}
          </span>
        }
        onClick={() => {
          void handleClick();
        }}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {failed ? t("favourite.failed") : ""}
      </span>
    </span>
  );
}
