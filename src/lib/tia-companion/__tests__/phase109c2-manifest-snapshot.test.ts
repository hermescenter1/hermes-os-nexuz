/**
 * PHASE 109-C2.0 — manifest validation, snapshot identity, compile binding.
 *
 * The positive path, and the properties that make the positive path worth
 * anything: that two orderings of one package produce one digest, that changing
 * a byte moves the digest, and that a compile result cannot be replayed against
 * a project state it does not describe.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { normalizeIdentifier } from "@/lib/ot-edge/import-envelope";

import * as compileModule from "../compile-result";
import {
  bindCompileResult,
  COMPILE_EVIDENCE,
  compileCountBySeverity,
  severityOfToken,
} from "../compile-result";
import {
  admitValidatedManifest,
  canonicaliseManifest,
  canonicalManifestValue,
  EXACT_ENTRY_KEYS,
  EXACT_MANIFEST_KEYS,
  EXACT_PROJECT_KEYS,
  isValidatedManifest,
  manifestContentSha256,
  manifestInvariantViolations,
  validateManifest,
  type ValidatedTiaPackageManifest,
} from "../package-manifest";
import {
  assertProvenance,
  createSnapshot,
  EXACT_PROVENANCE_KEYS,
  EXACT_SNAPSHOT_KEYS,
  snapshotIdentityValue,
  verifySnapshot,
} from "../snapshot";
import { canonicalSha256, isSha256Hex } from "../canonical";
import { TIA_DIAGNOSTIC_CODES } from "../diagnostics";
import {
  EXPECTED_CANONICAL_ENTRY_ORDER,
  FIXTURE_DISCLOSURE,
  FIXTURE_EPOCH_MS,
  fixtureProvenance,
  localisedCompileResultInputs,
  validCompileResultInput,
  validManifestInput,
  validManifestInputReordered,
} from "../testing/fixtures";

function mustValidate(raw: unknown) {
  const result = validateManifest(raw);
  if (!result.ok) {
    throw new Error(
      `fixture failed validation: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  }
  return result.manifest;
}

async function snapshotOfFixture() {
  return createSnapshot({
    manifest: mustValidate(validManifestInput()),
    provenance: fixtureProvenance(),
  });
}

describe("109-C2.0 · manifest validation, positive path", () => {
  it("accepts the offline fixture", () => {
    const result = validateManifest(validManifestInput());
    expect(result.ok).toBe(true);
  });

  it("normalises separators and re-sorts entries into canonical order", () => {
    const manifest = mustValidate(validManifestInput());
    expect(manifest.entries.map((e) => e.path)).toEqual([...EXPECTED_CANONICAL_ENTRY_ORDER]);
  });

  it("derives a locale-independent project identity key", () => {
    const manifest = mustValidate(validManifestInput());
    // "Line 12  Bottling" — the double space and the case are folded away, so
    // two exports of one project are one identity.
    expect(manifest.project.normalizedName).toBe("LINE_12_BOTTLING");
    expect(manifest.project.name).toBe("Line 12  Bottling");
  });

  it("returns a frozen value, entries included", () => {
    const manifest = mustValidate(validManifestInput());
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.entries)).toBe(true);
    expect(Object.isFrozen(manifest.entries[0])).toBe(true);
  });
});

describe("109-C2.0 · the canonical form identifies content, not serialisation", () => {
  it("two orderings of one package produce identical bytes and one digest", async () => {
    const a = mustValidate(validManifestInput());
    const b = mustValidate(validManifestInputReordered());
    expect(canonicaliseManifest(a)).toBe(canonicaliseManifest(b));
    expect(await manifestContentSha256(a)).toBe(await manifestContentSha256(b));
  });

  it("is stable across repeated calls", async () => {
    const manifest = mustValidate(validManifestInput());
    const first = await manifestContentSha256(manifest);
    const second = await manifestContentSha256(manifest);
    expect(first).toBe(second);
    expect(isSha256Hex(first)).toBe(true);
  });

  it("a single mutated field moves the digest", async () => {
    const base = await manifestContentSha256(mustValidate(validManifestInput()));

    const mutations: readonly [string, () => Record<string, unknown>][] = [
      [
        "an entry digest",
        () => {
          const raw = validManifestInput();
          const entries = raw.entries as Record<string, unknown>[];
          entries[0] = { ...entries[0], declaredSha256: "f".repeat(64) };
          return raw;
        },
      ],
      [
        "an entry size",
        () => {
          const raw = validManifestInput();
          const entries = raw.entries as Record<string, unknown>[];
          entries[0] = { ...entries[0], declaredByteSize: 4_097 };
          return raw;
        },
      ],
      [
        "the project revision",
        () => ({ ...validManifestInput(), project: { name: "Line 12  Bottling", revision: 4 } }),
      ],
      ["the source-bytes digest", () => ({ ...validManifestInput(), sourceBytesSha256: "0".repeat(64) })],
      [
        "the declared container extension",
        () => ({ ...validManifestInput(), declaredContainerExtension: ".manifest" }),
      ],
    ];

    for (const [label, build] of mutations) {
      const mutated = await manifestContentSha256(mustValidate(build()));
      expect(mutated, label).not.toBe(base);
    }
  });

  it("the declared extension is inside the digest — evidence outside it is changeable", async () => {
    // Listed explicitly because it is the field most likely to be dismissed as
    // cosmetic. It is an assertion by the producer, and an assertion excluded
    // from the digest can be rewritten without invalidating anything.
    const base = await manifestContentSha256(mustValidate(validManifestInput()));
    const changed = await manifestContentSha256(
      mustValidate({ ...validManifestInput(), declaredContainerExtension: ".zzz" }),
    );
    expect(changed).not.toBe(base);
  });
});

describe("109-C2.0 R2 · the admission boundary is enforced at RUNTIME", () => {
  /**
   * Forge a manifest that is structurally perfect and never went through the
   * validator. This is the object an `as` cast produces, and the object R1
   * wrongly claimed could not exist.
   */
  function forge(patch: Record<string, unknown> = {}): ValidatedTiaPackageManifest {
    const real = mustValidate(validManifestInput());
    return {
      ...(JSON.parse(JSON.stringify(real)) as object),
      ...patch,
    } as unknown as ValidatedTiaPackageManifest;
  }

  it("a structurally identical cast object is REFUSED", async () => {
    // TypeScript is structurally typed and `as` erases what little it promised,
    // so the type could never have been the boundary. The WeakSet is.
    const forged = forge();
    expect(isValidatedManifest(forged)).toBe(false);
    const verdict = admitValidatedManifest(forged);
    expect(verdict.ok).toBe(false);
    await expect(
      createSnapshot({ manifest: forged, provenance: fixtureProvenance() }),
    ).rejects.toThrow(/AES-C2-016/);
  });

  it("even a JSON round-trip of a genuine manifest is refused", async () => {
    // Byte-for-byte equal content, different object. Membership is a property of
    // the value's identity, not of its shape — which is the entire point.
    const real = mustValidate(validManifestInput());
    const copy = JSON.parse(JSON.stringify(real)) as ValidatedTiaPackageManifest;
    expect(copy).toEqual(real);
    expect(isValidatedManifest(real)).toBe(true);
    expect(isValidatedManifest(copy)).toBe(false);
    await expect(
      createSnapshot({ manifest: copy, provenance: fixtureProvenance() }),
    ).rejects.toThrow(/AES-C2-016/);
  });

  it("a spread copy loses admission", () => {
    const real = mustValidate(validManifestInput());
    expect(isValidatedManifest({ ...real })).toBe(false);
  });

  it.each([
    [
      "malformed project identity",
      { project: { name: "", normalizedName: "", revision: 0 } },
    ],
    [
      "normalizedName that does not derive from name",
      { project: { name: "Line 12  Bottling", normalizedName: "SOMETHING_ELSE", revision: 3 } },
    ],
    [
      "duplicate entry paths",
      {
        entries: [
          { path: "a/x.scl", kind: "source-block", declaredByteSize: 1, declaredSha256: "a1".repeat(32) },
          { path: "a/x.scl", kind: "source-block", declaredByteSize: 1, declaredSha256: "b2".repeat(32) },
        ],
      },
    ],
    [
      "entries out of canonical order",
      {
        entries: [
          { path: "z/last.scl", kind: "source-block", declaredByteSize: 1, declaredSha256: "a1".repeat(32) },
          { path: "a/first.scl", kind: "source-block", declaredByteSize: 1, declaredSha256: "b2".repeat(32) },
        ],
      },
    ],
    [
      "a non-canonical entry path",
      {
        entries: [
          { path: "../escape.scl", kind: "source-block", declaredByteSize: 1, declaredSha256: "a1".repeat(32) },
        ],
      },
    ],
    [
      "an invalid entry digest",
      {
        entries: [
          { path: "a/x.scl", kind: "source-block", declaredByteSize: 1, declaredSha256: "NOTAHASH" },
        ],
      },
    ],
    ["a forbidden package kind", { packageKind: "opaque-archive" }],
    ["an unsupported schema version", { schemaVersion: "9.9" }],
    ["a malformed sourceBytesSha256", { sourceBytesSha256: "nope" }],
  ])("the defensive invariants also catch %s", (_label, patch) => {
    const forged = forge(patch);
    // Refused twice over: not in the register, AND independently unsound. The
    // second is what would still hold if a future refactor mishandled the first.
    expect(admitValidatedManifest(forged).ok).toBe(false);
    expect(manifestInvariantViolations(forged).length).toBeGreaterThan(0);
  });

  it("extra unknown fields are refused at validation, before admission arises", () => {
    const result = validateManifest({ ...validManifestInput(), executeOnImport: "cmd" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.MALFORMED_MANIFEST);
  });

  it("the genuine article passes both gates — the boundary is not simply closed", () => {
    const real = mustValidate(validManifestInput());
    expect(isValidatedManifest(real)).toBe(true);
    expect(manifestInvariantViolations(real)).toEqual([]);
    expect(admitValidatedManifest(real).ok).toBe(true);
  });

  it("the public barrel exposes no way to grant the brand", async () => {
    // If anything here could mint admission, the boundary would be decorative.
    const barrel = (await import("..")) as Record<string, unknown>;
    for (const name of Object.keys(barrel)) {
      expect(name, name).not.toMatch(/^(mark|brand|as|make|force|trust)Validated/i);
    }
    for (const forbidden of ["VALIDATED_MANIFESTS", "markValidated", "asValidated", "brandManifest"]) {
      expect(barrel, forbidden).not.toHaveProperty(forbidden);
    }
    // The only producer is exported, and it is a validator.
    expect(typeof barrel.validateManifest).toBe("function");
  });

  it("verification does NOT consult the register — the two boundaries differ", async () => {
    // R2 routed verification through the WeakSet, so this exact value was
    // reported malformed. That was a durability defect: the manifest is a
    // structurally perfect copy, the digests match it, and it IS internally
    // sound. Construction refuses it (that is the register's job); verification
    // accepts it, because "is this sound?" is a different question from "did
    // this come out of our validator in this process?".
    const real = await snapshotOfFixture();
    const soundCopy = { ...real, manifest: forge() };
    expect(isValidatedManifest(soundCopy.manifest)).toBe(false);

    const verdict = await verifySnapshot(soundCopy);
    expect(verdict.ok).toBe(true);

    // …and the construction boundary is untouched by that.
    await expect(
      createSnapshot({ manifest: soundCopy.manifest, provenance: fixtureProvenance() }),
    ).rejects.toThrow(/AES-C2-016/);
  });

  it("verifySnapshot still refuses a snapshot whose manifest is genuinely unsound", async () => {
    const real = await snapshotOfFixture();
    const verdict = await verifySnapshot({ ...real, manifest: forge({ packageKind: "opaque-archive" }) });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.MALFORMED_MANIFEST);
  });

  it("verifySnapshot refuses a value that is not a snapshot at all", async () => {
    for (const value of [null, undefined, 42, "snapshot", {}]) {
      const verdict = await verifySnapshot(value);
      expect(verdict.ok, String(value)).toBe(false);
    }
  });
});

