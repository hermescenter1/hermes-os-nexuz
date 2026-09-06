/**
 * PHASE 109-C2.1 — parser child. Runs ONLY inside the sidecar container.
 *
 * This process is the one that touches hostile bytes, and it is built on the
 * assumption that it will be killed. Before it reads a single byte it makes
 * itself the kernel's preferred OOM victim, verifies that the change took
 * effect, and announces the verified value; the supervisor independently
 * re-reads it from `/proc/<pid>/oom_score_adj` and only then sends input.
 *
 * The parsing itself lives in `archive-reader`, which is a function and can be
 * exercised by the hostile corpus in-process. This file is the PROGRAM around
 * it: handshake, bounded stdin, exactly one terminal line, exit.
 *
 * It is compiled to CommonJS and copied into the parser image as JavaScript.
 * No TypeScript reaches the runtime.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { readArchive } from "../archive-reader";
import { INGEST_DIAGNOSTIC_CODES, type IngestDiagnosticCode } from "../diagnostics";
import {
  INGEST_LIMITS,
  REQUIRED_CHILD_OOM_SCORE_ADJ,
  REQUIRED_MEMORY_OOM_GROUP,
} from "../limits";
import { checkRuntime, crc32SelfTestPasses } from "../runtime-assert";

const OOM_SCORE_ADJ_PATH = "/proc/self/oom_score_adj";
const MEMORY_OOM_GROUP_PATH = "/sys/fs/cgroup/memory.oom.group";

let terminalEmitted = false;

/** Write the one terminal message. Any later call is a no-op by construction. */
function emit(message: unknown): void {
  if (terminalEmitted) return;
  terminalEmitted = true;
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function refuse(code: IngestDiagnosticCode, detail: string): void {
  emit({ kind: "REFUSED", code, detail: detail.slice(0, INGEST_LIMITS.maxUntrustedTextLength) });
}

/**
 * Become the preferred OOM victim, and prove it.
 *
 * Raising `oom_score_adj` needs no capability; only lowering it does. The
 * read-back is not ceremony: a write that silently failed would leave the
 * supervisor an equally likely victim, and the entire containment argument
 * rests on the child being strictly more attractive to the kernel than the
 * process that supervises it.
 */
function biasOomVictim(): number {
  writeFileSync(OOM_SCORE_ADJ_PATH, String(REQUIRED_CHILD_OOM_SCORE_ADJ));
  return Number(readFileSync(OOM_SCORE_ADJ_PATH, "utf8").trim());
}

function readStdinBounded(capBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    process.stdin.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > capBytes) {
        process.stdin.destroy();
        reject(new Error(`container exceeded ${capBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks, total)));
    process.stdin.on("error", (error) => reject(error));
  });
}

async function main(): Promise<void> {
  const C = INGEST_DIAGNOSTIC_CODES;

  let oomGroup: number;
  let adjustment: number;
  try {
    const runtime = checkRuntime();
    if (!runtime.ok) {
      refuse(C.RUNTIME_UNSUPPORTED, runtime.reason);
      return;
    }
    if (!crc32SelfTestPasses()) {
      refuse(C.RUNTIME_UNSUPPORTED, "zlib.crc32 failed its published test vector");
      return;
    }
    oomGroup = Number(readFileSync(MEMORY_OOM_GROUP_PATH, "utf8").trim());
    if (oomGroup !== REQUIRED_MEMORY_OOM_GROUP) {
      refuse(C.OOM_GROUP_UNACCEPTABLE, `memory.oom.group is ${oomGroup}`);
      return;
    }
    adjustment = biasOomVictim();
    if (adjustment !== REQUIRED_CHILD_OOM_SCORE_ADJ) {
      refuse(C.OOM_BIAS_UNVERIFIED, `oom_score_adj read back as ${adjustment}`);
      return;
    }
  } catch (error) {
    refuse(C.OOM_BIAS_UNVERIFIED, error instanceof Error ? error.message : String(error));
    return;
  }

  // Only now may the supervisor send bytes.
  process.stdout.write(
    `${JSON.stringify({ kind: "READY", oomScoreAdj: adjustment, oomGroup })}\n`,
  );

  let container: Buffer;
  try {
    container = await readStdinBounded(INGEST_LIMITS.maxContainerBytes);
  } catch (error) {
    refuse(C.CONTAINER_TOO_LARGE, error instanceof Error ? error.message : String(error));
    return;
  }

  emit(await readArchive(container));
}

void main();
