/**
 * Stage Final.1 §1 — Phase 104 rollback instructions must be portable and safe.
 *
 * `08-industrial-journal.md` shipped this as its rollback:
 *
 *     cd <absolute machine path> && git restore src docs messages scripts && rm -rf <paths>
 *
 * Wrong twice over. The path existed on one machine, so nobody else could run
 * it. And a four-directory `git restore` followed by a recursive delete would
 * have discarded every unrelated uncommitted change in the tree — other phases'
 * work included — while claiming to undo one increment.
 *
 * This gate reads the EXECUTABLE lines of every Phase 104 rollback block. Prose
 * that describes the removed command is deliberately out of scope: a gate that
 * fires on its own explanation teaches people to delete the explanation.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DOCS_DIR = join(process.cwd(), "docs/design/phase-104");

/** Fenced code inside a "Rollback" section — the part a reader would paste. */
function rollbackCommands(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let inRollback = false;
  let inFence = false;

  for (const line of lines) {
    const t = line.trim();
    if (/^#{1,6}\s/.test(t)) inRollback = /rollback/i.test(t);
    if (!inRollback) continue;
    if (t.startsWith("```")) { inFence = !inFence; continue; }
    if (!inFence) continue;
    if (!t || t.startsWith("#")) continue;      // shell comments are not commands
    out.push(t);
  }
  return out;
}

const docs = readdirSync(DOCS_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ file: f, text: readFileSync(join(DOCS_DIR, f), "utf8") }));

describe("Phase 104 rollback instructions", () => {
  it("there is at least one rollback block to check", () => {
    const total = docs.reduce((n, d) => n + rollbackCommands(d.text).length, 0);
    // A gate that finds nothing to inspect passes for the wrong reason.
    expect(total).toBeGreaterThan(0);
  });

  it.each(docs.map((d) => d.file))("%s: no absolute machine path", (file) => {
    const cmds = rollbackCommands(docs.find((d) => d.file === file)!.text);
    for (const c of cmds) {
      expect(c, `drive-letter path in: ${c}`).not.toMatch(/[A-Za-z]:[\\/]/);
      expect(c, `home path in: ${c}`).not.toMatch(/(^|\s)(\/home\/|\/Users\/|~\/)/);
    }
  });

  it.each(docs.map((d) => d.file))("%s: no broad destructive command", (file) => {
    const cmds = rollbackCommands(docs.find((d) => d.file === file)!.text);
    for (const c of cmds) {
      expect(c, `recursive delete in: ${c}`).not.toMatch(/\brm\s+-[a-z]*[rR][a-z]*\s/);
      // `git restore <dir> <dir> …` discards uncommitted work wholesale. A
      // targeted single-path restore is allowed; a sweep across trees is not.
      const restore = c.match(/\bgit\s+restore\s+(.+)$/);
      if (restore) {
        const targets = restore[1].split(/\s+/).filter((x) => x && !x.startsWith("-"));
        expect(targets.length, `broad git restore in: ${c}`).toBeLessThanOrEqual(1);
      }
      expect(c, `checkout sweep in: ${c}`).not.toMatch(/\bgit\s+checkout\s+--\s+\S+\s+\S+/);
      expect(c, `hard reset in: ${c}`).not.toMatch(/\bgit\s+reset\s+--hard\b/);
      expect(c, `clean sweep in: ${c}`).not.toMatch(/\bgit\s+clean\s+-[a-z]*[fd]/);
    }
  });

  it("the journal rollback reverts the real 104-F commit", () => {
    const doc = docs.find((d) => d.file === "08-industrial-journal.md");
    expect(doc, "08-industrial-journal.md missing").toBeDefined();
    const cmds = rollbackCommands(doc!.text);
    const revert = cmds.find((c) => /git revert/.test(c));
    expect(revert, "no git revert in the journal rollback").toBeDefined();
    // A full 40-character SHA, not an abbreviation that could grow ambiguous.
    expect(revert).toMatch(/\b[0-9a-f]{40}\b/);
  });
});
