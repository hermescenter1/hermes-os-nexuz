/**
 * Phase 86C4B2B1D-HARDEN — Inventory movement types ↔ UI color map alignment.
 *
 * Before this phase, MOVE_COLOR in InventoryDetailClient.tsx was a broad
 * `Record<string, string>` carrying two legacy keys (ADJUST, SCRAP) that do
 * not exist in the canonical `ErpInventoryMovementType` union, while missing
 * three canonical members (ADJUSTMENT, RESERVED, RELEASED). Unknown types
 * silently rendered with no color via a `?? ""` fallback.
 *
 * After this phase, the color map is compile-time exhaustive:
 *
 *   const MOVE_COLOR = { ...one entry per canonical type... }
 *     satisfies Record<ErpInventoryMovementType, string>;
 *
 * and the access is direct (`MOVE_COLOR[m.type]`, no fallback) — so adding a
 * new movement type to the union without a color entry fails `tsc`/build.
 *
 * The canonical set is NOT duplicated by hand here: the expected keys are
 * parsed from the authoritative TypeScript union in src/lib/erp/types.ts and
 * cross-checked against the Prisma enum, so this test cannot drift
 * independently of the source of truth.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import en from "../../../messages/en.json";

type Tree = Record<string, unknown>;
const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const TYPES_REL = "src/lib/erp/types.ts";
const CLIENT_REL = "src/components/erp/InventoryDetailClient.tsx";
const PRISMA_REL = "prisma/schema.prisma";
const DB_REL = "src/lib/erp/db.ts";

const typesSrc = read(TYPES_REL);
const clientSrc = read(CLIENT_REL);
const prismaSrc = read(PRISMA_REL);

/** Canonical members parsed from the authoritative TS union (source of truth). */
function unionMembers(): string[] {
  const m = typesSrc.match(/export type ErpInventoryMovementType\s*=\s*([^;]+);/);
  expect(m, "ErpInventoryMovementType union must exist in types.ts").toBeTruthy();
  const members = [...m![1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
  expect(members.length).toBeGreaterThan(0);
  return members;
}

/** Keys of the MOVE_COLOR literal parsed from the component source. */
function moveColorKeys(): string[] {
  const m = clientSrc.match(
    /const MOVE_COLOR = \{([\s\S]*?)\} satisfies Record<ErpInventoryMovementType, string>;/,
  );
  expect(m, "MOVE_COLOR must be a `satisfies Record<ErpInventoryMovementType, string>` literal").toBeTruthy();
  return [...m![1].matchAll(/^\s*([A-Z_]+):/gm)].map((x) => x[1]);
}

/** Members of the Prisma ErpInventoryMovementType enum. */
function prismaEnumMembers(): string[] {
  const m = prismaSrc.match(/enum ErpInventoryMovementType \{([\s\S]*?)\}/);
  expect(m, "Prisma must define enum ErpInventoryMovementType").toBeTruthy();
  return m![1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[A-Z_]+$/.test(l));
}

// ─────────────────────────────────────────────────────────────────────────────
describe("canonical movement-type source of truth is unambiguous", () => {
  it("TS union and Prisma enum define the identical canonical set", () => {
    expect([...unionMembers()].sort()).toEqual([...prismaEnumMembers()].sort());
  });

  it("the canonical set contains the expected core members", () => {
    const canon = new Set(unionMembers());
    for (const k of ["IN", "OUT", "TRANSFER", "ADJUSTMENT", "RESERVED", "RELEASED"]) {
      expect(canon.has(k), `canonical ${k}`).toBe(true);
    }
  });

  it("legacy ADJUST / SCRAP are NOT canonical values", () => {
    const canon = new Set(unionMembers());
    expect(canon.has("ADJUST")).toBe(false);
    expect(canon.has("SCRAP")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("MOVE_COLOR is compile-time exhaustive over ErpInventoryMovementType", () => {
  it("imports the canonical type via a type-only import", () => {
    expect(clientSrc).toMatch(
      /import type \{[^}]*ErpInventoryMovementType[^}]*\} from "@\/lib\/erp\/types";/,
    );
  });

  it("is declared with `satisfies Record<ErpInventoryMovementType, string>`", () => {
    expect(clientSrc).toMatch(/\} satisfies Record<ErpInventoryMovementType, string>;/);
  });

  it("covers every canonical movement type exactly once, with no extra keys", () => {
    const keys = moveColorKeys();
    expect([...keys].sort()).toEqual([...unionMembers()].sort()); // set equality
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
  });

  it("carries no legacy keys and every entry maps to a non-empty text- class", () => {
    const keys = new Set(moveColorKeys());
    expect(keys.has("ADJUST")).toBe(false);
    expect(keys.has("SCRAP")).toBe(false);
    const m = clientSrc.match(
      /const MOVE_COLOR = \{([\s\S]*?)\} satisfies Record<ErpInventoryMovementType, string>;/,
    )!;
    for (const [, key, cls] of m[1].matchAll(/([A-Z_]+):\s*"([^"]*)"/g)) {
      expect(cls.length, `MOVE_COLOR ${key} class`).toBeGreaterThan(0);
      expect(cls, `MOVE_COLOR ${key} uses text- utility`).toMatch(/^text-/);
    }
  });

  it("does not weaken type safety (no broad map, index signature, or assertion)", () => {
    expect(clientSrc).not.toContain("as any");
    expect(clientSrc).not.toContain("Record<string, string>");
    expect(clientSrc).not.toMatch(/\[key:\s*string\]/);
    expect(clientSrc).not.toMatch(/MOVE_COLOR\s*:\s*Record</);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("movement badge access is direct — no silent fallback", () => {
  it("accesses MOVE_COLOR[m.type] directly with no ?? / || / optional fallback", () => {
    expect(clientSrc).toContain("${MOVE_COLOR[m.type]}");
    expect(clientSrc).not.toMatch(/MOVE_COLOR\[m\.type\]\s*\?\?/);
    expect(clientSrc).not.toMatch(/MOVE_COLOR\[m\.type\]\s*\|\|/);
    expect(clientSrc).not.toContain("MOVE_COLOR[m.type]?");
  });

  it("renders the raw movement token directly ({m.type}, no catalog lookup)", () => {
    expect(clientSrc).toContain("{m.type}");
    expect(clientSrc).not.toMatch(/t\([^)]*m\.type/); // no t(`...${m.type}`) lookup
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("surrounding behavior is unchanged (rendering, ordering, routes, catalogs)", () => {
  it("movement-history ordering stays in the data layer (desc, take 20; no client sort)", () => {
    expect(read(DB_REL)).toContain(
      'include: { movements: { orderBy: { createdAt: "desc" }, take: 20 } }',
    );
    expect(clientSrc).toContain("item.movements.map(");
    expect(clientSrc).not.toContain(".sort(");
    expect(clientSrc).not.toContain(".reverse(");
  });

  it("date and quantity rendering are unchanged", () => {
    expect(clientSrc).toContain("new Date(m.createdAt).toLocaleDateString()");
    expect(clientSrc).toContain('{m.quantity > 0 ? "+" : ""}{m.quantity}');
  });

  it("locale-prefixed inventory route is unchanged", () => {
    expect(clientSrc).toContain("`/${locale}/erp/inventory`");
  });

  it("no movement-type entries were added to the message catalogs", () => {
    const flatten = (node: unknown, prefix = ""): Map<string, unknown> => {
      const out = new Map<string, unknown>();
      if (node !== null && typeof node === "object") {
        for (const [k, v] of Object.entries(node as Tree)) {
          const p = prefix ? `${prefix}.${k}` : k;
          for (const [kk, vv] of flatten(v, p)) out.set(kk, vv);
        }
      } else {
        out.set(prefix, node);
      }
      return out;
    };
    const inv = flatten(((en as Tree).enterpriseOperations as Tree).inventory);
    expect(inv.size).toBe(18); // unchanged leaf count — no moveType labels added
    for (const key of inv.keys()) {
      expect(/movementTypes|moveTypes/i.test(key), key).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("this test file is hygienic (no skipped/focused/swallowed assertions)", () => {
  // Needles are assembled at runtime so this file never literally contains the
  // forbidden tokens it forbids (avoids self-matching false positives).
  it("contains no skip / only / swallowed-catch constructs", () => {
    const self = read("src/i18n/__tests__/inventory-movement-enum-alignment.test.ts");
    const skip = "sk" + "ip";
    const only = "on" + "ly";
    const swallow = "." + "catch" + "(";
    for (const kw of ["it", "test", "describe"]) {
      expect(self.includes(`${kw}.${skip}`), `${kw}.${skip}`).toBe(false);
      expect(self.includes(`${kw}.${only}`), `${kw}.${only}`).toBe(false);
    }
    expect(self.includes(swallow), "swallowed failure").toBe(false);
  });
});
