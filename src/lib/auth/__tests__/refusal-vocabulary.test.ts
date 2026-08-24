/**
 * PHASE 107 FINAL — one machine vocabulary, and it must stay one.
 *
 * Independent copies of the refusal-code list lived in the browser client, the
 * AST detector and the probe classifier. They had already drifted:
 * `INTERNAL_FAILURE` — which `src/lib/ot-edge/http/route-kit.ts` genuinely
 * emits — was known to the detector and unknown to the client, so that refusal
 * could not be decoded from the `error` field and reached the reader as a
 * generic "something went wrong".
 *
 * These tests hold the two properties that matter: a machine code is recognised
 * exactly, and a human sentence never is.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  MACHINE_REFUSAL_CODES,
  MACHINE_REFUSAL_CODE_SET,
  isMachineRefusalCode,
} from "../refusal-vocabulary";

describe("the machine refusal vocabulary", () => {
  it("recognises an exact known code", () => {
    expect(isMachineRefusalCode("ORGANIZATION_CONTEXT_REQUIRED")).toBe(true);
    expect(isMachineRefusalCode("INTERNAL_FAILURE")).toBe(true);
  });

  it("accepts the lower-case spelling the Media upload family emits", () => {
    // `deny(status, "authentication_required")` puts the code in `error`.
    expect(isMachineRefusalCode("authentication_required")).toBe(true);
  });

  it("rejects an identifier that is not in the list", () => {
    expect(isMachineRefusalCode("SOMETHING_ELSE_REQUIRED")).toBe(false);
    expect(isMachineRefusalCode("ORGANIZATION")).toBe(false);
  });

  it("never promotes a human sentence, however similar the words", () => {
    // The space is what keeps prose prose. This is the whole defence against a
    // reworded message silently re-routing the reader.
    expect(isMachineRefusalCode("Authentication required")).toBe(false);
    expect(isMachineRefusalCode("Organization context required")).toBe(false);
    expect(isMachineRefusalCode("Authentication required to continue")).toBe(false);
  });

  it("rejects non-strings and empties", () => {
    for (const v of [undefined, null, 0, 401, {}, [], ""]) {
      expect(isMachineRefusalCode(v)).toBe(false);
    }
  });

  it("contains no entry with whitespace — prose could never match", () => {
    for (const c of MACHINE_REFUSAL_CODES) expect(c).not.toMatch(/\s/);
  });

  it("has no duplicates", () => {
    expect(MACHINE_REFUSAL_CODE_SET.size).toBe(MACHINE_REFUSAL_CODES.length);
  });

  /*
   * The drift test. A second literal list is exactly what went wrong, so its
   * absence is asserted rather than assumed: the browser client must IMPORT the
   * vocabulary and must not declare a set of refusal codes of its own.
   */
  it("the browser client imports the vocabulary rather than re-listing it", () => {
    const src = fs.readFileSync("src/lib/client/resource-request.ts", "utf8");
    expect(src).toContain('from "@/lib/auth/refusal-vocabulary"');

    // `[^\]]*` already spans newlines, so the dotAll flag is unnecessary — and it
    // is unavailable at this project's TypeScript target.
    const declaresOwnList = /new Set\(\[[^\]]*"(?:AUTHENTICATION_REQUIRED|ORGANIZATION_CONTEXT_REQUIRED|UNAUTHENTICATED)"/;
    expect(declaresOwnList.test(src)).toBe(false);
  });

  it("the AST detector derives its vocabulary from this file", () => {
    const src = fs.readFileSync("docs/design/stage6a/refusal-sites.mjs", "utf8");
    expect(src).toContain("src/lib/auth/refusal-vocabulary.ts");
    // It must not contain a hand-written copy of the codes.
    const hardCodedList = /VOCABULARY = new Set\(\[\s*"/;
    expect(hardCodedList.test(src)).toBe(false);
  });

  it("every code the OT route-kit can emit is in the vocabulary", () => {
    // The drift that actually happened: route-kit emits INTERNAL_FAILURE.
    const src = fs.readFileSync("src/lib/ot-edge/http/route-kit.ts", "utf8");
    const emitted = [...src.matchAll(/"([A-Z][A-Z_]{4,})"/g)].map((m) => m[1]);
    const refusalish = emitted.filter((c) => /REQUIRED|FAILURE|FORBIDDEN|UNAUTHENTICATED|ERROR/.test(c));
    expect(refusalish.length).toBeGreaterThan(0);
    for (const c of refusalish) expect(MACHINE_REFUSAL_CODE_SET.has(c)).toBe(true);
  });
});
