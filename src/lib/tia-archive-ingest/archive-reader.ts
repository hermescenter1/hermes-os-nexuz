/**
 * PHASE 109-C2.1 — the archive reader.
 *
 * Separated from the child entry point on purpose: the entry point is a
 * PROGRAM (it performs the OOM handshake, reads stdin and exits), while this is
 * a FUNCTION. Only a function can be exercised by the hostile corpus in-process,
 * and a policy that is only reachable by spawning a container is a policy that
 * will not be tested at the density it needs.
 *
 * It streams. Bytes flow through SHA-256 and CRC-32 and are discarded, so no
 * entry is ever resident and peak memory is bounded by the inflate window
 * rather than by the largest entry. Nothing but paths, sizes and digests leaves
 * this module.
 */

import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";

import { fromBuffer, type Entry, type ZipFile } from "yauzl";

import { classifyContainer } from "./container-classifier";
import { INGEST_DIAGNOSTIC_CODES, type IngestDiagnosticCode } from "./diagnostics";
import { classifyEntry, type CentralEntry } from "./entry-policy";
import { headerMismatches } from "./header-reconciler";
import { INGEST_LIMITS } from "./limits";
import type { IngestedEntry, TerminalMessage } from "./protocol";

function refused(code: IngestDiagnosticCode, detail: string): TerminalMessage {
  return {
    kind: "REFUSED",
    code,
    detail: detail.slice(0, INGEST_LIMITS.maxUntrustedTextLength),
  } as TerminalMessage;
}

/**
 * Translate a yauzl refusal into a Hermes code.
 *
 * yauzl applies several of its own checks while walking the central directory
 * and aborts BEFORE emitting the entry, so those entries never reach the policy
 * modules. Rather than let every such refusal collapse into a generic
 * "unreadable", the library's verdict is translated into the specific code that
 * describes it. The message strings below were measured against yauzl 3.4.0,
 * and the default branch is deliberately conservative: an unrecognised message
 * is still a refusal.
 *
 * This is translation, not parsing — no ZIP structure is decoded here.
 */
export function mapReaderError(message: string): IngestDiagnosticCode {
  const C = INGEST_DIAGNOSTIC_CODES;
  if (/^invalid relative path/.test(message)) {
    return "AES-C2-006" as IngestDiagnosticCode; // C2.0 PATH_TRAVERSAL_REJECTED
  }
  if (/^absolute path:\s*[A-Za-z]:/.test(message)) {
    return "AES-C2-005" as IngestDiagnosticCode; // C2.0 DRIVE_QUALIFIED_PATH_REJECTED
  }
  if (/^absolute path:/.test(message)) {
    return "AES-C2-004" as IngestDiagnosticCode; // C2.0 ABSOLUTE_PATH_REJECTED
  }
  if (/invalid characters in fileName/.test(message)) return C.FILENAME_CHARACTERS_REJECTED;
  if (/extra field length exceeds/.test(message)) return C.EXTRA_FIELD_MALFORMED;
  if (/compressed\/uncompressed size mismatch/.test(message)) return C.DECLARED_SIZE_INCONSISTENT;
  return C.CONTAINER_UNREADABLE;
}

function toCentralEntry(entry: Entry): CentralEntry {
  return {
    decodedName: entry.fileName,
    rawName: entry.fileNameRaw.toString("utf8"),
    generalPurposeBitFlag: entry.generalPurposeBitFlag,
    compressionMethod: entry.compressionMethod,
    crc32: entry.crc32,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    versionMadeBy: entry.versionMadeBy,
    externalFileAttributes: entry.externalFileAttributes,
    localHeaderOffset: entry.relativeOffsetOfLocalHeader,
    extraFields: entry.extraFields.map((field) => ({ id: field.id, data: field.data })),
    extraFieldRawLength: entry.extraFieldRaw.length,
  };
}

/** Walk a raw central-directory extra-field region and collect its ids. */
export function extraFieldIdsOf(raw: Uint8Array): number[] {
  const ids: number[] = [];
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let offset = 0;
  while (offset + 4 <= raw.length) {
    ids.push(view.getUint16(offset, true));
    const size = view.getUint16(offset + 2, true);
    offset += 4 + size;
  }
  return ids;
}

function reconcileHeaders(zip: ZipFile, entry: Entry): Promise<readonly string[]> {
  return new Promise((resolve) => {
    zip.readLocalFileHeader(entry, {}, (error, header) => {
      if (error || !header) {
        resolve(["local file header unreadable"]);
        return;
      }
      const problems = headerMismatches(
        {
          generalPurposeBitFlag: header.generalPurposeBitFlag,
          compressionMethod: header.compressionMethod,
          crc32: header.crc32,
          compressedSize: header.compressedSize,
          uncompressedSize: header.uncompressedSize,
          fileNameBytes: header.fileName,
          extraFieldIds: extraFieldIdsOf(header.extraField),
        },
        {
          generalPurposeBitFlag: entry.generalPurposeBitFlag,
          compressionMethod: entry.compressionMethod,
          crc32: entry.crc32,
          compressedSize: entry.compressedSize,
          uncompressedSize: entry.uncompressedSize,
          fileNameBytes: entry.fileNameRaw,
          extraFieldIds: entry.extraFields.map((field) => field.id),
        },
      );
      resolve(problems.map((problem) => `${problem.field}: ${problem.detail}`));
    });
  });
}