describe("109-C2.0 R5 · a verified snapshot is detached and deeply frozen", () => {
  /** The value a caller would realistically hand in: off a wire, fully mutable. */
  async function wireCopy() {
    const snapshot = await snapshotOfFixture();
    return { snapshot, wireValue: JSON.parse(JSON.stringify(snapshot)) };
  }

  it("A · the returned snapshot shares no object with the caller's input", async () => {
    // R4 returned the caller's own object on success. `JSON.parse` produces
    // mutable objects and `readonly` is erased at runtime, so the verdict decayed
    // the moment it was issued: the holder could edit the value it had just been
    // told was verified.
    const { wireValue } = await wireCopy();
    const verified = await verifySnapshot(wireValue);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    expect(verified.snapshot).not.toBe(wireValue);
    expect(verified.snapshot.manifest).not.toBe(wireValue.manifest);
    expect(verified.snapshot.provenance).not.toBe(wireValue.provenance);
    expect(verified.snapshot.manifest.project).not.toBe(wireValue.manifest.project);
    expect(verified.snapshot.manifest.entries).not.toBe(wireValue.manifest.entries);
    verified.snapshot.manifest.entries.forEach((entry, i) => {
      expect(entry, `entry ${i}`).not.toBe(wireValue.manifest.entries[i]);
    });

    // Detached, but not different: every value carried across exactly.
    expect(verified.snapshot).toEqual(wireValue);
  });

  it("A · exact values survive the copy — bytes, order and numbers", async () => {
    const raw = validManifestInput();
    raw.project = { name: "  Line 12   Bottling  ", revision: 3 };
    const snapshot = await createSnapshot({
      manifest: mustValidate(raw),
      provenance: fixtureProvenance(),
    });
    const verified = await verifySnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    expect(verified.snapshot.manifest.project.name).toBe("  Line 12   Bottling  ");
    expect(verified.snapshot.provenance.disclosure).toBe(FIXTURE_DISCLOSURE);
    expect(verified.snapshot.provenance.recordedAtEpochMs).toBe(FIXTURE_EPOCH_MS);
    expect(verified.snapshot.manifest.entries.map((e) => e.path)).toEqual([
      ...EXPECTED_CANONICAL_ENTRY_ORDER,
    ]);
    expect(verified.snapshot.manifest.entries[0].declaredByteSize).toBe(
      snapshot.manifest.entries[0].declaredByteSize,
    );
  });

  it("B · every layer is frozen at runtime", async () => {
    const { wireValue } = await wireCopy();
    const verified = await verifySnapshot(wireValue);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    const s = verified.snapshot;

    expect(Object.isFrozen(s), "root").toBe(true);
    expect(Object.isFrozen(s.provenance), "provenance").toBe(true);
    expect(Object.isFrozen(s.manifest), "manifest").toBe(true);
    expect(Object.isFrozen(s.manifest.project), "project").toBe(true);
    expect(Object.isFrozen(s.manifest.entries), "entries array").toBe(true);
    s.manifest.entries.forEach((entry, i) => {
      expect(Object.isFrozen(entry), `entry ${i}`).toBe(true);
    });
  });

  it("C · every mutation attempt throws and changes nothing", async () => {
    const { wireValue } = await wireCopy();
    const verified = await verifySnapshot(wireValue);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    const s = verified.snapshot as unknown as {
      provenance: Record<string, unknown>;
      manifest: {
        project: Record<string, unknown>;
        entries: Record<string, unknown>[] & { push: (v: unknown) => number };
      };
    };

    const before = JSON.stringify(verified.snapshot);

    // ES modules are strict mode, so a write to a frozen object throws rather
    // than failing silently — which is what makes this assertable at all.
    expect(() => { s.provenance.recordedBy = "someone else"; }).toThrow(TypeError);
    expect(() => { s.manifest.project.name = "Another Project"; }).toThrow(TypeError);
    expect(() => { s.manifest.entries[0].declaredSha256 = "f".repeat(64); }).toThrow(TypeError);
    expect(() => { s.manifest.entries[0].path = "z/other.scl"; }).toThrow(TypeError);
    expect(() => { s.manifest.entries[0] = { path: "x" }; }).toThrow(TypeError);
    expect(() => { s.manifest.entries.push({ path: "y" }); }).toThrow(TypeError);

    expect(JSON.stringify(verified.snapshot)).toBe(before);
  });

  it("D · the caller's input is untouched — not frozen, not rewritten", async () => {
    const { wireValue } = await wireCopy();
    const beforeJson = JSON.stringify(wireValue);
    const beforeManifest = wireValue.manifest;
    const beforeProvenance = wireValue.provenance;
    const beforeEntries = wireValue.manifest.entries;

    const verified = await verifySnapshot(wireValue);
    expect(verified.ok).toBe(true);

    // Same references, same values, and still mutable: verification borrowed the
    // value, it did not take ownership of it.
    expect(wireValue.manifest).toBe(beforeManifest);
    expect(wireValue.provenance).toBe(beforeProvenance);
    expect(wireValue.manifest.entries).toBe(beforeEntries);
    expect(JSON.stringify(wireValue)).toBe(beforeJson);

    expect(Object.isFrozen(wireValue)).toBe(false);
    expect(Object.isFrozen(wireValue.manifest)).toBe(false);
    expect(Object.isFrozen(wireValue.provenance)).toBe(false);
    expect(Object.isFrozen(wireValue.manifest.project)).toBe(false);
    expect(Object.isFrozen(wireValue.manifest.entries)).toBe(false);
    expect(Object.isFrozen(wireValue.manifest.entries[0])).toBe(false);

    // Still writable afterwards, proving nothing was frozen behind the caller's back.
    expect(() => { wireValue.provenance.recordedBy = "changed"; }).not.toThrow();
  });

  it("E · the trusted copy re-verifies", async () => {
    const { wireValue } = await wireCopy();
    const first = await verifySnapshot(wireValue);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await verifySnapshot(first.snapshot);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.snapshot).toEqual(first.snapshot);
    // …and each verification hands back its own detached value.
    expect(second.snapshot).not.toBe(first.snapshot);
  });

  it("F · a failed verification yields no snapshot to trust", async () => {
    const { snapshot } = await wireCopy();

    const cases: readonly [string, unknown][] = [
      ["hash mismatch", { ...JSON.parse(JSON.stringify(snapshot)), contentSha256: "0".repeat(64) }],
      [
        "tampered provenance",
        (() => {
          const t = JSON.parse(JSON.stringify(snapshot));
          t.provenance.recordedBy = "someone else";
          return t;
        })(),
      ],
      [
        "malformed manifest",
        (() => {
          const t = JSON.parse(JSON.stringify(snapshot));
          t.manifest.packageKind = "opaque-archive";
          return t;
        })(),
      ],
      [
        "smuggled key",
        (() => {
          const t = JSON.parse(JSON.stringify(snapshot));
          t.smuggled = "value";
          return t;
        })(),
      ],
      ["not an object", 42],
    ];

    for (const [label, value] of cases) {
      const verdict = await verifySnapshot(value);
      expect(verdict.ok, label).toBe(false);
      expect(verdict, label).not.toHaveProperty("snapshot");
    }
  });

  it("createSnapshot's own output was already deeply frozen, and stays so", async () => {
    const snapshot = await snapshotOfFixture();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.provenance)).toBe(true);
    expect(Object.isFrozen(snapshot.manifest)).toBe(true);
    expect(Object.isFrozen(snapshot.manifest.project)).toBe(true);
    expect(Object.isFrozen(snapshot.manifest.entries)).toBe(true);
    expect(Object.isFrozen(snapshot.manifest.entries[0])).toBe(true);
  });

  it("the copy is built field by field, not by serialising", async () => {
    // A JSON round-trip is a serialiser, not a copy mechanism, and a generic
    // deep clone would faithfully carry shapes nobody validated. The constructor
    // names every field, so the returned value is exactly the validated shape.
    const source = readFileSync(join(__dirname, "..", "snapshot.ts"), "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(code).not.toContain("JSON.parse");
    expect(code).not.toContain("JSON.stringify");
    expect(code).not.toContain("structuredClone");
  });
});

