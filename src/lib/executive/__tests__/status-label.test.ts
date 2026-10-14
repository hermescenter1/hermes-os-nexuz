/**
 * Executive Management Center — a frozen report must not say "Live".
 *
 * Found in production on 2026-10-14: the 2026-10-13 report opened with
 * `CALC_VERSION=exec-report-2` and a data cutoff from the previous day, and its
 * decisions panel carried the badge "Live". Every status badge on the surface
 * reads `status.<STATUS>`, and `status.OPERATIONAL` is the word "Live" — true
 * on the live screen, false in the archive.
 *
 * The rule is asserted here, and the CATALOGUE is asserted too: a rule that
 * returns a key nothing translates would render a raw token instead of a word,
 * which is a different defect with the same cause.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { statusLabelKey } from "../status-label";
import type { SectionStatus } from "../contract";

const ALL: readonly SectionStatus[] = ["OPERATIONAL", "EMPTY", "FORBIDDEN", "UNAVAILABLE", "NO_SOURCE"];

const catalogue = (locale: string) =>
  JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).executive.status as Record<string, string>;

describe("status labels — the archive does not borrow the live word", () => {
  it("uses the recorded word for an OPERATIONAL section of a frozen report", () => {
    expect(statusLabelKey("OPERATIONAL", true)).toBe("status.OPERATIONAL_RECORDED");
  });

  it("keeps the live word on the live screen", () => {
    expect(statusLabelKey("OPERATIONAL", false)).toBe("status.OPERATIONAL");
  });

  it.each(ALL.filter(s => s !== "OPERATIONAL"))(
    "leaves %s alone, frozen or not — it describes the answer, not its age",
    status => {
      expect(statusLabelKey(status, true)).toBe(`status.${status}`);
      expect(statusLabelKey(status, false)).toBe(`status.${status}`);
    },
  );
});

describe("status labels — every key the rule can return actually resolves", () => {
  it.each(["en", "fa", "de"])("resolves all of them in %s", locale => {
    const dict = catalogue(locale);
    const keys = [...ALL.flatMap(s => [statusLabelKey(s, false), statusLabelKey(s, true)])];
    const unresolved = [...new Set(keys)].filter(k => {
      const leaf = k.replace(/^status\./, "");
      return typeof dict[leaf] !== "string" || dict[leaf].length === 0;
    });
    expect(unresolved).toEqual([]);
  });

  it("does not say the same word for live and recorded in any language", () => {
    // If a translator copied "Live" into the recorded key, the defect would be
    // back with the tests still green.
    for (const locale of ["en", "fa", "de"]) {
      const dict = catalogue(locale);
      expect(dict.OPERATIONAL_RECORDED, locale).not.toBe(dict.OPERATIONAL);
    }
  });
});
