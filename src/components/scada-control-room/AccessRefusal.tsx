/**
 * PHASE 109-C-UI.3 — the refusal surface.
 *
 * A control room that fails OPEN is worse than one that fails loudly: an empty
 * panel reads as "no alarms, all quiet" to a tired operator at three in the
 * morning. Every refusal therefore renders as a visible statement with its own
 * reason, and never as a blank page or a silent redirect.
 *
 * It reveals nothing about the estate. The message says why the reader cannot
 * see the view, never how many sites exist, whose they are, or what they are
 * called.
 */

import { getTranslations } from "next-intl/server";
import type { RefusalCode } from "@/lib/scada-control-room/contract";

export async function AccessRefusal({
  code,
  locale,
}: {
  code: RefusalCode;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "otEdge.controlRoom" });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 text-start sm:px-6">
      {/*
        `role="alert"` so a reader that arrives here after a session expiry is
        told, rather than left looking at a page that appears to have loaded.
      */}
      <div
        role="alert"
        data-refusal={code}
        className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-6"
      >
        <h1 className="text-lg font-semibold text-white">{t("refusal.heading")}</h1>
        <p className="mt-3 text-sm text-slate-300">{t(`refusal.${code}`)}</p>
      </div>
    </div>
  );
}