describe("109-C2.0 R4 · project.name is evidence AND is bound to identity", () => {
  it("A · retains the exact submitted bytes, padding and inner spacing included", () => {
    // `.trim()` in Zod is a TRANSFORM: "  Line 12   Bottling  " was silently
    // recorded as "Line 12   Bottling". For a producer-declared name that is the
    // validator rewriting evidence.
    const raw = validManifestInput();
    raw.project = { name: "  Line 12   Bottling  ", revision: 3 };
    const manifest = mustValidate(raw);
    expect(manifest.project.name).toBe("  Line 12   Bottling  ");
    // …and the identity key is still derived from it.
    expect(manifest.project.normalizedName).toBe("LINE_12_BOTTLING");
  });

  it("B · two names with one normalizedName produce DIFFERENT digests", async () => {
    // The defect: `name` was stored but hashed by nothing, so it could be
    // rewritten to any spelling that normalises the same way while every digest
    // stayed valid.
    const build = async (name: string) => {
      const raw = validManifestInput();
      raw.project = { name, revision: 3 };
      const manifest = mustValidate(raw);
      return createSnapshot({ manifest, provenance: fixtureProvenance() });
    };
    const a = await build("Line 12 Bottling");
    const b = await build("line   12   bottling");

    expect(a.manifest.project.normalizedName).toBe(b.manifest.project.normalizedName);
    expect(a.manifest.project.name).not.toBe(b.manifest.project.name);
    expect(a.contentSha256).not.toBe(b.contentSha256);
    expect(a.snapshotId).not.toBe(b.snapshotId);
  });

  it("C · a stored snapshot whose name was swapped fails verification", async () => {
    const snapshot = await snapshotOfFixture();
    const restored = JSON.parse(JSON.stringify(snapshot));

    // Change ONLY project.name, to a value with the same normalizedName. Leave
    // contentSha256 and snapshotId exactly as they were.
    restored.manifest.project.name = "LINE   12   BOTTLING";
    expect(normalizeIdentifier(restored.manifest.project.name)).toBe(
      snapshot.manifest.project.normalizedName,
    );
    expect(restored.contentSha256).toBe(snapshot.contentSha256);
    expect(restored.snapshotId).toBe(snapshot.snapshotId);

    const verdict = await verifySnapshot(restored);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.diagnostics.map((d) => d.code)).toContain(
      TIA_DIAGNOSTIC_CODES.CONTENT_HASH_MISMATCH,
    );
  });

  it.each([
    ["empty", ""],
    ["single space", " "],
    ["tab only", "\t"],
    ["newline only", "\n"],
    ["mixed whitespace", " \t\n "],
  ])("D · %s project.name is refused, without being transformed", (_label, name) => {
    const raw = validManifestInput();
    raw.project = { name, revision: 3 };
    const result = validateManifest(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((d) => d.code)).toContain(
      TIA_DIAGNOSTIC_CODES.MALFORMED_MANIFEST,
    );
  });

  it("D · an over-long project.name is refused", () => {
    const raw = validManifestInput();
    raw.project = { name: "x".repeat(192), revision: 3 };
    expect(validateManifest(raw).ok).toBe(false);
  });

  it.each([0x202e, 0x0007, 0x200f, 0x2066])(
    "E · U+%s in project.name is refused as UNSAFE, not MALFORMED",
    (cp) => {
      const raw = validManifestInput();
      raw.project = { name: `Line${String.fromCodePoint(cp)}12`, revision: 3 };
      const result = validateManifest(raw);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostics.map((d) => d.code)).toContain(
        TIA_DIAGNOSTIC_CODES.UNSAFE_TEXT_CONTROL_CHARACTERS,
      );
    },
  );

  it("E · Persian ZWNJ and ZWJ remain permitted in project.name", () => {
    for (const cp of [0x200c, 0x200d]) {
      const name = `خط${String.fromCodePoint(cp)}بطری ۱۲`;
      const raw = validManifestInput();
      raw.project = { name, revision: 3 };
      const result = validateManifest(raw);
      expect(result.ok, `U+${cp.toString(16)}`).toBe(true);
      if (!result.ok) continue;
      expect(result.manifest.project.name).toBe(name);
    }
  });

  it("the durable validator applies the SAME name rule on read-back", async () => {
    // A value refused at the door must not become acceptable because it arrived
    // from storage instead.
    const snapshot = await snapshotOfFixture();
    for (const name of ["", "   ", `bad${String.fromCodePoint(0x202e)}name`, "y".repeat(192)]) {
      const restored = JSON.parse(JSON.stringify(snapshot));
      restored.manifest.project.name = name;
      const verdict = await verifySnapshot(restored);
      expect(verdict.ok, JSON.stringify(name)).toBe(false);
    }
  });

  it("COVERAGE · every stored field is actually inside a digest", async () => {
    // R3 asserted "no unbound field survives" by comparing KEY SETS, which is
    // exactly why it missed project.name: a key can be present and hashed by
    // nothing. This asserts the real property — mutate each field and require a
    // digest to move.
    const snapshot = await snapshotOfFixture();
    const base = await canonicalSha256(canonicalManifestValue(snapshot.manifest));

    const manifestMutations: readonly [string, (m: Record<string, unknown>) => void][] = [
      ["declaredContainerExtension", (m) => { m.declaredContainerExtension = ".other"; }],
      ["declaredTiaVersion", (m) => { m.declaredTiaVersion = "V19"; }],
      ["packageKind", (m) => { m.packageKind = "unrecognized"; }],
      ["schemaVersion", (m) => { m.schemaVersion = "2.0"; }],
      ["sourceBytesSha256", (m) => { m.sourceBytesSha256 = "0".repeat(64); }],
      ["project.name", (m) => { (m.project as Record<string, unknown>).name = "Other Name"; }],
      [
        "project.normalizedName",
        (m) => { (m.project as Record<string, unknown>).normalizedName = "OTHER"; },
      ],
      ["project.revision", (m) => { (m.project as Record<string, unknown>).revision = 9; }],
      ["entry.path", (m) => { (m.entries as Record<string, unknown>[])[0].path = "z/other.scl"; }],
      ["entry.kind", (m) => { (m.entries as Record<string, unknown>[])[0].kind = "opaque"; }],
      [
        "entry.declaredByteSize",
        (m) => { (m.entries as Record<string, unknown>[])[0].declaredByteSize = 99; },
      ],
      [
        "entry.declaredSha256",
        (m) => { (m.entries as Record<string, unknown>[])[0].declaredSha256 = "f".repeat(64); },
      ],
    ];

    for (const [label, mutate] of manifestMutations) {
      const copy = JSON.parse(JSON.stringify(snapshot.manifest));
      mutate(copy);
      const moved = await canonicalSha256(canonicalManifestValue(copy));
      expect(moved, `${label} is not covered by contentSha256`).not.toBe(base);
    }

    // And the same for every provenance field, through the identity envelope.
    const idBase = await canonicalSha256(
      snapshotIdentityValue({
        contentSha256: snapshot.contentSha256,
        sourceBytesSha256: snapshot.sourceBytesSha256,
        provenance: snapshot.provenance,
      }),
    );
    const provenanceMutations: readonly [string, Record<string, unknown>][] = [
      ["origin", { origin: "simulated" }],
      ["producer", { producer: "other" }],
      ["recordedAtEpochMs", { recordedAtEpochMs: FIXTURE_EPOCH_MS + 1 }],
      ["recordedBy", { recordedBy: "other" }],
      ["disclosure", { disclosure: "Something else entirely." }],
    ];
    for (const [label, patch] of provenanceMutations) {
      const moved = await canonicalSha256(
        snapshotIdentityValue({
          contentSha256: snapshot.contentSha256,
          sourceBytesSha256: snapshot.sourceBytesSha256,
          provenance: { ...snapshot.provenance, ...patch } as typeof snapshot.provenance,
        }),
      );
      expect(moved, `provenance.${label} is not covered by snapshotId`).not.toBe(idBase);
    }
  });
});

