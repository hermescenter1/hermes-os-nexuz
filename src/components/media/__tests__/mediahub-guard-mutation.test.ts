import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditMediaHub, guardViolations } from "./_guard";

/**
 * PHASE 102 / RELEASE BLOCKER 1 — mutation testing for the `mediaHub` guard.
 *
 * WHY
 * `mediahub-contract.test.ts` is green. That is exactly as much evidence for the
 * guard as it is against it: a guard that derives an empty key set, or that
 * silently skips the calls it cannot parse, is also green. The previous
 * implementation WAS green while missing two whole classes of real call — a
 * renamed translator binding and a single-quoted key — and while inventing calls
 * out of `//` comments. Nobody noticed, because nobody had ever seen it fail.
 *
 * So this file breaks one fact at a time and demands the guard react. Eight
 * mutations: seven that must turn it RED and one that must leave it GREEN,
 * because a guard that fails on everything is no more useful than one that fails
 * on nothing.
 *
 * WHERE
 * Never in the working tree. Each case copies the sources the audit reads into a
 * fresh directory under the OS temp dir, mutates the copy, runs the audit
 * against THAT root, then restores the copied file and verifies the restore was
 * byte-exact. `afterAll` additionally re-hashes the real repository files and
 * fails if a single byte moved, so a bug in this file cannot quietly corrupt the
 * catalog it is testing.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/** Everything `auditMediaHub` reads. Nothing else is copied. */
const CLONED_PATHS = [
  "messages",
  "src/lib/media",
  "src/components/media",
  "src/app/[locale]/videos",
] as const;

const sha256 = (file: string): string =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

/* ═══════════════════════════ mutation definitions ═══════════════════════════ */

type Verdict = "RED" | "GREEN";

interface Mutation {
  id: string;
  what: string;
  file: string;
  expect: Verdict;
  apply: (text: string) => string;
  /**
   * A substring the reported violation must contain.
   *
   * Without this a mutation could "pass" for the wrong reason — a splice that
   * broke the file's syntax would drop the audit below its file/key floors and
   * turn it red without the guard ever having understood the change. Demanding
   * the SPECIFIC symptom makes each row evidence about one mechanism.
   */
  signal?: string;
}

/**
 * The line ending the file actually uses.
 *
 * The repository is checked out with CRLF working-tree endings (LF in the
 * index), so an anchor written with `\n` matches nothing on this host and would
 * turn every source-level mutation into a thrown error rather than a verdict.
 * Anchors are therefore assembled line by line with whatever the file uses.
 */
const eol = (text: string): string => (text.includes("\r\n") ? "\r\n" : "\n");

/** Join source lines with the file's own line ending, trailing break included. */
const lines = (text: string, ...parts: string[]): string =>
  parts.map((part) => `${part}${eol(text)}`).join("");

/** Replace `find` exactly once, failing loudly if it is not unique. */
function spliceOnce(text: string, find: string, replace: string): string {
  const first = text.indexOf(find);
  if (first === -1) throw new Error(`mutation anchor not found: ${JSON.stringify(find)}`);
  if (text.indexOf(find, first + find.length) !== -1) {
    throw new Error(`mutation anchor is not unique: ${JSON.stringify(find)}`);
  }
  return text.slice(0, first) + replace + text.slice(first + find.length);
}

/**
 * Edit a JSON catalog structurally.
 *
 * This re-emits the CLONE with `JSON.stringify`, which the repository's catalogs
 * are never allowed to suffer — they are CRLF with a hand-set indent and are only
 * ever edited by targeted splice. It is safe here precisely because it is the
 * clone: the audit parses it with `JSON.parse`, so formatting is not part of what
 * is under test, and the restore below writes back the ORIGINAL BYTES rather than
 * a re-serialisation.
 */
function editCatalog(text: string, mutate: (mediaHub: Record<string, unknown>) => void): string {
  const catalog = JSON.parse(text) as Record<string, unknown>;
  mutate(catalog.mediaHub as Record<string, unknown>);
  return JSON.stringify(catalog, null, 2);
}

const at = (root: Record<string, unknown>, dotted: string): Record<string, unknown> => {
  let node = root;
  for (const segment of dotted.split(".")) node = node[segment] as Record<string, unknown>;
  return node;
};

/**
 * The anchor for the four source-level mutations. `RelatedVideos.tsx` binds the
 * namespace once, at a line that appears nowhere else in the file.
 */
const BINDING_LINE = '  const t = useTranslations("mediaHub");';
/** A key no catalog carries, in any language. */
const ABSENT_KEY = "keyNoCatalogCarries";

/** Splice extra lines in directly after the translator binding. */
const afterBinding = (text: string, ...added: string[]): string =>
  spliceOnce(text, lines(text, BINDING_LINE), lines(text, BINDING_LINE, ...added));

