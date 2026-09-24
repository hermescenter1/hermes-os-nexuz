import { describe, it, expect } from "vitest";
import path from "path";
import type { ChunkVectorStore } from "../chunk-vector-store";
import type { searchDocuments } from "../search";
import { readSourceCode, walkSource } from "../../../../scripts/security/phase99/static-invariants.mjs";

/**
 * F-1 — structural invariants that keep document-chunk retrieval tenant-scoped.
 *
 * R10 (type level): an unscoped call must not compile. The `@ts-expect-error`
 *   lines below are checked by `tsc --noEmit`: if the scope parameter ever
 *   becomes optional again, the directive is unused and typecheck fails.
 * R11 (static): three rules over every production source under src/ (tests
 *   excluded, comments stripped by the Phase 99 scanner's own reader):
 *   1. every raw SQL READ of "DocumentTextChunk" — via FROM or JOIN, any case —
 *      carries a tenant predicate in the same statement;
 *   2. the typed Prisma delegate `documentTextChunk` is used ONLY in the single
 *      choke-point module `src/lib/documents/chunk-repository.ts`;
 *   3. chunk TEXT is never read through that repository from outside the
 *      internal document pipeline (`src/lib/documents/`), and its unfiltered
 *      `list()` has no production caller at all — so every tenant-facing surface
 *      can only reach chunk text through the tenant-scoped vector store.
 *   Each rule is proven with a planted control (it flags a violation and
 *   accepts the compliant form) and a positive control (it really sees the
 *   production occurrences), so it cannot pass vacuously.
 */

// ─── R10 ───────────────────────────────────────────────────────────────────

// Never invoked — exists only so `tsc --noEmit` type-checks the calls.
export function __f1TypeLevelContract(store: ChunkVectorStore, search: typeof searchDocuments): void {
  // @ts-expect-error F-1: scope is required on the chunk store
  void store.search([0], 5);
  // @ts-expect-error F-1: a documentId string is not a scope
  void store.search([0], 5, "doc-id");
  // @ts-expect-error F-1: scope is required on searchDocuments
  void search("question");
  // @ts-expect-error F-1: a topK number is not a scope
  void search("question", 5);
}

describe("F-1 R10 — unscoped search is a type error", () => {
  it("the type-level contract function exists (enforced by tsc --noEmit)", () => {
    expect(typeof __f1TypeLevelContract).toBe("function");
  });
});

// ─── R11 detectors ─────────────────────────────────────────────────────────

const TENANT_PREDICATE = /"tenantId"|"organizationId"/;
/** The single module allowed to touch the typed Prisma delegate. */
const CHUNK_REPOSITORY = "src/lib/documents/chunk-repository.ts";
/** Module boundary of the internal (admin-driven) document pipeline. */
const DOCUMENT_PIPELINE_DIR = "src/lib/documents/";
const REPO_READ_METHODS = ["list", "listByDocumentId"] as const;