describe("109-C2.0 R3 · verification is DURABLE across serialisation", () => {
  it("a snapshot survives a JSON round-trip and still verifies", async () => {
    // The defect this closes: R2 verified through the WeakSet, so a snapshot
    // that had been stored and read back was reported malformed. A snapshot
    // that cannot survive storage is not a snapshot, and a check that fails on
    // correct evidence teaches people to route around the checker.
    const snapshot = await snapshotOfFixture();
    const restored = JSON.parse(JSON.stringify(snapshot));
    expect(await verifySnapshot(restored)).toMatchObject({ ok: true });
  });

  it("the restored value is genuinely detached from the original", async () => {
    // Guards against a vacuous version of the test above: if the round-trip
    // returned the same object, nothing would have been proven.
    const snapshot = await snapshotOfFixture();
    const restored = JSON.parse(JSON.stringify(snapshot));
    expect(restored).not.toBe(snapshot);
    expect(restored.manifest).not.toBe(snapshot.manifest);
    expect(isValidatedManifest(snapshot.manifest)).toBe(true);
    expect(isValidatedManifest(restored.manifest)).toBe(false);
    expect(restored).toEqual(snapshot);
  });

  it("survives a round-trip through a FRESH module instance, with a fresh register", async () => {
    // The strongest form of the durability claim: reset the module registry so
    // the verifier runs with a brand-new, empty WeakSet — as it would in another
    // process — and verify a snapshot built by the previous instance.
    const snapshot = await snapshotOfFixture();
    const wire = JSON.stringify(snapshot);

    vi.resetModules();
    const freshSnapshotModule = await import("../snapshot");
    const freshManifestModule = await import("../package-manifest");

    // The fresh instance has never seen this value.
    expect(freshManifestModule.isValidatedManifest(JSON.parse(wire).manifest)).toBe(false);
    const verdict = await freshSnapshotModule.verifySnapshot(JSON.parse(wire));
    expect(verdict).toMatchObject({ ok: true });
  });

  it("verification repairs nothing — an unsorted stored manifest is reported, not re-sorted", async () => {
    const snapshot = await snapshotOfFixture();
    const restored = JSON.parse(JSON.stringify(snapshot));
    const [first, second, ...rest] = restored.manifest.entries;
    restored.manifest.entries = [second, first, ...rest];

    const verdict = await verifySnapshot(restored);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.MALFORMED_MANIFEST);
    expect(verdict.diagnostics[0].params.reason).toContain("canonical order");
    // Untouched: the verifier did not quietly put them back.
    expect(restored.manifest.entries[0].path).toBe(second.path);
  });

  it("re-runs every stored-manifest invariant from scratch", async () => {
    const snapshot = await snapshotOfFixture();
    const cases: readonly [string, (m: Record<string, unknown>) => void][] = [
      ["schema version", (m) => { m.schemaVersion = "9.9"; }],
      ["package kind", (m) => { m.packageKind = "opaque-archive"; }],
      ["project shape", (m) => { (m.project as Record<string, unknown>).revision = 0; }],
      [
        "normalizedName derivation",
        (m) => { (m.project as Record<string, unknown>).normalizedName = "SOMETHING_ELSE"; },
      ],
      [
        "entry path NFC",
        (m) => {
          (m.entries as Record<string, unknown>[])[0].path =
            `blocks/cafe${String.fromCodePoint(0x0301)}.scl`;
        },
      ],
      [
        "entry path canonicality",
        (m) => { (m.entries as Record<string, unknown>[])[0].path = "../escape.scl"; },
      ],
      [
        "duplicate paths",
        (m) => {
          const e = m.entries as Record<string, unknown>[];
          e[1] = { ...e[0] };
        },
      ],
      [
        "entry digest",
        (m) => { (m.entries as Record<string, unknown>[])[0].declaredSha256 = "NOPE"; },
      ],
      [
        "entry kind",
        (m) => { (m.entries as Record<string, unknown>[])[0].kind = "executable"; },
      ],
      [
        "entry size",
        (m) => { (m.entries as Record<string, unknown>[])[0].declaredByteSize = -1; },
      ],
      ["sourceBytesSha256 shape", (m) => { m.sourceBytesSha256 = "short"; }],
    ];

    for (const [label, mutate] of cases) {
      const restored = JSON.parse(JSON.stringify(snapshot));
      mutate(restored.manifest);
      const verdict = await verifySnapshot(restored);
      expect(verdict.ok, label).toBe(false);
    }
  });

  it("the entries bound is enforced on a stored manifest", () => {
    const manifest = mustValidate(validManifestInput());
    const oversized = {
      ...JSON.parse(JSON.stringify(manifest)),
      entries: Array.from({ length: 20_001 }, (_, i) => ({
        path: `a/${String(i).padStart(6, "0")}.scl`,
        kind: "source-block",
        declaredByteSize: 1,
        declaredSha256: "a1".repeat(32),
      })),
    };
    expect(manifestInvariantViolations(oversized)).toContain("entries exceeds the bound");
  });
});

