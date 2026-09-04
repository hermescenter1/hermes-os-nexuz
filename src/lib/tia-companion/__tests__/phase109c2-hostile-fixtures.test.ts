/**
 * PHASE 109-C2.0 — the hostile corpus.
 *
 * A contract that only ever sees well-formed input proves nothing. Each fixture
 * here is a specific thing an attacker or a broken producer would send, and each
 * assertion demands not merely a refusal but the RIGHT refusal: the stable code
 * an audit row would carry and an engineer would quote.
 *
 * A negative control runs alongside — the same shape, unmodified, must be
 * accepted — so a contract that refused everything could not pass this file.
 */

import { describe, expect, it } from "vitest";

import { bindCompileResult } from "../compile-result";
import { forbiddenCapabilityViolations } from "../contract";
import { TIA_DIAGNOSTIC_CODES } from "../diagnostics";
import { validateManifest } from "../package-manifest";
import { assertProvenance, createSnapshot } from "../snapshot";
import { TiaContractError } from "../contract";
import {
  HOSTILE_CAPABILITY_FIXTURES,
  HOSTILE_COMPILE_FIXTURES,
  HOSTILE_MANIFEST_FIXTURES,
  HOSTILE_PROVENANCE_FIXTURES,
  fixtureProvenance,
  PATH_CAFE_NFC,
  PATH_CAFE_NFD,
  validCompileResultInput,
  validManifestInput,
} from "../testing/fixtures";

async function fixtureSnapshot() {
  const result = validateManifest(validManifestInput());
  if (!result.ok) throw new Error("the positive fixture must validate");
  return createSnapshot({ manifest: result.manifest, provenance: fixtureProvenance() });
}

describe("109-C2.0 · hostile manifests", () => {
  it("the negative control: the unmodified fixture is accepted", () => {
    expect(validateManifest(validManifestInput()).ok).toBe(true);
  });

  it("the corpus covers every category the threat model names", () => {
    const ids = HOSTILE_MANIFEST_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const required of [
      "invalid-schema-version",
      "duplicate-canonical-path",
      "absolute-path",
      "drive-qualified-path",
      "path-traversal",
      "nul-byte-in-path",
      "path-length-exceeded",
      "path-depth-exceeded",
      "unknown-package-kind",
      "proprietary-archive-marked-unsupported",
      "path-not-nfc",
      "path-nfc-and-nfd-together",
    ]) {
      expect(ids, required).toContain(required);
    }
  });

  it("R2 · the two Unicode forms of one visible path cannot both be admitted", () => {
    const both = validManifestInput();
    both.entries = [
      { path: PATH_CAFE_NFC, kind: "source-block", declaredByteSize: 1, declaredSha256: "a1".repeat(32) },
      { path: PATH_CAFE_NFD, kind: "source-block", declaredByteSize: 1, declaredSha256: "b2".repeat(32) },
    ];
    const result = validateManifest(both);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((d) => d.code)).toContain(TIA_DIAGNOSTIC_CODES.PATH_NOT_NFC);

    // And the control: the precomposed form ALONE is fine, so this is a rule
    // about normalization rather than a refusal of accented paths.
    const onlyNfc = validManifestInput();
    onlyNfc.entries = [
      { path: PATH_CAFE_NFC, kind: "source-block", declaredByteSize: 1, declaredSha256: "a1".repeat(32) },
    ];
    expect(validateManifest(onlyNfc).ok).toBe(true);
  });

  it("carries no archive-limit fixture — those bounds were withdrawn", () => {
    // CORRECTION 3 removed the compression-ratio and total-uncompressed checks,
    // so the fixtures that exercised them are gone too. A fixture asserting a
    // rule that no longer exists is a test that passes for the wrong reason.
    const ids = HOSTILE_MANIFEST_FIXTURES.map((f) => f.id);
    expect(ids).not.toContain("compression-ratio-exceeded");
    expect(ids).not.toContain("declared-total-exceeds-bound");
    for (const fixture of HOSTILE_MANIFEST_FIXTURES) {
      expect(String(fixture.expectedCode), fixture.id).not.toBe("AES-C2-015");
    }
  });

  it.each(HOSTILE_MANIFEST_FIXTURES.map((f) => [f.id, f] as const))(
    "%s is refused with its own stable code",
    (_id, fixture) => {
      const result = validateManifest(fixture.build());
      expect(result.ok, `${fixture.id}: ${fixture.hostility}`).toBe(false);
      if (result.ok) return;
      const codes = result.diagnostics.map((d) => d.code);
      expect(codes, fixture.id).toContain(fixture.expectedCode);
    },
  );

  it("a proprietary archive is refused as unparsed, never as merely unknown", () => {
    const fixture = HOSTILE_MANIFEST_FIXTURES.find(
      (f) => f.id === "proprietary-archive-marked-unsupported",
    );
    expect(fixture).toBeDefined();
    const result = validateManifest((fixture as { build: () => unknown }).build());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The distinction matters to the engineer reading the finding: "we do not
    // open TIA archives" is actionable, "unknown input" is not.
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      TIA_DIAGNOSTIC_CODES.OPAQUE_ARCHIVE_NOT_PARSED,
    ]);
  });

  it("an unknown key is refused rather than silently stripped", () => {
    // Zod's default is to STRIP. A stripped field validates cleanly and arrives
    // gone, which for an integrity format means the same document hashes
    // differently depending on which schema read it.
    const smuggled = { ...validManifestInput(), allowControllerDownload: true };
    const result = validateManifest(smuggled);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.MALFORMED_MANIFEST);
  });

  it("reports every entry-level finding at once, not just the first", () => {
    const raw = validManifestInput();
    raw.entries = [
      { path: "/abs.scl", kind: "source-block", declaredByteSize: 1, declaredSha256: "a1".repeat(32) },
      { path: "../up.scl", kind: "source-block", declaredByteSize: 1, declaredSha256: "b2".repeat(32) },
    ];
    const result = validateManifest(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((d) => d.code).sort()).toEqual(
      [
        TIA_DIAGNOSTIC_CODES.ABSOLUTE_PATH_REJECTED,
        TIA_DIAGNOSTIC_CODES.PATH_TRAVERSAL_REJECTED,
      ].sort(),
    );
  });
});