interface EntryDigest {
  readonly sha256: string;
  readonly crc32: number;
  readonly observedBytes: number;
}

/**
 * Stream one entry through both digests, aborting the moment a budget is
 * exceeded rather than after the read completes.
 *
 * yauzl does NOT verify entry CRC — it only reads the value out of the header.
 * The comparison performed by the caller is therefore the only CRC check that
 * happens anywhere in this pipeline.
 */
function streamEntry(zip: ZipFile, entry: Entry, remainingTotal: number): Promise<EntryDigest> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("no read stream"));
        return;
      }
      const hash = createHash("sha256");
      let running = 0;
      let observed = 0;
      stream.on("data", (chunk: Buffer) => {
        observed += chunk.length;
        if (observed > INGEST_LIMITS.maxObservedEntryBytes) {
          stream.destroy();
          reject(new Error("OBSERVED_ENTRY_LIMIT"));
          return;
        }
        if (observed > remainingTotal) {
          stream.destroy();
          reject(new Error("OBSERVED_TOTAL_LIMIT"));
          return;
        }
        hash.update(chunk);
        running = crc32(chunk, running);
      });
      stream.on("error", (streamError) => reject(streamError));
      stream.on("end", () =>
        resolve({ sha256: hash.digest("hex"), crc32: running >>> 0, observedBytes: observed }),
      );
    });
  });
}

/**
 * Read one container and return exactly one terminal message.
 *
 * The first refusal wins and stops the walk. Continuing after a refusal would
 * mean spending time and memory on an archive already known to be inadmissible.
 */
export function readArchive(container: Uint8Array): Promise<TerminalMessage> {
  const C = INGEST_DIAGNOSTIC_CODES;

  const kind = classifyContainer(container);
  if (!kind.ok) return Promise.resolve(refused(kind.code, kind.detail));

  const buffer = Buffer.from(container.buffer, container.byteOffset, container.byteLength);

  return new Promise<TerminalMessage>((resolve) => {
    let settled = false;
    const settle = (message: TerminalMessage): void => {
      if (settled) return;
      settled = true;
      resolve(message);
    };

    fromBuffer(
      buffer,
      {
        lazyEntries: true,
        autoClose: false,
        decodeStrings: true,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (openError, zip) => {
        if (openError || !zip) {
          const message = String(openError?.message ?? "unreadable");
          settle(refused(mapReaderError(message), message));
          return;
        }
        if (zip.entryCount > INGEST_LIMITS.maxEntries) {
          settle(refused(C.TOO_MANY_ENTRIES, `${zip.entryCount} entries declared`));
          return;
        }

        const seenPaths = new Set<string>();
        const entries: IngestedEntry[] = [];
        let observedTotal = 0;

        zip.on("error", (zipError) =>
          settle(refused(mapReaderError(zipError.message), zipError.message)),
        );

        zip.on("entry", (entry: Entry) => {
          void (async () => {
            const verdict = classifyEntry(toCentralEntry(entry), seenPaths);
            if (!verdict.ok) {
              const first = verdict.problems[0];
              settle(
                refused(
                  (first?.code ?? C.CONTAINER_UNREADABLE) as IngestDiagnosticCode,
                  `${entry.fileName}: ${first?.detail ?? "refused"}`,
                ),
              );
              return;
            }

            const mismatches = await reconcileHeaders(zip, entry);
            if (mismatches.length > 0) {
              settle(
                refused(C.LOCAL_CENTRAL_MISMATCH, `${verdict.canonicalPath}: ${mismatches.join("; ")}`),
              );
              return;
            }

            try {
              const digest = await streamEntry(
                zip,
                entry,
                INGEST_LIMITS.maxObservedTotalBytes - observedTotal,
              );
              if ((digest.crc32 >>> 0) !== (entry.crc32 >>> 0)) {
                settle(
                  refused(C.CRC_MISMATCH, `${verdict.canonicalPath}: streamed crc differs from central`),
                );
                return;
              }
              observedTotal += digest.observedBytes;
              entries.push({
                path: verdict.canonicalPath,
                observedBytes: digest.observedBytes,
                sha256: digest.sha256,
                crc32: digest.crc32,
              });
              zip.readEntry();
            } catch (streamError) {
              const message = streamError instanceof Error ? streamError.message : String(streamError);
              if (message.includes("OBSERVED_ENTRY_LIMIT")) {
                settle(refused(C.OBSERVED_ENTRY_TOO_LARGE, verdict.canonicalPath));
              } else if (message.includes("OBSERVED_TOTAL_LIMIT")) {
                settle(refused(C.OBSERVED_TOTAL_TOO_LARGE, verdict.canonicalPath));
              } else {
                settle(refused(C.CONTAINER_UNREADABLE, `${verdict.canonicalPath}: ${message}`));
              }
            }
          })();
        });

        zip.on("end", () => {
          settle({
            kind: "DONE",
            result: {
              entryCount: entries.length,
              entries,
              observedTotalBytes: observedTotal,
            },
          } as TerminalMessage);
        });

        zip.readEntry();
      },
    );
  });
}