describe("109-C2.0 R3 · the identity envelope is STRICT at every level", () => {
  it.each([
    ["snapshot root", (s: Record<string, unknown>) => { s.smuggled = "value"; }, TIA_DIAGNOSTIC_CODES.SNAPSHOT_SHAPE_INVALID],
    [
      "provenance",
      (s: Record<string, unknown>) => { (s.provenance as Record<string, unknown>).smuggled = "value"; },
      TIA_DIAGNOSTIC_CODES.PROVENANCE_MISSING,
    ],
    [
      "manifest",
      (s: Record<string, unknown>) => { (s.manifest as Record<string, unknown>).smuggled = "value"; },
      TIA_DIAGNOSTIC_CODES.MALFORMED_MANIFEST,
    ],
    [
      "project",
      (s: Record<string, unknown>) => {
        ((s.manifest as Record<string, unknown>).project as Record<string, unknown>).smuggled = "v";
      },
      TIA_DIAGNOSTIC_CODES.MALFORMED_MANIFEST,
    ],
    [
      "manifest entry",
      (s: Record<string, unknown>) => {
        ((s.manifest as Record<string, unknown>).entries as Record<string, unknown>[])[0].smuggled = "v";
      },
      TIA_DIAGNOSTIC_CODES.MALFORMED_MANIFEST,
    ],
  ])("one injected key at the %s level fails verification", async (level, inject, code) => {
    // Why this matters: the identity envelope and the canonical manifest each
    // hash a FIXED list of fields. A key outside those lists rides along inside
    // a verified snapshot without appearing in any digest — an unbound field
    // anybody can change while every hash still matches.
    const snapshot = await snapshotOfFixture();
    const tampered = JSON.parse(JSON.stringify(snapshot));
    inject(tampered);

    const verdict = await verifySnapshot(tampered);
    expect(verdict.ok, level).toBe(false);
    if (verdict.ok) return;
    expect(verdict.diagnostics[0].code, level).toBe(code);
    expect(verdict.diagnostics[0].params.reason ?? verdict.diagnostics[0].params.detail, level)
      .toContain("smuggled");
  });

  it("a missing key at the snapshot or provenance level also fails", async () => {
    const snapshot = await snapshotOfFixture();
    for (const key of ["snapshotId", "contentSha256", "sourceBytesSha256", "manifest", "provenance"]) {
      const tampered = JSON.parse(JSON.stringify(snapshot));
      delete tampered[key];
      expect((await verifySnapshot(tampered)).ok, key).toBe(false);
    }
    for (const key of ["origin", "producer", "recordedAtEpochMs", "recordedBy", "disclosure"]) {
      const tampered = JSON.parse(JSON.stringify(snapshot));
      delete tampered.provenance[key];
      expect((await verifySnapshot(tampered)).ok, key).toBe(false);
    }
  });

  it("no unbound field can survive in an ok:true snapshot", async () => {
    // Stated as a property rather than a list: every key that verification
    // admits is one the identity envelope or the canonical manifest hashes.
    const snapshot = await snapshotOfFixture();
    expect(Object.keys(snapshot).sort()).toEqual([...EXACT_SNAPSHOT_KEYS].sort());
    expect(Object.keys(snapshot.provenance).sort()).toEqual([...EXACT_PROVENANCE_KEYS].sort());
    expect(Object.keys(snapshot.manifest).sort()).toEqual([...EXACT_MANIFEST_KEYS].sort());
    expect(Object.keys(snapshot.manifest.project).sort()).toEqual([...EXACT_PROJECT_KEYS].sort());
    for (const entry of snapshot.manifest.entries) {
      expect(Object.keys(entry).sort()).toEqual([...EXACT_ENTRY_KEYS].sort());
    }
    expect((await verifySnapshot(snapshot)).ok).toBe(true);
  });
});

