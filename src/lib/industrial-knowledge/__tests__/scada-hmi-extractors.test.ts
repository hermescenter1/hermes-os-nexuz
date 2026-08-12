import { describe, it, expect } from "vitest";
import { extractScadaJs, stripScadaNonCode } from "../extractors/scada-js";
import {
  extractHmi,
  parseHmiDefinition,
  unguardedCommands,
  HmiDefinitionError,
} from "../extractors/hmi";

describe("PHASE 101 — SCADA scripting extractor", () => {
  it("recovers reads and writes from tag accessors", () => {
    const result = extractScadaJs(
      [
        "function OnHydraulicAlarm() {",
        '  const p = Tags("HYD_PRESSURE_ACT").Read();',
        '  Tags("ALM_ACK_PENDING").Write(true);',
        "}",
      ].join("\n"),
    );

    expect(result.units.map((u) => u.name)).toEqual(["OnHydraulicAlarm"]);
    expect(result.reads).toEqual(["HYD_PRESSURE_ACT"]);
    expect(result.writes).toEqual(["ALM_ACK_PENDING"]);
  });

  it("treats a bare tag accessor as a read, never as a write", () => {
    // Calling this a write would invent a capability the script never used.
    const result = extractScadaJs('function F() { return Tags("LINE_RUNNING"); }');
    expect(result.reads).toEqual(["LINE_RUNNING"]);
    expect(result.writes).toEqual([]);
  });

  it("ignores tag-like text inside comments and trace messages", () => {
    const result = extractScadaJs(
      [
        "function OnStart() {",
        '  // Tags("COMMENTED_OUT").Write(1);',
        '  HMIRuntime.Trace("do not touch Tags(\\"IN_A_MESSAGE\\")");',
        '  Tags("REAL_TAG").Read();',
        "}",
      ].join("\n"),
    );

    expect(result.reads).toEqual(["REAL_TAG"]);
    expect(result.writes).toEqual([]);
  });

  it("preserves line positions when blanking non-code", () => {
    const source = ['function F() {', '  // comment', '  Tags("T").Read();', "}"].join("\n");
    const stripped = stripScadaNonCode(source);
    expect(stripped.split("\n")).toHaveLength(4);
    expect(stripped.split("\n")[1]).toHaveLength(source.split("\n")[1].length);
  });

  it("does not let a brace inside a string end a function early", () => {
    const result = extractScadaJs(
      [
        "function OnEvent() {",
        '  HMIRuntime.Trace("closing brace } inside a message");',
        '  Tags("AFTER_THE_STRING").Read();',
        "}",
      ].join("\n"),
    );

    expect(result.reads).toEqual(["AFTER_THE_STRING"]);
  });

  it("records screen navigation as a call", () => {
    const result = extractScadaJs(
      ['function OnDrillDown() { OpenScreen("SCR_DRIVES"); }'].join("\n"),
    );
    expect(result.calls).toEqual(["SCR_DRIVES"]);
  });

  it("reports the line a tag access was found on", () => {
    const result = extractScadaJs(
      ["function F() {", "", "", '  Tags("T").Read();', "}"].join("\n"),
    );
    expect(result.units[0].relations[0].line).toBe(4);
  });

  it("is deterministic", () => {
    const source = 'function F() { Tags("A").Read(); Tags("B").Write(1); }';
    expect(JSON.stringify(extractScadaJs(source))).toBe(JSON.stringify(extractScadaJs(source)));
  });
});

const SCREENS = JSON.stringify(
  {
    screens: [
      {
        name: "SCR_OVERVIEW",
        titleEn: "Line overview",
        titleFa: "نمای کلی خط",
        navigatesTo: ["SCR_DRIVES"],
        objects: [
          { name: "FP_FILLER", type: "FACEPLATE", displays: ["FILLER_SPEED_ACT"] },
          {
            name: "BTN_ACK",
            type: "BUTTON",
            commands: ["ALM_ACK_PENDING"],
            permission: "operator.acknowledge",
            requiresConfirmation: true,
          },
        ],
      },
      { name: "SCR_DRIVES", objects: [{ name: "TRD_SPEED", type: "TREND", displays: ["FILLER_SPEED_ACT"] }] },
    ],
  },
  null,
  2,
);

describe("PHASE 101 — HMI definition extractor", () => {
  it("maps displays to reads, commands to writes and navigation to calls", () => {
    const result = extractHmi(SCREENS);

    expect(result.units.map((u) => u.name)).toEqual(["SCR_OVERVIEW", "SCR_DRIVES"]);
    expect(result.reads).toEqual(["FILLER_SPEED_ACT"]);
    expect(result.writes).toEqual(["ALM_ACK_PENDING"]);
    expect(result.calls).toEqual(["SCR_DRIVES"]);
  });

  it("rejects a definition that does not parse instead of extracting nothing", () => {
    expect(() => parseHmiDefinition("{ not json")).toThrow(HmiDefinitionError);
  });

  it("rejects a screen without a name", () => {
    expect(() => parseHmiDefinition('{"screens":[{"objects":[]}]}')).toThrow(HmiDefinitionError);
  });

  it("rejects an object without a type", () => {
    expect(() =>
      parseHmiDefinition('{"screens":[{"name":"S","objects":[{"name":"O"}]}]}'),
    ).toThrow(HmiDefinitionError);
  });

  it("reports a command that carries no permission or no confirmation", () => {
    const unguarded = JSON.stringify({
      screens: [
        { name: "SCR_X", objects: [{ name: "BTN_START", type: "BUTTON", commands: ["MOTOR_START"] }] },
      ],
    });

    const findings = unguardedCommands(unguarded);
    expect(findings.map((f) => f.reason).sort()).toEqual(["NO_CONFIRMATION", "NO_PERMISSION"]);
  });

  it("reports nothing for a properly guarded command", () => {
    expect(unguardedCommands(SCREENS)).toEqual([]);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(extractHmi(SCREENS))).toBe(JSON.stringify(extractHmi(SCREENS)));
  });
});
