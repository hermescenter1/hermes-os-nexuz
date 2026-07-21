import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AnalyzeRequestSchema,
  buildAnalyzeRequest,
  findBlockingField,
  isAnalyzeLocale,
  ANALYZE_LOCALES,
  DEFAULT_ANALYZE_LOCALE,
  MIN_PROBLEM_TITLE,
  MIN_OBSERVED_SYMPTOMS,
} from "../request-contract";
import { ACTIVE_LOCALES } from "@/i18n/locales";

/**
 * PHASE 93B — the shared request contract.
 *
 * The client builder and the server schema live in one module precisely so
 * they cannot drift apart again. These tests assert the builder's output is
 * always something the schema accepts.
 */

/** Reproduces `new FormData(form).entries()` for the Copilot form. */
function formEntries(overrides: Record<string, string> = {}): Array<[string, string]> {
  const fields: Record<string, string> = {
    problemTitle: "Motor start failure",
    assetType: "",
    systemArea: "",
    plcPlatform: "",
    observedSymptoms: "Motor does not start after the HMI start command",
    recentChanges: "",
    activeAlarms: "",
    observedSignals: "",
    hmiCommandState: "",
    plcOutputState: "",
    vfdMccState: "",
    interlockStatus: "",
    sensorFeedback: "",
    safetyImpact: "",      // the "select…" default — always present
    productionImpact: "",  // the "select…" default — always present
    alreadyChecked: "",
    additionalInfo: "",
    ...overrides,
  };
  return Object.entries(fields);
}

describe("93B — the builder always produces a body the schema accepts", () => {
  it.each(["fa", "en", "de"])("the %s page produces a valid canonical body", (locale) => {
    const body = buildAnalyzeRequest(formEntries(), locale);
    expect(body.locale).toBe(locale);
    const parsed = AnalyzeRequestSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.[0])).toBe(true);
  });

  it("covers every active platform locale — a new locale cannot resurrect the bug", () => {
    expect([...ANALYZE_LOCALES]).toEqual([...ACTIVE_LOCALES]);
    for (const locale of ACTIVE_LOCALES) {
      expect(AnalyzeRequestSchema.safeParse(buildAnalyzeRequest(formEntries(), locale)).success).toBe(true);
    }
  });

  it("an unknown UI locale degrades to the default instead of a guaranteed 400", () => {
    for (const bad of ["xx", "de-DE", "", "EN"]) {
      const body = buildAnalyzeRequest(formEntries(), bad);
      expect(body.locale).toBe(DEFAULT_ANALYZE_LOCALE);
      expect(AnalyzeRequestSchema.safeParse(body).success).toBe(true);
    }
    expect(isAnalyzeLocale("de")).toBe(true);
    expect(isAnalyzeLocale("xx")).toBe(false);
  });

  it("trims every value and never emits undefined, null or an object", () => {
    const body = buildAnalyzeRequest(
      formEntries({ problemTitle: "  Motor start failure  ", assetType: "  pump  " }),
      "en",
    );
    expect(body.problemTitle).toBe("Motor start failure");
    expect(body.assetType).toBe("pump");
    for (const v of Object.values(body)) expect(typeof v).toBe("string");
    expect(JSON.stringify(body)).not.toContain("null");
  });

  it("a File entry is dropped rather than posted as an object", () => {
    const entries: Array<[string, FormDataEntryValue]> = [
      ...formEntries(),
      ["attachment", new File(["x"], "trace.csv")],
    ];
    const body = buildAnalyzeRequest(entries, "de");
    expect(body.attachment).toBeUndefined();
    expect(AnalyzeRequestSchema.safeParse(body).success).toBe(true);
  });
});

describe("93B — the client pre-flight mirrors the server minimums", () => {
  it("blocks a too-short title and names the field", () => {
    expect(findBlockingField(buildAnalyzeRequest(formEntries({ problemTitle: "ab" }), "en")))
      .toBe("problemTitle");
    expect(findBlockingField(buildAnalyzeRequest(formEntries({ problemTitle: "   " }), "en")))
      .toBe("problemTitle");
  });

  it("blocks too-short symptoms and names the field", () => {
    expect(findBlockingField(buildAnalyzeRequest(formEntries({ observedSymptoms: "abcd" }), "en")))
      .toBe("observedSymptoms");
  });

  it("passes a valid body", () => {
    expect(findBlockingField(buildAnalyzeRequest(formEntries(), "de"))).toBeNull();
  });

  it("uses the same minimums the schema enforces (they cannot drift)", () => {
    const short = { problemTitle: "x".repeat(MIN_PROBLEM_TITLE - 1), observedSymptoms: "y".repeat(MIN_OBSERVED_SYMPTOMS) };
    expect(AnalyzeRequestSchema.safeParse(short).success).toBe(false);
    const ok = { problemTitle: "x".repeat(MIN_PROBLEM_TITLE), observedSymptoms: "y".repeat(MIN_OBSERVED_SYMPTOMS) };
    expect(AnalyzeRequestSchema.safeParse(ok).success).toBe(true);
  });
});