describe("109-C2.0 R2 · snapshotId covers provenance, contentSha256 does not", () => {
  it("the two identities are distinct digests", async () => {
    // R1 had snapshotId === contentSha256, which made provenance invisible to
    // identity: the recording engineer could be replaced and verification still
    // reported the snapshot sound. Provenance that cannot be verified is
    // decoration.
    const snapshot = await snapshotOfFixture();
    expect(isSha256Hex(snapshot.snapshotId)).toBe(true);
    expect(isSha256Hex(snapshot.contentSha256)).toBe(true);
    expect(snapshot.snapshotId).not.toBe(snapshot.contentSha256);
    const verdict = await verifySnapshot(snapshot);
    expect(verdict.ok).toBe(true);
  });

  it("snapshotId is the digest of the named identity envelope", async () => {
    // The constructor and the verifier must hash THE SAME THING, so the envelope
    // is built by one exported function and this recomputes through it.
    const snapshot = await snapshotOfFixture();
    const expected = await canonicalSha256(
      snapshotIdentityValue({
        contentSha256: snapshot.contentSha256,
        sourceBytesSha256: snapshot.sourceBytesSha256,
        provenance: snapshot.provenance,
      }),
    );
    expect(snapshot.snapshotId).toBe(expected);
  });

  it.each([
    ["origin", { origin: "simulated" }],
    ["producer", { producer: "some-other-producer" }],
    ["recordedAtEpochMs", { recordedAtEpochMs: FIXTURE_EPOCH_MS + 1 }],
    ["recordedBy", { recordedBy: "another engineer" }],
    ["disclosure", { disclosure: "A different disclosure statement entirely." }],
  ])("changing provenance.%s changes snapshotId and NOT contentSha256", async (_field, patch) => {
    const base = await snapshotOfFixture();
    const altered = await createSnapshot({
      manifest: mustValidate(validManifestInput()),
      provenance: { ...fixtureProvenance(), ...patch },
    });
    expect(altered.snapshotId).not.toBe(base.snapshotId);
    // The engineering content did not move, so the content digest must not
    // either — that is what lets one compile result serve two recordings of the
    // same code.
    expect(altered.contentSha256).toBe(base.contentSha256);
  });

  it("changing sourceBytesSha256 changes snapshotId", async () => {
    const base = await snapshotOfFixture();
    const altered = await createSnapshot({
      manifest: mustValidate({ ...validManifestInput(), sourceBytesSha256: "0".repeat(64) }),
      provenance: fixtureProvenance(),
    });
    expect(altered.sourceBytesSha256).not.toBe(base.sourceBytesSha256);
    expect(altered.snapshotId).not.toBe(base.snapshotId);
  });

  it("changing the manifest moves both digests", async () => {
    const base = await snapshotOfFixture();
    const altered = await createSnapshot({
      manifest: mustValidate({
        ...validManifestInput(),
        project: { name: "Line 13 Bottling", revision: 3 },
      }),
      provenance: fixtureProvenance(),
    });
    expect(altered.contentSha256).not.toBe(base.contentSha256);
    expect(altered.snapshotId).not.toBe(base.snapshotId);
  });

  it.each([
    ["origin", { origin: "authored" }],
    ["producer", { producer: "tampered-producer" }],
    ["recordedAtEpochMs", { recordedAtEpochMs: FIXTURE_EPOCH_MS + 5_000 }],
    ["recordedBy", { recordedBy: "tampered engineer" }],
    ["disclosure", { disclosure: "This is genuine plant data." }],
  ])("verification FAILS when provenance.%s is altered in place", async (_field, patch) => {
    // The tamper the R1 model could not see: swap a provenance field on an
    // existing snapshot, leave every digest alone, and ask the verifier.
    const snapshot = await snapshotOfFixture();
    const tampered = {
      ...snapshot,
      provenance: { ...snapshot.provenance, ...patch },
    };
    const verdict = await verifySnapshot(tampered);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.diagnostics.map((d) => d.code)).toContain(
      TIA_DIAGNOSTIC_CODES.CONTENT_HASH_MISMATCH,
    );
    expect(verdict.diagnostics.some((d) => d.params.field === "snapshotId")).toBe(true);
  });

  it("verification fails when sourceBytesSha256 is altered in place", async () => {
    const snapshot = await snapshotOfFixture();
    const verdict = await verifySnapshot({ ...snapshot, sourceBytesSha256: "0".repeat(64) });
    expect(verdict.ok).toBe(false);
  });
});

