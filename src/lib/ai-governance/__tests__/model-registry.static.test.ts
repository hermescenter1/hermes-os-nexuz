import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  MODEL_REGISTRY,
  PRODUCTION_MODEL_ID_PATTERNS,
  registeredModelIdSet,
} from "../model-registry";
import { EXTERNAL_REVIEW_REQUIRED } from "../types";

/**
 * PHASE 95 — MODEL_INVENTORY gate. The registry is the single source of truth;
 * this static test fails the build if any production model identifier appears in
 * executable code but is absent from the registry.
 */

const SRC = resolve(__dirname, "..", "..", "..", "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      // Skip the governance package itself — it DEFINES the registered ids.
      if (full.replace(/\\/g, "/").endsWith("/lib/ai-governance")) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("95 — model registry completeness (MODEL_INVENTORY gate)", () => {
  it("registers every production model identifier that appears in executable code", () => {
    const registered = registeredModelIdSet();
    const files = walk(SRC);
    const unregistered = new Map<string, string>();

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const basePattern of PRODUCTION_MODEL_ID_PATTERNS) {
        const pattern = new RegExp(basePattern.source, "g");
        for (const m of text.matchAll(pattern)) {
          const id = m[0];
          if (!registered.has(id) && !unregistered.has(id)) {
            unregistered.set(id, file.replace(/\\/g, "/"));
          }
        }
      }
    }

    // UNREGISTERED_PRODUCTION_MODEL_IDS must be 0.
    expect([...unregistered.entries()]).toEqual([]);
  });

  it("has unique registryIds and modelIds", () => {
    const regIds = MODEL_REGISTRY.map((e) => e.registryId);
    const modelIds = MODEL_REGISTRY.map((e) => e.modelId);
    expect(new Set(regIds).size).toBe(regIds.length);
    expect(new Set(modelIds).size).toBe(modelIds.length);
  });

  it("external entries are deny-by-default and require a tenant policy", () => {
    for (const e of MODEL_REGISTRY.filter((x) => x.external)) {
      expect(e.defaultEnabled).toBe(false);
      expect(e.tenantPolicyRequired).toBe(true);
      expect(e.toolCallingAllowed).toBe(false);
      // Unknown legal facts are declared, never invented.
      expect(e.retentionPolicyStatus).toBe(EXTERNAL_REVIEW_REQUIRED);
      expect(e.trainingUseStatus).toBe(EXTERNAL_REVIEW_REQUIRED);
      expect(e.regionStatus).toBe(EXTERNAL_REVIEW_REQUIRED);
    }
  });

  it("internal deterministic engines never allow tool calling and are hermes-controlled", () => {
    for (const e of MODEL_REGISTRY.filter((x) => x.providerType === "internal_deterministic")) {
      expect(e.external).toBe(false);
      expect(e.toolCallingAllowed).toBe(false);
      expect(e.regionStatus).toBe("hermes-controlled");
    }
  });
});
