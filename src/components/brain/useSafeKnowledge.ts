"use client";

import { useMessages, useTranslations } from "next-intl";

export type KnowledgeField =
  | "name"
  | "summary"
  | "p1"
  | "p2"
  | "p3"
  | "c1"
  | "c2";

/**
 * Safety fix (post-4B audit): knowledge content is rendered from dynamic
 * library ids returned by the Brain API. If an id ever lacks localized
 * content, next-intl's default behavior would render the raw i18n key path
 * to the user. This accessor checks the loaded message tree directly and:
 *  - returns a safe localized fallback label instead of a raw key
 *  - logs a development warning naming the missing key
 *  - never throws
 */
export function useSafeKnowledge() {
  const messages = useMessages() as {
    knowledge?: Record<string, Record<string, unknown>>;
  };
  const k = useTranslations("knowledge");
  const b = useTranslations("brain");

  return function safeK(id: string, field: KnowledgeField): string {
    const value = messages.knowledge?.[id]?.[field];
    if (typeof value === "string" && value.length > 0) {
      return k(`${id}.${field}`);
    }
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[hermes:knowledge] missing message key: knowledge.${id}.${field}`);
    }
    return b("unknownSource");
  };
}