describe("109-C2.0 · the snapshot is content-addressed", () => {

  it("carries the fixture disclosure, so it cannot be mistaken for plant data", async () => {
    const snapshot = await snapshotOfFixture();
    expect(snapshot.provenance.disclosure).toBe(FIXTURE_DISCLOSURE);
    expect(snapshot.provenance.origin).toBe("imported");
  });

  it("stores no package bytes — only the digest of them", async () => {
    const snapshot = await snapshotOfFixture();
    const serialised = JSON.stringify(snapshot);
    expect(snapshot.sourceBytesSha256).toBe(validManifestInput().sourceBytesSha256);
    for (const field of ["bytes", "buffer", "base64", "archive", "payload", "content"]) {
      expect(serialised, field).not.toContain(`"${field}"`);
    }
  });

  it("is frozen and exposes no mutator", async () => {
    const snapshot = await snapshotOfFixture();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.provenance)).toBe(true);
  });

  it("detects a tampered content digest", async () => {
    const snapshot = await snapshotOfFixture();
    const tampered = { ...snapshot, contentSha256: "0".repeat(64), snapshotId: "0".repeat(64) };
    const verdict = await verifySnapshot(tampered);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.CONTENT_HASH_MISMATCH);
  });

  it("detects an id that no longer matches its own content digest", async () => {
    const snapshot = await snapshotOfFixture();
    const verdict = await verifySnapshot({ ...snapshot, snapshotId: "1".repeat(64) });
    expect(verdict.ok).toBe(false);
  });

  it("detects a mutated manifest even when both digests were left alone", async () => {
    const snapshot = await snapshotOfFixture();
    const otherManifest = mustValidate({
      ...validManifestInput(),
      project: { name: "Line 13 Bottling", revision: 3 },
    });
    const verdict = await verifySnapshot({ ...snapshot, manifest: otherManifest });
    expect(verdict.ok).toBe(false);
  });
});