describe("93B — the schema stays strict", () => {
  it("normalises an empty impact to undefined but rejects a bogus one", () => {
    const blank = AnalyzeRequestSchema.safeParse({
      problemTitle: "Motor start failure",
      observedSymptoms: "Motor does not start",
      safetyImpact: "",
    });
    expect(blank.success).toBe(true);
    expect(blank.success && blank.data.safetyImpact).toBeUndefined();

    expect(
      AnalyzeRequestSchema.safeParse({
        problemTitle: "Motor start failure",
        observedSymptoms: "Motor does not start",
        safetyImpact: "SEVERE",
      }).success,
    ).toBe(false);
  });

  it("was not weakened with permissive escape hatches", () => {
    const code = readFileSync(resolve(process.cwd(), "src/lib/industrial-brain/request-contract.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    expect(code).not.toMatch(/z\.any\(\)/);
    expect(code).not.toMatch(/z\.unknown\(\)/);
    expect(code).not.toMatch(/passthrough\(\)/);
    // the two hard minimums must still be declared
    expect(code).toMatch(/min\(3/);
    expect(code).toMatch(/min\(5/);
  });
});

describe("93B — the workspace uses the shared contract, not its own body builder", () => {
  const code = readFileSync(
    resolve(process.cwd(), "src/components/industrial-brain/IndustrialBrainWorkspace.tsx"),
    "utf8",
  );

  it("imports the shared builder and pre-flight", () => {
    expect(code).toMatch(/buildAnalyzeRequest/);
    expect(code).toMatch(/findBlockingField/);
  });

  it("no longer posts the raw page locale or a hand-rolled body", () => {
    expect(code, "the verbatim locale assignment was the German 400").not.toMatch(/body\.locale\s*=\s*locale/);
    expect(code).not.toMatch(/Object\.fromEntries\(\s*\n?\s*Array\.from\(fd\.entries/);
  });

  it("guards against a duplicate in-flight submit", () => {
    expect(code).toMatch(/if \(busy\) return;/);
  });

  it("distinguishes 401/403, 429 and 5xx from a validation failure", () => {
    expect(code).toMatch(/401/);
    expect(code).toMatch(/403/);
    expect(code).toMatch(/429/);
    expect(code).toMatch(/status >= 500/);
  });

  it("never renders the server's raw error text", () => {
    expect(code).not.toMatch(/setError\(data\.error/);
    expect(code).not.toMatch(/setError\(data\?\.error/);
  });
});

describe("93B — the error messages exist in all three catalogs", () => {
  const KEYS = [
    "validationError",
    "titleTooShort",
    "symptomsTooShort",
    "authError",
    "rateLimited",
    "serverError",
    "connectionError",
  ] as const;

  const catalogs = Object.fromEntries(
    ["en", "fa", "de"].map((l) => [
      l,
      JSON.parse(readFileSync(resolve(process.cwd(), `messages/${l}.json`), "utf8")),
    ]),
  ) as Record<string, { industrialBrain: { form: Record<string, string> } }>;

  it.each(["en", "fa", "de"])("%s has every message, non-empty", (loc) => {
    const form = catalogs[loc].industrialBrain.form;
    for (const k of KEYS) {
      expect(typeof form[k], `${loc}.industrialBrain.form.${k}`).toBe("string");
      expect(form[k].trim().length).toBeGreaterThan(0);
    }
  });

  it("German and Persian are genuinely translated, not English carryover", () => {
    for (const k of KEYS) {
      expect(catalogs.de.industrialBrain.form[k], `de.${k}`).not.toBe(catalogs.en.industrialBrain.form[k]);
      expect(catalogs.fa.industrialBrain.form[k], `fa.${k}`).not.toBe(catalogs.en.industrialBrain.form[k]);
    }
  });
});
