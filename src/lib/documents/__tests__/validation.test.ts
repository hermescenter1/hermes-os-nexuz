import { describe, it, expect } from "vitest";
import {
  isDocumentSourceType,
  validateSourceType,
  validateTitle,
  validateFilename,
  validateFileType,
  validateFileSize,
  extensionOf,
  parseTags,
} from "../validation";
import { MAX_DOCUMENT_SIZE_BYTES } from "../config";

describe("isDocumentSourceType / validateSourceType", () => {
  it("accepts every documented source type", () => {
    for (const s of [
      "manual",
      "datasheet",
      "commissioning_report",
      "engineering_report",
      "troubleshooting_note",
      "safety_procedure",
      "maintenance_procedure",
      "factory_knowledge",
    ]) {
      expect(isDocumentSourceType(s)).toBe(true);
      expect(validateSourceType(s).ok).toBe(true);
    }
  });
  it("rejects an empty value", () => {
    expect(validateSourceType("").reason).toBe("source_type_required");
  });
  it("rejects an unrecognized value", () => {
    expect(validateSourceType("invoice").reason).toBe("invalid_source_type");
  });
});

describe("validateTitle", () => {
  it("accepts a normal title", () => {
    expect(validateTitle("S7-1500 Manual").ok).toBe(true);
  });
  it("rejects empty/whitespace-only", () => {
    expect(validateTitle("").reason).toBe("title_required");
    expect(validateTitle("   ").reason).toBe("title_required");
  });
  it("rejects an excessively long title", () => {
    expect(validateTitle("x".repeat(201)).reason).toBe("title_too_long");
  });
});

describe("validateFilename", () => {
  it("accepts a normal filename", () => {
    expect(validateFilename("manual.pdf").ok).toBe(true);
  });
  it("rejects empty", () => {
    expect(validateFilename("").reason).toBe("filename_required");
  });
  it("rejects path-traversal-shaped names", () => {
    expect(validateFilename("../../etc/passwd").reason).toBe("filename_invalid");
    expect(validateFilename("a/b.pdf").reason).toBe("filename_invalid");
    expect(validateFilename("a\\b.pdf").reason).toBe("filename_invalid");
  });
  it("rejects an excessively long filename", () => {
    expect(validateFilename("x".repeat(256) + ".pdf").reason).toBe("filename_too_long");
  });
});

describe("extensionOf", () => {
  it("extracts a lowercase extension", () => {
    expect(extensionOf("Manual.PDF")).toBe("pdf");
    expect(extensionOf("notes.md")).toBe("md");
    expect(extensionOf("no-extension")).toBe("");
  });
});

describe("validateFileType", () => {
  it("accepts every allowed type: pdf, txt, md, markdown, docx", () => {
    expect(validateFileType("application/pdf", "manual.pdf").ok).toBe(true);
    expect(validateFileType("text/plain", "notes.txt").ok).toBe(true);
    expect(validateFileType("text/markdown", "notes.md").ok).toBe(true);
    expect(validateFileType("text/markdown", "notes.markdown").ok).toBe(true);
    expect(
      validateFileType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "report.docx"
      ).ok
    ).toBe(true);
  });
  it("accepts a generic octet-stream MIME type as long as the extension is allowed", () => {
    expect(validateFileType("application/octet-stream", "notes.md").ok).toBe(true);
  });
  it("rejects a disallowed extension regardless of MIME type", () => {
    expect(validateFileType("application/pdf", "script.exe").reason).toBe("unsupported_file_type");
  });
  it("rejects an allowed extension paired with a disallowed MIME type", () => {
    expect(validateFileType("application/x-msdownload", "manual.pdf").reason).toBe(
      "unsupported_file_type"
    );
  });
});

describe("validateFileSize", () => {
  it("accepts a normal size", () => {
    expect(validateFileSize(1024).ok).toBe(true);
  });
  it("rejects zero/negative size", () => {
    expect(validateFileSize(0).reason).toBe("file_empty");
    expect(validateFileSize(-1).reason).toBe("file_empty");
  });
  it("rejects a size over the configured cap", () => {
    expect(validateFileSize(MAX_DOCUMENT_SIZE_BYTES + 1).reason).toBe("file_too_large");
  });
  it("accepts exactly the cap", () => {
    expect(validateFileSize(MAX_DOCUMENT_SIZE_BYTES).ok).toBe(true);
  });
});

describe("parseTags", () => {
  it("splits, trims, and drops empties", () => {
    expect(parseTags("s7-1500, manual ,, siemens")).toEqual(["s7-1500", "manual", "siemens"]);
  });
  it("returns [] for an empty string", () => {
    expect(parseTags("")).toEqual([]);
  });
});
