import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  classifyAssignment,
  classifyEnvExample,
  formatReport,
} from "../check-env-example.mjs";

// All fixture "secrets" below are unmistakably synthetic and never real. They
// exercise the detector's classification tokens; the detector never echoes a
// value, so a passing run prints nothing sensitive.

describe("check-env-example classifier", () => {
  it("flags known provider key formats", () => {
    expect(classifyAssignment("STRIPE_SECRET_KEY", "sk_live_SYNTHETICKEY0000000000")).toBe("PROVIDER_KEY_FORMAT");
    expect(classifyAssignment("RESEND_API_KEY", "re_SYNTHETIC00000000000000")).toBe("PROVIDER_KEY_FORMAT");
  });

  it("flags JWT-like tokens", () => {
    expect(
      classifyAssignment("SOME_TOKEN", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c3ludGhldGljc2ln"),
    ).toBe("JWT_LIKE_TOKEN");
  });

  it("flags private-key material", () => {
    expect(
      classifyAssignment("TLS_PRIVATE_KEY", "-----BEGIN RSA PRIVATE KEY-----SYNTHETIC"),
    ).toBe("PRIVATE_KEY_MATERIAL");
  });

  it("flags a high-entropy value on a secret-shaped variable", () => {
    expect(classifyAssignment("JWT_ACCESS_SECRET", "Zx9Kq2Lm8Pv4Wn7Rt5Yb3Hc6Jd1Fg0Aa")).toBe(
      "NON_PLACEHOLDER_SECRET_VALUE",
    );
  });

  it("flags an embedded database password even behind a local host", () => {
    expect(
      classifyAssignment("DATABASE_URL", "postgresql://u:S3cretPw9xZ@127.0.0.1:5432/app"),
    ).toBe("EMBEDDED_DATABASE_PASSWORD");
  });

  it("flags a production host in a URL variable", () => {
    expect(classifyAssignment("APP_URL", "https://app.synthetic-corp.com")).toBe("PRODUCTION_HOST_OR_IP");
  });

  it("permits documentation placeholders", () => {
    expect(classifyAssignment("JWT_ACCESS_SECRET", "REPLACE_WITH_RANDOM_SECRET_BEFORE_USE")).toBeNull();
    expect(
      classifyAssignment("DATABASE_URL", "postgresql://hermes:REPLACE_WITH_LOCAL_PASSWORD@127.0.0.1:5432/hermes_example"),
    ).toBeNull();
  });

  it("permits intentionally empty provider keys", () => {
    expect(classifyAssignment("ANTHROPIC_API_KEY", "")).toBeNull();
  });

  it("permits safe non-secret literals and local URLs", () => {
    expect(classifyAssignment("NODE_ENV", "development")).toBeNull();
    expect(classifyAssignment("APP_URL", "http://localhost:3000")).toBeNull();
    expect(classifyAssignment("REDIS_URL", "redis://127.0.0.1:6379")).toBeNull();
    expect(classifyAssignment("EMAIL_FROM", "noreply@example.com")).toBeNull();
  });

  it("aggregates violations without leaking values in the report", () => {
    const synthetic = [
      "NODE_ENV=development",
      "STRIPE_SECRET_KEY=sk_live_SYNTHETICKEY0000000000",
      "JWT_ACCESS_SECRET=REPLACE_WITH_RANDOM_SECRET_BEFORE_USE",
    ].join("\n");
    const result = classifyEnvExample(synthetic);
    expect(result.scanned).toBe(3);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].variable).toBe("STRIPE_SECRET_KEY");

    const report = formatReport(result);
    expect(report).toContain("ENV_EXAMPLE_CHECK=FAIL");
    expect(report).toContain("VARIABLE=STRIPE_SECRET_KEY");
    expect(report).toContain("CLASSIFICATION=PROVIDER_KEY_FORMAT");
    // The report must never contain the value or any substring of it.
    expect(report).not.toContain("sk_live_");
    expect(report).not.toContain("SYNTHETICKEY");
  });
});

describe("tracked .env.example", () => {
  it("contains zero secret-like values (ENV_EXAMPLE_SECRET_LIKE_VALUE=0)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.resolve(here, "../../../.env.example");
    const text = readFileSync(envPath, "utf8");
    const result = classifyEnvExample(text);
    // On failure, surface only variable names + classifications — never values.
    const names = result.violations.map((v) => `${v.variable}:${v.classification}`);
    expect(names).toEqual([]);
    expect(result.violations).toHaveLength(0);
  });
});
