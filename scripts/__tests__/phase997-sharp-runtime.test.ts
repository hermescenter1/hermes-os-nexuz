/**
 * PHASE 99.7 — the `sharp` runtime gate.
 *
 * `sharp@0.35.3` is pinned deliberately and must not be downgraded. Its
 * prebuilt linux binaries require an x86-64-v2 CPU (SSE4.2), and the library
 * reaches the runtime image only through Next's standalone file trace — so a
 * host or image that cannot load it fails at the FIRST image request, long
 * after `/api/health` has been reporting 200.
 *
 * These tests cover both halves: the CPU classification is pure and must never
 * invent a pass, and the runtime smoke must really move image bytes.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REQUIRED_CPU_FLAG, classifyCpuPrerequisite, runSharpRuntimeSmoke } from "../dr/sharp-runtime-gate.mjs";

const CPUINFO_WITH_SSE42 = ["processor\t: 0", "flags\t\t: fpu vme de pse tsc msr sse sse2 ssse3 sse4_1 sse4_2 popcnt", ""].join("\n");
const CPUINFO_WITHOUT_SSE42 = ["processor\t: 0", "flags\t\t: fpu vme de pse tsc msr sse sse2 ssse3 sse4_1 popcnt", ""].join("\n");

describe("PHASE997_SHARP_CPU_CLASSIFICATION", () => {
  it("passes on linux/x64 when the CPU advertises SSE4.2", () => {
    const r = classifyCpuPrerequisite({ platform: "linux", arch: "x64", cpuinfo: CPUINFO_WITH_SSE42 });
    expect(r.classification).toBe("PASS");
  });

  it("fails on linux/x64 when the CPU lacks SSE4.2", () => {
    const r = classifyCpuPrerequisite({ platform: "linux", arch: "x64", cpuinfo: CPUINFO_WITHOUT_SSE42 });
    expect(r.classification).toBe("FAIL");
    expect(r.reason).toContain(REQUIRED_CPU_FLAG);
  });

  it("is UNKNOWN — never PASS — when /proc/cpuinfo cannot be read", () => {
    for (const cpuinfo of [null, ""]) {
      expect(classifyCpuPrerequisite({ platform: "linux", arch: "x64", cpuinfo }).classification).toBe("UNKNOWN");
    }
  });

  it("is UNKNOWN when /proc/cpuinfo carries no flags line", () => {
    const r = classifyCpuPrerequisite({ platform: "linux", arch: "x64", cpuinfo: "processor\t: 0\nmodel name\t: Fake\n" });
    expect(r.classification).toBe("UNKNOWN");
  });

  it("does not match a flag by substring", () => {
    // `sse4_2x` is a different token and must not satisfy the requirement.
    const r = classifyCpuPrerequisite({ platform: "linux", arch: "x64", cpuinfo: "flags\t\t: sse4_1 sse4_2x\n" });
    expect(r.classification).toBe("FAIL");
  });

  it("is NOT_APPLICABLE off linux/x64 rather than pretending to have checked", () => {
    for (const [platform, arch] of [
      ["linux", "arm64"],
      ["darwin", "arm64"],
      ["win32", "x64"],
    ]) {
      const r = classifyCpuPrerequisite({ platform, arch, cpuinfo: CPUINFO_WITHOUT_SSE42 });
      expect(r.classification).toBe("NOT_APPLICABLE");
    }
  });
});

describe("PHASE997_SHARP_RUNTIME_SMOKE", () => {
  it("imports sharp, decodes and transforms a synthetic image", async () => {
    const r = await runSharpRuntimeSmoke();
    expect(r.error).toBeNull();
    expect(r.imported).toBe(true);
    expect(r.decoded).toBe(true);
    expect(r.transformed).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("reports the resolved sharp version, which must stay on the pinned 0.35 line", async () => {
    const r = await runSharpRuntimeSmoke();
    // The pin is the Phase 99 remediation; a downgrade would reintroduce the
    // advisory this repository already closed.
    expect(r.sharpVersion).toMatch(/^0\.35\./);
  });

  it("the pinned override in package.json is not weakened", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.overrides?.sharp).toBeDefined();
    const [major, minor] = String(pkg.overrides.sharp).split(".").map(Number);
    expect(major).toBeGreaterThanOrEqual(0);
    expect(major > 0 || minor >= 35).toBe(true);
  });
});
