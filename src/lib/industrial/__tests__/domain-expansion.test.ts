import { describe, it, expect } from "vitest";
import { classify } from "../brain-core";

const ids = (q: string) => {
  const c = classify(q);
  return { unknown: !!c.unknown, domains: c.domains.map((d) => d.id) };
};

describe("Domain Expansion Patch", () => {
  it("Test A: unknown MAC on OT network after maintenance -> OT+Cyber+Maintenance", () => {
    const r = ids("Unknown MAC address detected on OT network after maintenance shutdown");
    expect(r.unknown).toBe(false);
    expect(r.domains).toContain("otNetwork");
    expect(r.domains).toContain("cybersecurity");
    expect(r.domains).toContain("maintenance");
  });

  it("Test B: packaging line stops after replacing a PROFINET switch -> OT+PLC+Maintenance", () => {
    const r = ids("Packaging line randomly stops every few hours after replacing a PROFINET switch");
    expect(r.unknown).toBe(false);
    expect(r.domains).toContain("otNetwork");
    expect(r.domains).toContain("plc");
    expect(r.domains).toContain("maintenance");
  });

  it("Test C: WinCC values freeze after switch replacement -> SCADA+OT+Maintenance", () => {
    const r = ids("WinCC alarms update but process values freeze after switch replacement");
    expect(r.unknown).toBe(false);
    expect(r.domains).toContain("scada");
    expect(r.domains).toContain("otNetwork");
    expect(r.domains).toContain("maintenance");
  });

  it("Test D: vague query stays Unknown (no forced expansion)", () => {
    expect(ids("Something is wrong").unknown).toBe(true);
    expect(ids("Machine behaves strangely").unknown).toBe(true);
    expect(ids("Unexpected issue").unknown).toBe(true);
  });

  it("cyber expansion requires BOTH anomaly AND OT-network context", () => {
    // anomaly word but no OT term -> no cyber injection from this rule
    const r = ids("intrusion alarm on the packaging machine motor");
    // motor query should classify, but cybersecurity not added without OT terms
    if (!r.unknown) expect(r.domains).not.toContain("cybersecurity");
  });

  it("PLC expansion does not fire without OT network context", () => {
    // 'controller' alone, no OT/network term -> PLC not injected by expansion
    const r = ids("Motor winding smells burned");
    expect(r.domains).not.toContain("plc");
  });

  it("maintenance expansion alone never rescues a vague query", () => {
    // 'replaced' is a maintenance term but the query is otherwise contentless
    expect(ids("something was replaced and now it is weird").unknown).toBe(true);
  });
});
