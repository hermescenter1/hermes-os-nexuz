import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "../dr/backup-envelope.mjs";

/**
 * PHASE 98 — streaming `.hbk` CLI: round trip, failure injection, and byte-format
 * compatibility with the in-memory envelope library (both directions).
 */

const CLI = join(process.cwd(), "scripts", "dr", "hbk.mjs");
const KEY_HEX = "e".repeat(64);
const KEY = Buffer.from(KEY_HEX, "hex");

function run(args: string[]) {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8" });
}

// Key files must be owner-only (loadKeyFile refuses a group/other-readable key on
// POSIX). Write then chmod 0600 so the tests pass on Linux (and match operators).
function writeKey(path: string, hex: string) {
  writeFileSync(path, hex + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

let dir: string;
let keyFile: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "hermes-hbk-"));
  keyFile = join(dir, "key.hex");
  writeKey(keyFile, KEY_HEX);
});

describe("HBK CLI — round trip", () => {
  it("encrypts then decrypts a file back to identical bytes", () => {
    const plain = join(dir, "dump.bin");
    const sealed = join(dir, "dump.hbk");
    const back = join(dir, "dump.out");
    const data = randomBytes(200_000); // larger than a chunk to exercise streaming
    writeFileSync(plain, data);

    const encOut = run(["encrypt", "--in", plain, "--out", sealed, "--key-file", keyFile, "--key-id", "cli-key", "--type", "postgres", "--created", "2026-08-07T00:00:00.000Z"]);
    expect(encOut).toMatch(/TRANSPORT_SHA256=[0-9a-f]{64}/);
    expect(encOut).toMatch(/hbk=PASS/);

    run(["verify", "--in", sealed, "--key-file", keyFile, "--type", "postgres"]);
    run(["decrypt", "--in", sealed, "--out", back, "--key-file", keyFile, "--type", "postgres"]);
    expect(readFileSync(back).equals(data)).toBe(true);
  });

  it("header subcommand prints safe metadata without decrypting", () => {
    const plain = join(dir, "h.bin");
    const sealed = join(dir, "h.hbk");
    writeFileSync(plain, Buffer.from("meta"));
    run(["encrypt", "--in", plain, "--out", sealed, "--key-file", keyFile, "--key-id", "cli-key", "--type", "uploads"]);
    const hdr = JSON.parse(run(["header", "--in", sealed]));
    expect(hdr.cipher).toBe("aes-256-gcm");
    expect(hdr.artifactType).toBe("uploads");
    expect(hdr.keyId).toBe("cli-key");
  });
});

describe("HBK CLI — failure injection (fail closed)", () => {
  it("wrong key fails decryption with non-zero exit", () => {
    const plain = join(dir, "w.bin");
    const sealed = join(dir, "w.hbk");
    const badKeyFile = join(dir, "bad.hex");
    writeFileSync(plain, randomBytes(1000));
    writeKey(badKeyFile, "f".repeat(64));
    run(["encrypt", "--in", plain, "--out", sealed, "--key-file", keyFile, "--key-id", "k", "--type", "postgres"]);
    expect(() => run(["verify", "--in", sealed, "--key-file", badKeyFile])).toThrow();
  });

  it("corrupted ciphertext fails decryption", () => {
    const plain = join(dir, "c.bin");
    const sealed = join(dir, "c.hbk");
    writeFileSync(plain, randomBytes(5000));
    run(["encrypt", "--in", plain, "--out", sealed, "--key-file", keyFile, "--key-id", "k", "--type", "postgres"]);
    const buf = readFileSync(sealed);
    buf[Math.floor(buf.length / 2)] ^= 0xff;
    writeFileSync(sealed, buf);
    expect(() => run(["verify", "--in", sealed, "--key-file", keyFile])).toThrow();
  });

  it("artifact-type mismatch is rejected", () => {
    const plain = join(dir, "t.bin");
    const sealed = join(dir, "t.hbk");
    writeFileSync(plain, Buffer.from("x"));
    run(["encrypt", "--in", plain, "--out", sealed, "--key-file", keyFile, "--key-id", "k", "--type", "postgres"]);
    expect(() => run(["verify", "--in", sealed, "--key-file", keyFile, "--type", "uploads"])).toThrow();
  });
});

describe("HBK CLI — byte-format compatibility with in-memory library", () => {
  it("CLI-sealed artifact decrypts with the in-memory library", () => {
    const plain = join(dir, "compat1.bin");
    const sealed = join(dir, "compat1.hbk");
    const data = randomBytes(3000);
    writeFileSync(plain, data);
    run(["encrypt", "--in", plain, "--out", sealed, "--key-file", keyFile, "--key-id", "k", "--type", "postgres"]);
    const { plaintext } = decrypt({ buffer: readFileSync(sealed), key: KEY, expectArtifactType: "postgres" });
    expect(plaintext.equals(data)).toBe(true);
  });

  it("library-sealed artifact decrypts with the CLI", () => {
    const data = randomBytes(3000);
    const sealed = join(dir, "compat2.hbk");
    const out = join(dir, "compat2.out");
    const buf = encrypt({ plaintext: data, key: KEY, keyId: "k", artifactType: "uploads", createdAt: "2026-08-07T00:00:00.000Z" });
    writeFileSync(sealed, buf);
    run(["decrypt", "--in", sealed, "--out", out, "--key-file", keyFile, "--type", "uploads"]);
    expect(readFileSync(out).equals(data)).toBe(true);
  });
});
