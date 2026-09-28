import { describe, it, expect } from "vitest";
import { validateFileSignature, canonicalDocumentMimeType } from "../validation";
import { encodeDocumentListCursor, decodeDocumentListCursor, isAfterCursor } from "../list-cursor";

/**
 * F-2 — upload content signatures and the document list cursor, as units.
 * The route-level behaviour is covered in src/app/api/documents/__tests__.
 */

const bytes = (...parts: Array<string | number[]>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "utf8")] : p)));

describe("validateFileSignature", () => {
  it.each([
    ["manual.pdf", bytes("%PDF-1.7\n...")],
    ["spec.docx", bytes([0x50, 0x4b, 0x03, 0x04], "word/")],
    ["notes.txt", bytes("plain ASCII text\n")],
    ["notes.txt", bytes([0xef, 0xbb, 0xbf], "BOM then text")],
    ["readme.md", bytes("# عنوان فارسی\nمتن")],
    ["readme.markdown", bytes("*emphasis*")],
    // A leading "MZ" is ordinary text (model numbers), not an executable.
    ["notes.txt", bytes("MZ-80 service notes\n")],
    ["readme.md", bytes("MZ series drive — راهنمای نصب")],
  ])("accepts %s with a matching signature", (name, b) => {
    expect(validateFileSignature(name, b)).toEqual({ ok: true });
  });

  it.each([
    ["manual.pdf", bytes("%PDX-1.7")],
    ["manual.pdf", bytes("%PD")],
    ["manual.pdf", bytes([0x4d, 0x5a], "exe")],
    ["spec.docx", bytes("%PDF-1.7")],
    ["spec.docx", bytes([0x50, 0x4b, 0x05, 0x06])], // empty-archive record, not a local file header
    ["notes.txt", bytes("a", [0x00], "b")],
    ["notes.txt", bytes([0xc3, 0x28])], // invalid UTF-8
    ["notes.txt", bytes("%PDF-1.4")],
    ["notes.txt", bytes([0x50, 0x4b, 0x03, 0x04])],
    ["notes.txt", bytes([0x7f, 0x45, 0x4c, 0x46])],
    ["readme.md", bytes([0x4d, 0x5a, 0x90])], // invalid UTF-8 after the MZ
    // A real DOS/PE header: "MZ" followed by NUL bytes — refused by the NUL rule.
    ["notes.txt", bytes([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])],
  ])("rejects %s whose bytes do not match (file_signature_mismatch)", (name, b) => {
    expect(validateFileSignature(name, b)).toEqual({ ok: false, reason: "file_signature_mismatch" });
  });

  it("refuses an extension outside the allow-list outright", () => {
    expect(validateFileSignature("tool.exe", bytes([0x4d, 0x5a]))).toEqual({
      ok: false,
      reason: "unsupported_file_type",
    });
  });
});

describe("canonicalDocumentMimeType", () => {
  it.each([
    ["a.pdf", "application/pdf"],
    ["a.PDF", "application/pdf"],
    ["a.txt", "text/plain"],
    ["a.md", "text/markdown"],
    ["a.markdown", "text/markdown"],
    ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ])("%s → %s, independent of the declared type", (name, mime) => {
    expect(canonicalDocumentMimeType(name)).toBe(mime);
  });
});

describe("document list cursor", () => {
  const cursor = { createdAt: "2026-09-24T10:00:00.000Z", id: "cm1abc" };

  it("round-trips through its opaque encoding", () => {
    const raw = encodeDocumentListCursor(cursor);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeDocumentListCursor(raw)).toEqual(cursor);
  });

  it.each([
    ["empty", ""],
    ["non-base64url characters", "abc+/="],
    ["too long", "a".repeat(513)],
    ["not JSON", Buffer.from("hello").toString("base64url")],
    ["missing id", Buffer.from(JSON.stringify({ t: cursor.createdAt })).toString("base64url")],
    ["empty id", Buffer.from(JSON.stringify({ t: cursor.createdAt, i: "" })).toString("base64url")],
    ["not a timestamp", Buffer.from(JSON.stringify({ t: "yesterday", i: "x" })).toString("base64url")],
    ["an extra key", Buffer.from(JSON.stringify({ t: cursor.createdAt, i: "x", org: "org-b" })).toString("base64url")],
    ["an overlong id", Buffer.from(JSON.stringify({ t: cursor.createdAt, i: "x".repeat(129) })).toString("base64url")],
  ])("refuses %s", (_name, raw) => {
    expect(decodeDocumentListCursor(raw)).toBeNull();
  });

  it("orders exactly like createdAt DESC, id DESC", () => {
    expect(isAfterCursor({ createdAt: "2026-09-24T09:59:59.999Z", id: "zzz" }, cursor)).toBe(true);
    expect(isAfterCursor({ createdAt: cursor.createdAt, id: "cm1abb" }, cursor)).toBe(true);
    expect(isAfterCursor({ createdAt: cursor.createdAt, id: cursor.id }, cursor)).toBe(false);
    expect(isAfterCursor({ createdAt: cursor.createdAt, id: "cm1abd" }, cursor)).toBe(false);
    expect(isAfterCursor({ createdAt: "2026-09-24T10:00:00.001Z", id: "a" }, cursor)).toBe(false);
  });
});
