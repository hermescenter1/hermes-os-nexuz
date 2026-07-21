import { describe, it, expect } from "vitest";
import { POST } from "../analyze/route";

/**
 * PHASE 93B — /api/industrial-brain/analyze request contract.
 *
 * Locks the two defects that made the production Copilot return HTTP 400, and
 * the validation that must KEEP rejecting bad input:
 *
 *   1. LOCALE. The workspace sends the page locale verbatim (`body.locale =
 *      locale`). German went live, so `/de/industrial-brain` sent
 *      `locale: "de"` while the schema accepted only `en|fa` — every German
 *      submission was rejected. The analyzer never reads `locale` (it emits
 *      both `domain` and `domainFa` and lets the UI choose), so accepting "de"
 *      invents no German analysis: it is a UI-language tag, not an engine mode.
 *
 *   2. IMPACT SELECTS. `impactOptions[0]` is `{ v: "" }` and is the DEFAULT
 *      option, and a <select> is ALWAYS present in FormData — so an untouched
 *      form sent `safetyImpact: ""`. `z.enum([...]).optional()` rejects `""`
 *      (it is not `undefined`), so the form failed in EVERY locale, including
 *      Persian and English, whenever the user left impact unset.
 */

const json = (body: unknown) =>
  new Request("http://t/api/industrial-brain/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];

const raw = (body: string) =>
  new Request("http://t/api/industrial-brain/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }) as unknown as Parameters<typeof POST>[0];

/**
 * The analysis minus `processingMs` — the analyzer stamps a wall-clock duration
 * that legitimately differs between runs, so it must not take part in an
 * equality comparison.
 */
function stable(analysis: unknown): string {
  const { processingMs: _ignored, ...rest } = (analysis ?? {}) as Record<string, unknown>;
  return JSON.stringify(rest);
}

/** A minimally valid canonical payload. */
const VALID = {
  problemTitle: "Motor start failure",
  observedSymptoms: "Motor does not start after the HMI start command",
};

const FA = {
  problemTitle: "خرابی راه‌اندازی موتور",
  observedSymptoms: "موتور پس از فرمان استارت از HMI روشن نمی‌شود",
  locale: "fa",
};

const DE = {
  problemTitle: "Motor startet nicht",
  observedSymptoms: "Der Motor startet nach dem HMI-Startbefehl nicht",
  locale: "de",
};

describe("93B — every supported UI locale is accepted", () => {
  it.each([
    ["fa", FA],
    ["en", { ...VALID, locale: "en" }],
    ["de", DE],
  ])("%s returns 200 with an analysis", async (_label, body) => {
    const res = await POST(json(body));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.analysis).toBeTruthy();
  });

  it("omitting locale still works (unchanged default)", async () => {
    const res = await POST(json(VALID));
    expect(res.status).toBe(200);
  });

  it("an unsupported locale is still rejected — the enum was widened, not removed", async () => {
    for (const bad of ["xx", "de-DE", "EN", "", "zh"]) {
      const res = await POST(json({ ...VALID, locale: bad }));
      expect(res.status, `locale "${bad}" must not be accepted`).toBe(400);
    }
  });

  it("locale does not change the analysis — the engine is locale-independent", async () => {
    const of = async (locale: string) => {
      const d = await (await POST(json({ ...VALID, locale }))).json();
      expect(d.ok, `locale ${locale} must be accepted`).toBe(true);
      return stable(d.analysis);
    };
    const [en, fa, de] = await Promise.all([of("en"), of("fa"), of("de")]);
    expect(fa).toBe(en);
    expect(de).toBe(en);
  });
});

describe("93B — the untouched impact selects no longer fail", () => {
  it("empty impact strings are accepted (the form's default option)", async () => {
    const res = await POST(json({ ...VALID, safetyImpact: "", productionImpact: "" }));
    expect(res.status).toBe(200);
  });

  it("an empty impact is treated as 'not stated', never as a severity", async () => {
    const blank = await (await POST(json({ ...VALID, safetyImpact: "", productionImpact: "" }))).json();
    const omitted = await (await POST(json(VALID))).json();
    expect(blank.ok).toBe(true);
    expect(stable(blank.analysis)).toBe(stable(omitted.analysis));
  });

  it("real impact values still drive the analysis", async () => {
    const res = await POST(json({ ...VALID, safetyImpact: "CRITICAL", productionImpact: "HIGH" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("an invalid impact value is still rejected", async () => {
    for (const bad of ["SEVERE", "critical", "0", "null"]) {
      expect((await POST(json({ ...VALID, safetyImpact: bad }))).status, bad).toBe(400);
      expect((await POST(json({ ...VALID, productionImpact: bad }))).status, bad).toBe(400);
    }
  });
});

describe("93B — the exact payload the Copilot form produces", () => {
  /**
   * Mirrors handleSubmit: Object.fromEntries(new FormData(form)) — every named
   * control is present, text inputs the user skipped are "", and both selects
   * carry the "" default. Plus `body.locale = locale`.
   */
  const formPayload = (locale: string) => ({
    problemTitle: "Motor startet nicht",
    assetType: "",
    systemArea: "",
    plcPlatform: "",
    observedSymptoms: "Der Motor startet nach dem HMI-Startbefehl nicht",
    recentChanges: "",
    activeAlarms: "",
    observedSignals: "",
    hmiCommandState: "",
    plcOutputState: "",
    vfdMccState: "",
    interlockStatus: "",
    sensorFeedback: "",
    safetyImpact: "",
    productionImpact: "",
    alreadyChecked: "",
    additionalInfo: "",
    locale,
  });

  it.each(["fa", "en", "de"])("the real %s form payload is accepted", async (locale) => {
    const res = await POST(json(formPayload(locale)));
    expect(res.status, `${locale} form payload must not 400`).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe("93B — validation stays strict", () => {
  it("malformed JSON returns 400", async () => {
    const res = await POST(raw("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["too short", "ab"],
    ["whitespace only", "   "],
  ])("problemTitle %s returns 400", async (_l, problemTitle) => {
    const res = await POST(json({ ...VALID, problemTitle }));
    expect(res.status).toBe(400);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["too short", "abcd"],
  ])("observedSymptoms %s returns 400", async (_l, observedSymptoms) => {
    const res = await POST(json({ ...VALID, observedSymptoms }));
    expect(res.status).toBe(400);
  });

  it("over-length input is rejected", async () => {
    expect((await POST(json({ ...VALID, problemTitle: "x".repeat(201) }))).status).toBe(400);
    expect((await POST(json({ ...VALID, observedSymptoms: "y".repeat(3001) }))).status).toBe(400);
  });

  it("wrong types are rejected, not coerced", async () => {
    for (const bad of [null, 42, { a: 1 }, ["x"], true]) {
      expect((await POST(json({ ...VALID, problemTitle: bad }))).status).toBe(400);
    }
  });

  it("a non-object body is rejected", async () => {
    for (const body of ["[]", '"a string"', "42", "null"]) {
      expect((await POST(raw(body))).status, body).toBe(400);
    }
  });
});

describe("93B — documented aliases keep working", () => {
  it("title/symptoms/platform/alarms map to canonical fields", async () => {
    const res = await POST(
      json({
        title: "Motor start failure",
        symptoms: "Motor does not start after the HMI start command",
        platform: "Siemens S7-1500",
        alarms: "A101 undervoltage",
        locale: "de",
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("an alias cannot bypass the minimum length", async () => {
    const res = await POST(json({ title: "ab", symptoms: "abcd" }));
    expect(res.status).toBe(400);
  });
});

describe("93B — the error response leaks nothing", () => {
  it("never echoes the rejected value", async () => {
    const secret = "SENSITIVE_PLANT_SECRET_9f3a";
    const res = await POST(json({ ...VALID, problemTitle: secret, safetyImpact: "BOGUS_" + secret }));
    const body = await res.text();
    expect(res.status).toBe(400);
    expect(body).not.toContain(secret);
  });

  it("returns the stable { ok, error } contract with a safe field name", async () => {
    const res = await POST(json({ ...VALID, problemTitle: "ab" }));
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(typeof data.error).toBe("string");
    expect(data.field).toBe("problemTitle");
    // no stack, no internals
    expect(JSON.stringify(data)).not.toMatch(/at\s|\.ts:|node_modules|ZodError/);
  });

  it("does not log the request body", async () => {
    const seen: string[] = [];
    const spies = (["log", "error", "warn", "info", "debug"] as const).map((m) => {
      const orig = console[m];
      console[m] = (...a: unknown[]) => { seen.push(a.map(String).join(" ")); };
      return () => { console[m] = orig; };
    });
    await POST(json({ ...VALID, observedSymptoms: "CONFIDENTIAL evidence about reactor R-12" }));
    await POST(json({ ...VALID, problemTitle: "ab" }));
    spies.forEach((restore) => restore());
    const all = seen.join(" ");
    expect(all).not.toContain("CONFIDENTIAL");
    expect(all).not.toContain("reactor R-12");
  });
});
