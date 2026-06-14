"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { brainService } from "@/lib/services/brain-service";

/** Brain Reference Statistics for one article (session-scoped). */
export function ArticleBrainStats({ articleId }: { articleId: string }) {
  const t = useTranslations("library.article");
  const locale = useLocale();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    brainService.memory(50).then((r) => {
      if (r.ok) setCount(r.data.stats.libraryRefs?.[articleId] ?? 0);
    });
  }, [articleId]);

  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

  return (
    <p className="font-body text-xs text-muted">
      <span className="me-1.5 inline-block h-1 w-1 rounded-full bg-signal align-middle" />
      {count === null
        ? "…"
        : count > 0
          ? t("referencedCount", { count: nf.format(count) })
          : t("notReferenced")}
    </p>
  );
}