describe("109-C2.0 · provenance admission", () => {
  it("accepts the fixture provenance and freezes it", () => {
    const provenance = assertProvenance(fixtureProvenance());
    expect(provenance.origin).toBe("imported");
    expect(Object.isFrozen(provenance)).toBe(true);
  });

  it("refuses a disclosure past its bound", () => {
    expect(() =>
      assertProvenance({ ...fixtureProvenance(), disclosure: "x".repeat(501) }),
    ).toThrow(/AES-C2-018/);
  });

  it("refuses a non-integer instant", () => {
    expect(() => assertProvenance({ ...fixtureProvenance(), recordedAtEpochMs: 1.5 })).toThrow(
      /AES-C2-018/,
    );
  });
});

describe("109-C2.0 · declared compile results bind to one snapshot", () => {
  it("accepts a correctly bound result and normalises its findings", async () => {
    const snapshot = await snapshotOfFixture();
    const binding = bindCompileResult(
      validCompileResultInput(snapshot.contentSha256),
      snapshot,
    );
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    expect(binding.findings).toHaveLength(2);
    expect(compileCountBySeverity(binding.findings)).toEqual({ error: 1, warning: 1, info: 0 });
    for (const finding of binding.findings) {
      expect(finding.compileEvidence).toBe(COMPILE_EVIDENCE);
      expect(finding.snapshotContentSha256).toBe(snapshot.contentSha256);
    }
  });

  it("evidence is DECLARED and no stronger value exists to reach for", () => {
    expect(COMPILE_EVIDENCE).toBe("DECLARED");
    // Not merely "we did not use a stronger value" — the module exports no such
    // name and no such value, so a caller cannot find one to set.
    const names = Object.keys(compileModule);
    // Narrowed by a plain `if` rather than a type predicate: a predicate would
    // need its type to be assignable to the module's export union, which would
    // mean writing an assertion to satisfy a check that is meant to be honest.
    const values: string[] = [];
    for (const value of Object.values(compileModule)) {
      if (typeof value === "string") values.push(value);
    }
    for (const forbidden of ["VERIFIED", "TRUSTED", "EXECUTED", "CONFIRMED", "OBSERVED"]) {
      expect(
        names.filter((name) => name.toUpperCase().includes(forbidden)),
        forbidden,
      ).toEqual([]);
      expect(values, forbidden).not.toContain(forbidden);
    }
  });

  it("severity comes from the structural token, never from the text", async () => {
    const snapshot = await snapshotOfFixture();
    const severities = localisedCompileResultInputs(snapshot.contentSha256).map((input) => {
      const binding = bindCompileResult(input, snapshot);
      if (!binding.ok) throw new Error("localised fixture failed to bind");
      return binding.findings[0].severity;
    });
    // English, German and Persian text; one severity. If any decision started
    // reading the words, these three would stop agreeing.
    expect(new Set(severities).size).toBe(1);
    expect(severities[0]).toBe("error");
  });

  it("maps every token deterministically", () => {
    expect(severityOfToken("ERROR")).toBe("error");
    expect(severityOfToken("WARNING")).toBe("warning");
    expect(severityOfToken("INFO")).toBe("info");
  });

  it("refuses a result bound to a different snapshot", async () => {
    const snapshot = await snapshotOfFixture();
    const other = await createSnapshot({
      manifest: mustValidate({
        ...validManifestInput(),
        project: { name: "Line 99 Filling", revision: 1 },
      }),
      provenance: fixtureProvenance(),
    });
    const binding = bindCompileResult(validCompileResultInput(other.contentSha256), snapshot);
    expect(binding.ok).toBe(false);
    if (binding.ok) return;
    expect(binding.diagnostics[0].code).toBe(TIA_DIAGNOSTIC_CODES.COMPILE_RESULT_UNBOUND);
  });
});
