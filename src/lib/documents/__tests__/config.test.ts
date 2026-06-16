import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDocumentStorageProvider, getLocalDocumentStorageDir, MAX_DOCUMENT_SIZE_BYTES } from "../config";

const ENV_KEYS = ["HERMES_DOCUMENT_STORAGE_PROVIDER", "HERMES_LOCAL_DOCUMENT_STORAGE_DIR"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getDocumentStorageProvider", () => {
  it("defaults to local when unset", () => {
    expect(getDocumentStorageProvider()).toBe("local");
  });
  it("accepts minio and s3 overrides", () => {
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "minio";
    expect(getDocumentStorageProvider()).toBe("minio");
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "s3";
    expect(getDocumentStorageProvider()).toBe("s3");
  });
  it("falls back to local for an invalid value", () => {
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "not-a-real-provider";
    expect(getDocumentStorageProvider()).toBe("local");
  });
  it("is case-insensitive", () => {
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "MINIO";
    expect(getDocumentStorageProvider()).toBe("minio");
  });
});

describe("getLocalDocumentStorageDir", () => {
  it("defaults to .data/documents when unset", () => {
    expect(getLocalDocumentStorageDir()).toBe(".data/documents");
  });
  it("respects an override", () => {
    process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = "/tmp/custom-docs";
    expect(getLocalDocumentStorageDir()).toBe("/tmp/custom-docs");
  });
});

describe("MAX_DOCUMENT_SIZE_BYTES", () => {
  it("is a sane, positive size cap", () => {
    expect(MAX_DOCUMENT_SIZE_BYTES).toBeGreaterThan(0);
    expect(MAX_DOCUMENT_SIZE_BYTES).toBe(50 * 1024 * 1024);
  });
});