describe("109-C2.0 · hostile compile results", () => {
  it("the negative control: a correctly bound result is accepted", async () => {
    const snapshot = await fixtureSnapshot();
    expect(bindCompileResult(validCompileResultInput(snapshot.contentSha256), snapshot).ok).toBe(
      true,
    );
  });

  it.each(HOSTILE_COMPILE_FIXTURES.map((f) => [f.id, f] as const))(
    "%s is refused with its own stable code",
    async (_id, fixture) => {
      const snapshot = await fixtureSnapshot();
      const binding = bindCompileResult(fixture.build(snapshot.contentSha256), snapshot);
      expect(binding.ok, `${fixture.id}: ${fixture.hostility}`).toBe(false);
      if (binding.ok) return;
      expect(binding.diagnostics.map((d) => d.code), fixture.id).toContain(fixture.expectedCode);
    },
  );

  it("R2 · MALFORMED and UNBOUND are never used for each other's failure", async () => {
    const snapshot = await fixtureSnapshot();

    // Structurally broken -> MALFORMED. Not UNBOUND: nothing about the binding
    // was even legible.
    const broken = bindCompileResult(
      { ...validCompileResultInput(snapshot.contentSha256), declaredAtEpochMs: -1 },
      snapshot,
    );
    expect(broken.ok).toBe(false);
    if (broken.ok) return;
    expect(broken.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.COMPILE_RESULT_MALFORMED);

    // Perfectly well formed, wrong project state -> UNBOUND. That is a replay,
    // and it deserves a different response from a producer bug.
    const replayed = bindCompileResult(
      { ...validCompileResultInput(snapshot.contentSha256), snapshotContentSha256: "0".repeat(64) },
      snapshot,
    );
    expect(replayed.ok).toBe(false);
    if (replayed.ok) return;
    expect(replayed.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.COMPILE_RESULT_UNBOUND);
  });

  it("R2 · a bidi override in display text is refused, not stripped", async () => {
    const snapshot = await fixtureSnapshot();
    const override = String.fromCodePoint(0x202e);
    const binding = bindCompileResult(
      {
        ...validCompileResultInput(snapshot.contentSha256),
        entries: [
          {
            structuralCode: "SCL-X",
            severityToken: "ERROR",
            entryPath: null,
            line: null,
            untrustedText: `safe${override}reversed`,
          },
        ],
      },
      snapshot,
    );
    expect(binding.ok).toBe(false);
    if (binding.ok) return;
    expect(binding.diagnostics[0].code).toBe(
      TIA_DIAGNOSTIC_CODES.UNSAFE_TEXT_CONTROL_CHARACTERS,
    );
    // Refused, so nothing was silently rewritten into an accepted finding.
    expect(binding.diagnostics[0].params.detail).toContain("U+202E");
  });

  it("R2 · Persian text with ZWNJ still binds — the rule is not anti-Persian", async () => {
    const snapshot = await fixtureSnapshot();
    const zwnj = String.fromCodePoint(0x200c);
    const binding = bindCompileResult(
      {
        ...validCompileResultInput(snapshot.contentSha256),
        entries: [
          {
            structuralCode: "SCL-X",
            severityToken: "ERROR",
            entryPath: null,
            line: null,
            untrustedText: `خطا: شناسه اعلام${zwnj}نشده`,
          },
        ],
      },
      snapshot,
    );
    expect(binding.ok).toBe(true);
  });

  it("R3 · declaredBy and toolDeclaration keep their exact bytes", async () => {
    // `.trim()` in Zod is a TRANSFORM, not a check: it silently rewrote
    // "  Engineer A  " to "Engineer A", so the value recorded was not the value
    // submitted. For a field whose whole purpose is to say who claimed something,
    // that is evidence tampering by the validator.
    const snapshot = await fixtureSnapshot();
    const binding = bindCompileResult(
      {
        ...validCompileResultInput(snapshot.contentSha256),
        declaredBy: "  Engineer A  ",
        toolDeclaration: "  TIA producer  ",
      },
      snapshot,
    );
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    expect(binding.result.declaredBy).toBe("  Engineer A  ");
    expect(binding.result.toolDeclaration).toBe("  TIA producer  ");
  });

  it.each([
    ["declaredBy", ""],
    ["declaredBy", " "],
    ["declaredBy", "\t"],
    ["declaredBy", "\n"],
    ["toolDeclaration", ""],
    ["toolDeclaration", " "],
    ["toolDeclaration", "\t"],
    ["toolDeclaration", "\n"],
  ])("R3 · %s = %j is refused as MALFORMED", async (field, value) => {
    // Blankness is judged with trim() and the trimmed value is never stored:
    // "is this filled in" and "which bytes are the evidence" are different
    // questions, and only the first is trim's business.
    const snapshot = await fixtureSnapshot();
    const binding = bindCompileResult(
      { ...validCompileResultInput(snapshot.contentSha256), [field]: value },
      snapshot,
    );
    expect(binding.ok).toBe(false);
    if (binding.ok) return;
    expect(binding.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.COMPILE_RESULT_MALFORMED);
    expect(binding.diagnostics[0].params.field).toBe(field);
  });

  it.each(["declaredBy", "toolDeclaration"])(
    "R3 · %s beyond 191 characters is MALFORMED, and a missing one too",
    async (field) => {
      const snapshot = await fixtureSnapshot();
      const oversized = bindCompileResult(
        { ...validCompileResultInput(snapshot.contentSha256), [field]: "x".repeat(192) },
        snapshot,
      );
      expect(oversized.ok).toBe(false);
      if (oversized.ok) return;
      expect(oversized.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.COMPILE_RESULT_MALFORMED);

      const raw = validCompileResultInput(snapshot.contentSha256);
      delete raw[field];
      const missing = bindCompileResult(raw, snapshot);
      expect(missing.ok).toBe(false);
      if (missing.ok) return;
      expect(missing.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.COMPILE_RESULT_MALFORMED);
    },
  );

  it.each(["declaredBy", "toolDeclaration"])(
    "R3 · unsafe characters in %s stay AES-C2-021, not AES-C2-020",
    async (field) => {
      // The two failures must not collapse: one says "you sent nothing", the
      // other says "you sent something a renderer must not be handed".
      const snapshot = await fixtureSnapshot();
      for (const cp of [0x202e, 0x0007, 0x200f]) {
        const binding = bindCompileResult(
          {
            ...validCompileResultInput(snapshot.contentSha256),
            [field]: `name${String.fromCodePoint(cp)}spoof`,
          },
          snapshot,
        );
        expect(binding.ok, `U+${cp.toString(16)}`).toBe(false);
        if (binding.ok) return;
        expect(binding.diagnostics[0].code, `U+${cp.toString(16)}`).toBe(
          TIA_DIAGNOSTIC_CODES.UNSAFE_TEXT_CONTROL_CHARACTERS,
        );
        expect(binding.diagnostics[0].params.field).toBe(field);
      }
    },
  );

  it("R3 · a padded Persian declarer with ZWNJ is accepted, bytes intact", async () => {
    const snapshot = await fixtureSnapshot();
    const zwnj = String.fromCodePoint(0x200c);
    const declarer = `  مهندس اعلام${zwnj}کننده  `;
    const binding = bindCompileResult(
      { ...validCompileResultInput(snapshot.contentSha256), declaredBy: declarer },
      snapshot,
    );
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    expect(binding.result.declaredBy).toBe(declarer);
  });

  it("a result claiming stronger evidence is named as exactly that", async () => {
    const snapshot = await fixtureSnapshot();
    const binding = bindCompileResult(
      { ...validCompileResultInput(snapshot.contentSha256), compileEvidence: "VERIFIED" },
      snapshot,
    );
    expect(binding.ok).toBe(false);
    if (binding.ok) return;
    expect(binding.diagnostics[0].code).toBe(
      TIA_DIAGNOSTIC_CODES.COMPILE_EVIDENCE_NOT_DECLARED,
    );
    expect(binding.diagnostics[0].params.permitted).toBe("DECLARED");
  });

  it("a finding pointing outside the package is refused, not silently blanked", async () => {
    const snapshot = await fixtureSnapshot();
    const binding = bindCompileResult(
      {
        ...validCompileResultInput(snapshot.contentSha256),
        entries: [
          {
            structuralCode: "SCL-X",
            severityToken: "ERROR",
            entryPath: "../../../../etc/passwd",
            line: 1,
            untrustedText: "synthetic",
          },
        ],
      },
      snapshot,
    );
    expect(binding.ok).toBe(false);
    if (binding.ok) return;
    // Blanking the path would destroy the evidence that a producer emitted it.
    expect(binding.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.PATH_TRAVERSAL_REJECTED);
    expect(binding.diagnostics[0].entryPath).toBe("../../../../etc/passwd");
  });
});