/** Rule 1 — raw SQL reads (FROM / JOIN, any case) of DocumentTextChunk that lack a tenant predicate. */
export function findUnscopedRawChunkReads(code: string): string[] {
  const offenders: string[] = [];
  const re = /\b(?:FROM|JOIN)\s+"DocumentTextChunk"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const before = code.slice(0, m.index);
    let statement: string;
    if ((before.match(/`/g) ?? []).length % 2 === 1) {
      // Inside a template literal: the statement is the whole template (it may
      // span lines and contain quotes of its own).
      const close = code.indexOf("`", m.index);
      statement = code.slice(before.lastIndexOf("`"), close === -1 ? code.length : close);
    } else {
      // A quoted string cannot span lines: the statement is its logical line.
      const end = code.indexOf("\n", m.index);
      statement = code.slice(before.lastIndexOf("\n") + 1, end === -1 ? code.length : end);
    }
    if (!TENANT_PREDICATE.test(statement)) offenders.push(statement.trim().slice(0, 160));
  }
  return offenders;
}

/** Rule 2 — occurrences of the typed Prisma delegate for DocumentTextChunk. */
export function countTypedChunkDelegate(code: string): number {
  return (code.match(/\bdocumentTextChunk\b/g) ?? []).length;
}

/** Rule 3 — chunk-repository READ calls (direct, via an alias, or destructured). */
export function findChunkRepositoryReads(code: string): string[] {
  const reads: string[] = [];
  const methods = REPO_READ_METHODS.join("|");
  // The factory may be imported under an alias: `import { documentTextChunkRepository as x }`.
  const factories = new Set(["documentTextChunkRepository"]);
  for (const a of code.matchAll(/\bdocumentTextChunkRepository\s+as\s+(\w+)/g)) factories.add(a[1]);
  for (const factory of factories) {
    const call = `\\b${factory}\\(\\)`;
    for (const m of code.matchAll(new RegExp(`${call}\\s*\\.\\s*(${methods})\\s*\\(`, "g"))) reads.push(m[1]);
    for (const a of code.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(\\w+)\\s*(?::[^=]+)?=\\s*${call}`, "g"))) {
      for (const m of code.matchAll(new RegExp(`\\b${a[1]}\\s*\\.\\s*(${methods})\\s*\\(`, "g"))) reads.push(m[1]);
    }
    for (const d of code.matchAll(new RegExp(`\\{([^}]*)\\}\\s*=\\s*${call}`, "g"))) {
      for (const name of REPO_READ_METHODS) if (new RegExp(`\\b${name}\\b`).test(d[1])) reads.push(name);
    }
  }
  return reads;
}

// ─── R11 planted controls ──────────────────────────────────────────────────

describe("F-1 R11 — planted controls (each detector catches a violation and accepts the compliant form)", () => {
  it("rule 1 flags unscoped FROM, JOIN, lower-case and single-quoted reads; accepts scoped reads and writes", () => {
    const unscoped = [
      'q(`SELECT id FROM "DocumentTextChunk" WHERE embedding IS NOT NULL`)',
      'q(`SELECT d.id, c.text FROM "Document" d JOIN "DocumentTextChunk" c ON c."documentId" = d.id`)',
      'q(`select c.text from "DocumentTextChunk" c left join "Document" d on d.id = c."documentId"`)',
      "q('SELECT text FROM \"DocumentTextChunk\"')",
    ];
    for (const src of unscoped) expect(findUnscopedRawChunkReads(src)).toHaveLength(1);
    const scoped =
      'q(`SELECT c.id FROM "DocumentTextChunk" c JOIN "Document" d ON d.id = c."documentId" WHERE d."tenantId" = $2`)';
    const joinScoped =
      'q(`SELECT c.text FROM "Document" d JOIN "DocumentTextChunk" c ON c."documentId" = d.id WHERE d."tenantId" = $1`)';
    const write = 'q(`UPDATE "DocumentTextChunk" SET embedding = $1 WHERE id = $2`)';
    expect(findUnscopedRawChunkReads(scoped)).toEqual([]);
    expect(findUnscopedRawChunkReads(joinScoped)).toEqual([]);
    expect(findUnscopedRawChunkReads(write)).toEqual([]);
  });

  it("rule 2 counts property and string-keyed delegate access, not the repository factory", () => {
    expect(countTypedChunkDelegate("await db.documentTextChunk.findMany({})")).toBe(1);
    expect(countTypedChunkDelegate('const m = (db as Record<string, unknown>)["documentTextChunk"];')).toBe(1);
    expect(countTypedChunkDelegate("documentTextChunkRepository().createMany(rows)")).toBe(0);
  });

  it("rule 3 finds direct, aliased and destructured reads; ignores writes", () => {
    expect(findChunkRepositoryReads("await documentTextChunkRepository().list();")).toEqual(["list"]);
    expect(
      findChunkRepositoryReads("const repo = documentTextChunkRepository();\nconst rows = await repo.listByDocumentId(id);")
    ).toEqual(["listByDocumentId"]);
    expect(findChunkRepositoryReads("const { list } = documentTextChunkRepository();")).toEqual(["list"]);
    expect(
      findChunkRepositoryReads(
        'import { documentTextChunkRepository as chunks } from "@/lib/documents/chunk-repository";\nconst r = chunks();\nawait r.listByDocumentId(id);\nawait chunks().list();'
      ).sort()
    ).toEqual(["list", "listByDocumentId"]);
    expect(
      findChunkRepositoryReads(
        "const r = documentTextChunkRepository();\nawait r.createMany(c);\nawait documentTextChunkRepository().deleteByDocumentId(id);"
      )
    ).toEqual([]);
  });
});

// ─── R11 production scan ───────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "../../../..");
const PRODUCTION = walkSource(path.join(ROOT, "src")).map((file: string) => ({
  rel: path.relative(ROOT, file).split(path.sep).join("/"),
  code: readSourceCode(file),
}));

describe("F-1 R11 — production sources", () => {
  it("rule 1: every raw DocumentTextChunk read carries a tenant predicate", () => {
    const vectorStore = PRODUCTION.find((f) => f.rel === "src/lib/documents/chunk-vector-store.ts");
    // positive control: the scanner really sees the production reads (two statements)
    expect(vectorStore).toBeDefined();
    expect(vectorStore!.code.match(/\b(?:FROM|JOIN)\s+"DocumentTextChunk"/gi)?.length ?? 0).toBeGreaterThanOrEqual(2);
    const offenders = PRODUCTION.flatMap((f) => findUnscopedRawChunkReads(f.code).map((s) => `${f.rel}: ${s}`));
    expect(offenders).toEqual([]);
  });

  it("rule 2: the typed Prisma delegate is used only in the chunk-repository choke point", () => {
    const users = PRODUCTION.filter((f) => countTypedChunkDelegate(f.code) > 0).map((f) => f.rel);
    // positive control: the choke point itself is detected
    expect(users).toContain(CHUNK_REPOSITORY);
    expect(users.filter((rel) => rel !== CHUNK_REPOSITORY)).toEqual([]);
  });

  it("rule 3: chunk text is never read through the repository outside the pipeline, and list() has no caller", () => {
    const reads = PRODUCTION.flatMap((f) => findChunkRepositoryReads(f.code).map((method) => ({ rel: f.rel, method })));
    // positive control: the known internal pipeline read is detected
    expect(reads).toContainEqual({ rel: "src/lib/documents/embedding.ts", method: "listByDocumentId" });
    expect(reads.filter((r) => r.method === "list")).toEqual([]);
    expect(reads.filter((r) => !r.rel.startsWith(DOCUMENT_PIPELINE_DIR))).toEqual([]);
  });
});
