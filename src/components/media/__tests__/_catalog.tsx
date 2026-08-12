import type { ReactNode } from "react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { expect } from "vitest";
import faMessages from "../../../../messages/fa.json";
import enMessages from "../../../../messages/en.json";
import deMessages from "../../../../messages/de.json";

/**
 * PHASE 102 / RELEASE BLOCKER 1 — the ONE catalog the media tests are allowed to
 * read.
 *
 * WHAT THIS REPLACES
 * There used to be a hand-written `_messages.ts` fixture here holding a second,
 * parallel copy of the `mediaHub` namespace. It was defended as "wiring, not
 * copy", but it meant every media component test rendered against messages that
 * nobody ships: the fixture said `player.blocked.PENDING_UPLOAD.title` was "Not
 * uploaded yet" while the shipped catalog says "No file has been uploaded yet",
 * and no test in the repository could tell the difference. A parallel source of
 * truth cannot detect drift from the thing it is parallel to.
 *
 * So the fixture is gone. These modules are meant to be the SAME FILES the
 * application loads: `src/i18n/request.ts` resolves `../../messages/${locale}.json`
 * dynamically, and the three imports below name those files statically. Nothing
 * in the module graph connects the two, so the equivalence is PROVEN rather than
 * assumed — `catalog-loader-equivalence.test.ts` invokes the real
 * `getRequestConfig` handler and compares its `messages` against `CATALOGS` for
 * fa, en AND de. A change to the runtime loader that pointed somewhere else, or
 * that resolved one locale differently from another, fails there instead of
 * silently diverging here.
 *
 * The key CONTRACT — that every key the components read exists in all three
 * catalogs — is enforced separately by `src/i18n/__tests__/mediahub-contract.test.ts`,
 * which derives the key set from the TypeScript AST of the media sources.
 *
 * A test that needs a specific string asks `messagesFor(locale)` for it — the
 * translator formats it exactly as next-intl does at runtime, with the same ICU
 * arguments. No test restates catalog copy.
 */

export const MEDIA_LOCALES = ["fa", "en", "de"] as const;
export type MediaLocale = (typeof MEDIA_LOCALES)[number];

export const MEDIA_NAMESPACE = "mediaHub";

/**
 * The catalogs are deliberately widened away from the literal types TypeScript
 * infers for an imported JSON module. Keeping the literal shape would make
 * `createTranslator` type-check every key against a 6255-leaf union, which costs
 * minutes of `tsc` time and — worse — would turn a missing key into a COMPILE
 * error in this helper instead of the runtime failure the guard is meant to
 * observe.
 */
export type Catalog = Record<string, unknown>;

export const CATALOGS: Record<MediaLocale, Catalog> = {
  fa: faMessages as unknown as Catalog,
  en: enMessages as unknown as Catalog,
  de: deMessages as unknown as Catalog,
};

/** The `mediaHub` sub-tree of a catalog, as the components see it. */
export function mediaHubOf(locale: MediaLocale): Catalog {
  const namespace = CATALOGS[locale][MEDIA_NAMESPACE];
  if (namespace === null || typeof namespace !== "object") {
    throw new Error(`messages/${locale}.json carries no ${MEDIA_NAMESPACE} namespace`);
  }
  return namespace as Catalog;
}

/* ═══════════════════ expected copy, derived not restated ═══════════════════ */

export type MediaTranslator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

/**
 * A translator over the REAL catalog, in the REAL namespace, that THROWS on any
 * resolution problem.
 *
 * Throwing matters: a test that asks for a key the catalog does not carry must
 * fail loudly at the point of the expectation, not quietly compare one fallback
 * string against another.
 */
export function messagesFor(locale: MediaLocale): MediaTranslator {
  const translator = createTranslator({
    locale,
    messages: CATALOGS[locale],
    namespace: MEDIA_NAMESPACE,
    timeZone: "UTC",
    onError: (error) => {
      throw error;
    },
  });
  return (key, values) =>
    (translator as unknown as MediaTranslator)(key, values);
}

/* ═══════════════════ the render harness ═══════════════════ */

/**
 * Marker wrapped around any message next-intl could not resolve. The default
 * `getMessageFallback` returns the key path, which renders as plausible-looking
 * text; this makes the failure impossible to mistake for copy, both in the
 * assertion below and in a printed DOM.
 */
export const FALLBACK_MARK = "⟦INTL-FALLBACK:";

interface IntlFailure {
  code: string;
  detail: string;
}

const FAILURES: IntlFailure[] = [];

/** Everything next-intl complained about since the last reset. */
export function intlFailures(): readonly IntlFailure[] {
  return FAILURES;
}

export function resetIntlFailures(): void {
  FAILURES.length = 0;
}

/**
 * Render children against the real catalog for `locale`.
 *
 * `onError` and `getMessageFallback` are both instrumented, because they catch
 * different halves of the same bug: `onError` sees MISSING_MESSAGE,
 * INSUFFICIENT_PATH and every formatting failure, while `getMessageFallback`
 * sees the value that actually lands in the DOM afterwards.
 */
export function IntlHarness({
  locale,
  children,
}: {
  locale: MediaLocale;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={CATALOGS[locale]}
      timeZone="UTC"
      onError={(error) => {
        FAILURES.push({ code: String(error.code), detail: error.message });
      }}
      getMessageFallback={({ namespace, key, error }) => {
        const path = namespace ? `${namespace}.${key}` : key;
        FAILURES.push({ code: `FALLBACK/${String(error.code)}`, detail: path });
        return `${FALLBACK_MARK}${path}⟧`;
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

/** Every dotted leaf path under `mediaHub`, e.g. `player.blocked.FAILED.title`. */
function leafPaths(node: unknown, prefix = ""): string[] {
  if (node === null || typeof node !== "object") return prefix === "" ? [] : [prefix];
  return Object.entries(node as Catalog).flatMap(([key, value]) =>
    leafPaths(value, prefix === "" ? key : `${prefix}.${key}`),
  );
}

const KEY_PATHS: readonly string[] = leafPaths(mediaHubOf("en"));

/**
 * Assert that nothing degraded: no next-intl error, no fallback, and no message
 * that rendered as its own key path.
 *
 * The key-path scan is not redundant with the error sink. A namespace that
 * resolves to an OBJECT is reported as INSUFFICIENT_PATH, but a component that
 * builds a key from a variable and happens to land on a real-looking path can
 * render dotted machine text with no error at all — so the DOM is checked too.
 * The scan matches against the catalog's own key paths rather than a shape
 * heuristic, so a filename like `tags.csv` can never be mistaken for one.
 */
export function assertNoIntlFailures(container?: HTMLElement): void {
  expect(intlFailures()).toEqual([]);
  if (container === undefined) return;
  const rendered = container.textContent ?? "";
  expect(rendered).not.toContain(FALLBACK_MARK);
  const echoed = KEY_PATHS.filter((path) => rendered.includes(path));
  expect(echoed, "a message rendered as its own key path").toEqual([]);
}