describe("109-C2.0 · hostile capability declarations", () => {
  it("the negative control: a fully compliant record reports no violation", () => {
    const compliant = {
      canConnectToController: false,
      canDownloadToController: false,
      canUploadFromController: false,
      canWriteTags: false,
      canExecuteCompile: false,
      canInvokeOpenness: false,
      canLaunchExternalProcess: false,
    };
    expect(forbiddenCapabilityViolations(compliant)).toEqual([]);
  });

  it.each(HOSTILE_CAPABILITY_FIXTURES.map((f) => [f.id, f] as const))(
    "%s is caught by the runtime guard",
    (_id, fixture) => {
      const violations = forbiddenCapabilityViolations(fixture.build());
      expect(violations.length, `${fixture.id}: ${fixture.hostility}`).toBeGreaterThan(0);
    },
  );
});

describe("109-C2.0 · hostile provenance", () => {
  it("the negative control: the fixture provenance is admitted", () => {
    expect(() => assertProvenance(fixtureProvenance())).not.toThrow();
  });

  it.each(HOSTILE_PROVENANCE_FIXTURES.map((f) => [f.id, f] as const))(
    "%s is refused with its own stable code",
    (_id, fixture) => {
      let caught: unknown = null;
      try {
        assertProvenance(fixture.build());
      } catch (error) {
        caught = error;
      }
      expect(caught, `${fixture.id}: ${fixture.hostility}`).toBeInstanceOf(TiaContractError);
      expect((caught as TiaContractError).code, fixture.id).toBe(fixture.expectedCode);
    },
  );

  it("both live origins are refused, and the refusal names the origin rule", () => {
    for (const origin of ["live-readonly", "live-controlled"]) {
      expect(() => assertProvenance({ ...fixtureProvenance(), origin })).toThrow(
        /AES-C2-014/,
      );
    }
  });
});
