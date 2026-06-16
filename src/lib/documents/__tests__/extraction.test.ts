import { describe, it, expect } from "vitest";
import { isExtractable, extractText } from "../extraction";

describe("isExtractable", () => {
  it("accepts .txt, .md, .markdown", () => {
    expect(isExtractable("notes.txt")).toBe(true);
    expect(isExtractable("notes.md")).toBe(true);
    expect(isExtractable("notes.markdown")).toBe(true);
  });
  it("is case-insensitive on extension", () => {
    expect(isExtractable("NOTES.TXT")).toBe(true);
  });
  it("rejects PDF and DOCX — no parser exists yet", () => {
    expect(isExtractable("manual.pdf")).toBe(false);
    expect(isExtractable("report.docx")).toBe(false);
  });
  it("rejects an unrecognized extension", () => {
    expect(isExtractable("data.bin")).toBe(false);
  });
});

describe("extractText — TXT", () => {
  it("succeeds for plain text content", () => {
    const res = extractText(Buffer.from("Hello, this is a plain text manual.", "utf8"), "notes.txt");
    expect(res.ok).toBe(true);
    expect(res.text).toBe("Hello, this is a plain text manual.");
    expect(res.reason).toBeUndefined();
  });

  it("preserves multi-line content", () => {
    const content = "Line one\nLine two\nLine three";
    const res = extractText(Buffer.from(content, "utf8"), "notes.txt");
    expect(res.text).toBe(content);
  });
});

describe("extractText — Markdown", () => {
  it("succeeds for markdown content (extracted as raw text, no markdown parsing)", () => {
    const content = "# Title\n\nSome **bold** text and a [link](https://example.com).";
    const res = extractText(Buffer.from(content, "utf8"), "notes.md");
    expect(res.ok).toBe(true);
    expect(res.text).toBe(content);
  });
  it("also works for the .markdown extension", () => {
    const res = extractText(Buffer.from("# Hi", "utf8"), "notes.markdown");
    expect(res.ok).toBe(true);
  });
});

describe("extractText — unsupported types (PDF/DOCX) fail safely", () => {
  it("never attempts extraction for a PDF — returns a safe, enumerated reason", () => {
    const res = extractText(Buffer.from("%PDF-1.4 binary garbage", "utf8"), "manual.pdf");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("unsupported_extraction_type");
    expect(res.text).toBeUndefined();
  });
  it("never attempts extraction for a DOCX — returns a safe, enumerated reason", () => {
    const res = extractText(Buffer.from("PK\x03\x04 zip garbage", "utf8"), "report.docx");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("unsupported_extraction_type");
  });
});

describe("extractText — empty content", () => {
  it("rejects an empty file", () => {
    const res = extractText(Buffer.from("", "utf8"), "empty.txt");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("empty_content");
  });
  it("rejects a whitespace-only file", () => {
    const res = extractText(Buffer.from("   \n\t  ", "utf8"), "blank.txt");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("empty_content");
  });
});
