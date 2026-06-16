"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Storage indicator (Phase 11B). Reads the mode from any storage API route
 * and shows a quiet "Storage: Session / Database" badge. Intentionally
 * understated — muted text, no color shout.
 */
export function StorageIndicator() {
  const t = useTranslations("storage");
  const [mode, setMode] = useState<"session" | "database" | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/analysis", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j?.storageMode) setMode(j.storageMode);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!mode) return null;
  return (
    <span className="font-mono text-[0.65rem] text-muted/70">
      {t("label")}: {t(mode)}
    </span>
  );
}
