"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { useTranslations } from "next-intl";
import { createDebounced, MEDIA_SEARCH_DEBOUNCE_MS } from "./logic";

/**
 * PHASE 102 — the library search box.
 *
 * WHY DEBOUNCED AND NOT SUBMIT-ONLY
 * The OT console requires an explicit submit and records why: every keystroke
 * would race against a shared 120-per-minute budget, and the response for "PL"
 * can land after the response for "PLC". Media search sits on a cheaper, less
 * contended read, so search-as-you-type is affordable — but the ordering hazard
 * is identical, so it is debounced on the trailing edge. One request per pause,
 * not one per keystroke.
 *
 * The visible value is local state and updates on every keystroke, so typing
 * never feels laggy; only the *notification* is delayed. Those are different
 * things and conflating them is what makes debounced inputs feel broken.
 *
 * The pending call is cancelled on unmount: a request fired from a torn-down
 * component would update a dead tree, and if the caller navigates on result it
 * would navigate away from wherever the user just went.
 *
 * Typing is not a form submission, so Enter is intercepted to flush immediately
 * rather than reloading the page.
 */
export interface MediaSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Override the debounce window; 0 disables debouncing (used in tests). */
  debounceMs?: number;
  placeholder?: string;
  className?: string;
}

export function MediaSearchInput({
  value,
  onChange,
  debounceMs = MEDIA_SEARCH_DEBOUNCE_MS,
  placeholder,
  className,
}: MediaSearchInputProps) {
  const t = useTranslations("mediaHub");
  const id = useId();
  const [draft, setDraft] = useState(value);

  // Keep the caller's value authoritative when it changes from outside (e.g. a
  // "clear filters" button, or a back navigation restoring a URL).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // `onChange` is read through a ref so the debouncer is created once. Rebuilding
  // it on every render would reset the timer on every keystroke and, with an
  // inline arrow from the parent, mean it never fires at all.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const debounced = useMemo(
    () => createDebounced<[string]>((next) => onChangeRef.current(next), debounceMs),
    [debounceMs],
  );

  useEffect(() => () => debounced.cancel(), [debounced]);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="sr-only">
        {t("search.label")}
      </label>
      <div className="relative">
        <Input
          id={id}
          type="search"
          value={draft}
          placeholder={placeholder ?? t("search.placeholder")}
          autoComplete="off"
          onChange={(event) => {
            setDraft(event.target.value);
            debounced.call(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              debounced.flush();
            }
          }}
          className="pe-8"
        />
        {draft.length > 0 ? (
          <button
            type="button"
            aria-label={t("search.clear")}
            onClick={() => {
              setDraft("");
              debounced.cancel();
              onChangeRef.current("");
            }}
            className={cn(
              "ds-focus absolute end-1 top-1/2 -translate-y-1/2 rounded-xs px-1.5 py-0.5",
              "text-text-muted hover:text-text-primary",
            )}
          >
            <span aria-hidden="true">✕</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
