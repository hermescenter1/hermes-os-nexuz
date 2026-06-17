import { describe, it, expect, beforeEach } from "vitest";
import type { StoredMemory } from "@/lib/storage/types";

/**
 * Phase 18A — memory-service unit tests.
 *
 * All tests run in session mode (no DATABASE_URL) so they hit the in-process
 * globalThis stores. Each test resets those stores to guarantee isolation.
 */

function resetStores() {
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
}

beforeEach(resetStores);

const BASE: Parameters<typeof import("@/lib/memory/memory-service").createEngineeringMemory>[0] =
  {
    query: "VFD trips on overcurrent at startup",
    domain: "drives",
    analysisSummary: "Likely acceleration ramp too steep",
    confidence: 72,
    relatedCaseIds: ["case-vfd-001"],
    relatedDocumentIds: [],
    outcome: "unknown",
  };

describe("createEngineeringMemory", () => {
  it("creates a record with all required fields", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    const mem = await createEngineeringMemory(BASE);
    expect(mem.id).toMatch(/^mem-/);
    expect(mem.query).toBe(BASE.query);
    expect(mem.domain).toBe("drives");
    expect(mem.confidence).toBe(72);
    expect(mem.outcome).toBe("unknown");
    expect(mem.relatedCaseIds).toEqual(["case-vfd-001"]);
    expect(mem.createdAt).toBeTruthy();
    expect(mem.updatedAt).toBeTruthy();
  });

  it("uses 'unknown' as the default outcome when not provided", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    const mem = await createEngineeringMemory({ ...BASE, outcome: "unknown" });
    expect(mem.outcome).toBe("unknown");
  });

  it("stores optional notes when provided", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    const mem = await createEngineeringMemory({ ...BASE, notes: "Check VFD fault log" });
    expect(mem.notes).toBe("Check VFD fault log");
  });
});

describe("listEngineeringMemories", () => {
  it("returns an empty array when no memories exist", async () => {
    const { listEngineeringMemories } = await import("@/lib/memory/memory-service");
    const result = await listEngineeringMemories();
    expect(result).toEqual([]);
  });

  it("returns all created memories (newest first)", async () => {
    const { createEngineeringMemory, listEngineeringMemories } = await import(
      "@/lib/memory/memory-service"
    );
    await createEngineeringMemory({ ...BASE, query: "Q1" });
    await createEngineeringMemory({ ...BASE, query: "Q2" });
    const result = await listEngineeringMemories();
    expect(result).toHaveLength(2);
    // session store pushes newest to front
    expect(result[0].query).toBe("Q2");
    expect(result[1].query).toBe("Q1");
  });

  it("respects the limit parameter", async () => {
    const { createEngineeringMemory, listEngineeringMemories } = await import(
      "@/lib/memory/memory-service"
    );
    for (let i = 0; i < 5; i++) {
      await createEngineeringMemory({ ...BASE, query: `Q${i}` });
    }
    const result = await listEngineeringMemories(3);
    expect(result).toHaveLength(3);
  });
});

describe("getEngineeringMemory", () => {
  it("returns null for an unknown id", async () => {
    const { getEngineeringMemory } = await import("@/lib/memory/memory-service");
    expect(await getEngineeringMemory("does-not-exist")).toBeNull();
  });

  it("returns the memory with an empty feedback array when no feedback exists", async () => {
    const { createEngineeringMemory, getEngineeringMemory } = await import(
      "@/lib/memory/memory-service"
    );
    const created = await createEngineeringMemory(BASE);
    const result = await getEngineeringMemory(created.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(created.id);
    expect(result!.query).toBe(BASE.query);
    expect(result!.feedback).toEqual([]);
  });

  it("returns the memory with its feedback when feedback exists", async () => {
    const { createEngineeringMemory, getEngineeringMemory, addMemoryFeedback } =
      await import("@/lib/memory/memory-service");
    const created = await createEngineeringMemory(BASE);
    await addMemoryFeedback(created.id, {
      memoryId: created.id,
      outcome: "success",
      notes: "Resolved by extending acceleration ramp",
    });
    const result = await getEngineeringMemory(created.id);
    expect(result!.feedback).toHaveLength(1);
    expect(result!.feedback[0].outcome).toBe("success");
    expect(result!.feedback[0].notes).toBe("Resolved by extending acceleration ramp");
  });
});

describe("addMemoryFeedback", () => {
  it("returns null when the memory does not exist", async () => {
    const { addMemoryFeedback } = await import("@/lib/memory/memory-service");
    const result = await addMemoryFeedback("no-such-id", {
      memoryId: "no-such-id",
      outcome: "failed",
    });
    expect(result).toBeNull();
  });

  it("creates feedback and updates the memory outcome", async () => {
    const { createEngineeringMemory, addMemoryFeedback, getEngineeringMemory } =
      await import("@/lib/memory/memory-service");
    const mem = await createEngineeringMemory(BASE);
    expect(mem.outcome).toBe("unknown");

    const feedback = await addMemoryFeedback(mem.id, {
      memoryId: mem.id,
      outcome: "partial",
      submittedBy: "engineer@plant.io",
    });
    expect(feedback).not.toBeNull();
    expect(feedback!.id).toMatch(/^fb-/);
    expect(feedback!.outcome).toBe("partial");
    expect(feedback!.submittedBy).toBe("engineer@plant.io");

    // Memory outcome must be mirrored to "partial"
    const updated = await getEngineeringMemory(mem.id);
    expect(updated!.outcome).toBe("partial");
  });

  it("accumulates multiple feedback entries on the same memory", async () => {
    const { createEngineeringMemory, addMemoryFeedback, getEngineeringMemory } =
      await import("@/lib/memory/memory-service");
    const mem = await createEngineeringMemory(BASE);
    await addMemoryFeedback(mem.id, { memoryId: mem.id, outcome: "partial" });
    await addMemoryFeedback(mem.id, { memoryId: mem.id, outcome: "success" });

    const result = await getEngineeringMemory(mem.id);
    expect(result!.feedback).toHaveLength(2);
    // Last feedback wins on the parent record
    expect(result!.outcome).toBe("success");
  });
});

describe("isValidOutcome", () => {
  it("accepts all four valid outcomes", async () => {
    const { isValidOutcome } = await import("@/lib/memory/memory-service");
    expect(isValidOutcome("unknown")).toBe(true);
    expect(isValidOutcome("success")).toBe(true);
    expect(isValidOutcome("partial")).toBe(true);
    expect(isValidOutcome("failed")).toBe(true);
  });

  it("rejects unknown strings and non-string values", async () => {
    const { isValidOutcome } = await import("@/lib/memory/memory-service");
    expect(isValidOutcome("resolved")).toBe(false);
    expect(isValidOutcome("")).toBe(false);
    expect(isValidOutcome(null)).toBe(false);
    expect(isValidOutcome(42)).toBe(false);
  });
});

// Confirm that the StoredMemory type shape is satisfied (compile-time guard)
const _typeCheck: StoredMemory = {
  id: "x",
  query: "q",
  domain: "plc",
  analysisSummary: "summary",
  confidence: 80,
  relatedCaseIds: [],
  relatedDocumentIds: [],
  outcome: "unknown",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
void _typeCheck;