const MUTATIONS: readonly Mutation[] = [
  {
    id: "M1",
    what: "a key the components read is deleted from the German catalog",
    file: "messages/de.json",
    expect: "RED",
    signal: "de missing: related.title",
    apply: (text) =>
      editCatalog(text, (mediaHub) => {
        delete at(mediaHub, "related").title;
      }),
  },
  {
    id: "M2",
    what: "a seventh member joins MEDIA_LIFECYCLE_STATUSES with no matching copy",
    file: "src/lib/media/types.ts",
    expect: "RED",
    signal: "lifecycle.SUPERSEDED",
    apply: (text) =>
      spliceOnce(
        text,
        lines(text, '  "ARCHIVED",', "] as const;"),
        lines(text, '  "ARCHIVED",', '  "SUPERSEDED",', "] as const;"),
      ),
  },
  {
    id: "M3",
    what: "a string leaf becomes an object (next-intl INSUFFICIENT_PATH)",
    file: "messages/en.json",
    expect: "RED",
    signal: "en not a leaf: related.title",
    apply: (text) =>
      editCatalog(text, (mediaHub) => {
        at(mediaHub, "related").title = { long: "Related videos", short: "Related" };
      }),
  },
  {
    id: "M4",
    what: "the Persian MEDIUM duration label loses its {from}/{to} placeholders",
    file: "messages/fa.json",
    expect: "RED",
    signal: "placeholder drift: fa:duration.MEDIUM",
    apply: (text) =>
      editCatalog(text, (mediaHub) => {
        at(mediaHub, "duration").MEDIUM = "چند دقیقه";
      }),
  },
  {
    id: "M5",
    what: "a component reads a key no catalog carries",
    file: "src/components/media/RelatedVideos.tsx",
    expect: "RED",
    signal: ABSENT_KEY,
    apply: (text) => afterBinding(text, `  const probe = t("${ABSENT_KEY}");`),
  },
  {
    id: "M6",
    what: "the same absent key, read through a RENAMED translator binding",
    file: "src/components/media/RelatedVideos.tsx",
    expect: "RED",
    signal: ABSENT_KEY,
    apply: (text) =>
      afterBinding(
        text,
        '  const tr = useTranslations("mediaHub");',
        `  const probe = tr("${ABSENT_KEY}");`,
      ),
  },
  {
    id: "M7",
    what: "the same absent key, written with SINGLE quotes",
    file: "src/components/media/RelatedVideos.tsx",
    expect: "RED",
    signal: ABSENT_KEY,
    apply: (text) => afterBinding(text, `  const probe = t('${ABSENT_KEY}');`),
  },
  {
    id: "M8",
    what: "the same absent key, mentioned only inside a // comment",
    file: "src/components/media/RelatedVideos.tsx",
    expect: "GREEN",
    apply: (text) => afterBinding(text, `  // t("${ABSENT_KEY}")`),
  },
];

/* ═══════════════════════════ the harness ═══════════════════════════ */

let clone: string;
let repoHashes: Map<string, string>;

/** Every file the audit reads, so the working tree can be proven untouched. */
function auditedFiles(root: string): string[] {
  return MUTATIONS.map((mutation) => path.join(root, mutation.file));
}

beforeAll(() => {
  clone = mkdtempSync(path.join(tmpdir(), "hermes-mediahub-guard-"));
  for (const relative of CLONED_PATHS) {
    cpSync(path.join(REPO_ROOT, relative), path.join(clone, relative), { recursive: true });
  }
  repoHashes = new Map(auditedFiles(REPO_ROOT).map((file) => [file, sha256(file)]));
});

afterAll(() => {
  // Proof, not assurance: if any mutation had escaped into the working tree,
  // this is where it would show up.
  for (const [file, hash] of repoHashes) {
    expect(sha256(file), `the working tree file ${file} was modified`).toBe(hash);
  }
  rmSync(clone, { recursive: true, force: true });
});

describe("the mediaHub guard is proven to fail", () => {
  it("clones exactly what the audit reads, and the clone is green to begin with", () => {
    // A clone that were already red would make every RED assertion below
    // meaningless, and a clone missing files would trip the audit's own floors.
    const baseline = auditMediaHub(clone);
    expect(guardViolations(baseline)).toEqual([]);
    expect(baseline.files.length).toBe(auditMediaHub(REPO_ROOT).files.length);
    expect(baseline.keys.length).toBe(auditMediaHub(REPO_ROOT).keys.length);
  });

  it.each(MUTATIONS.map((mutation) => [mutation.id, mutation] as const))(
    "%s",
    (_id, mutation) => {
      const target = path.join(clone, mutation.file);
      const original = readFileSync(target);
      const originalHash = createHash("sha256").update(original).digest("hex");

      try {
        writeFileSync(target, mutation.apply(original.toString("utf8")), "utf8");
        const violations = guardViolations(auditMediaHub(clone));

        if (mutation.expect === "RED") {
          expect(violations, `${mutation.id} — ${mutation.what} — went UNDETECTED`).not.toEqual([]);
          // …and red for the RIGHT reason, not because the splice broke parsing.
          expect(
            violations.filter((violation) => violation.includes(mutation.signal ?? "")),
            `${mutation.id} — detected, but no violation mentions ${mutation.signal}`,
          ).not.toEqual([]);
        } else {
          expect(
            violations,
            `${mutation.id} — ${mutation.what} — was falsely reported`,
          ).toEqual([]);
        }
      } finally {
        writeFileSync(target, original);
      }

      // The next case must start from the same bytes this one did.
      expect(createHash("sha256").update(readFileSync(target)).digest("hex")).toBe(originalHash);
      expect(guardViolations(auditMediaHub(clone))).toEqual([]);
    },
  );

  it("names the two cases the previous regular expression could not see", () => {
    // Documented as an assertion so the coverage cannot be quietly dropped: the
    // old pattern was /\bt(\.rich|\.has|\.markup)?\(\s*"([^"]+)"/, which requires
    // the binding to be spelled `t` and the key to be double-quoted.
    const ids = new Set(MUTATIONS.filter((m) => m.expect === "RED").map((m) => m.id));
    expect(ids.has("M6")).toBe(true); // renamed binding
    expect(ids.has("M7")).toBe(true); // single-quoted key
    expect(MUTATIONS.filter((m) => m.expect === "GREEN").map((m) => m.id)).toEqual(["M8"]);
  });
});
