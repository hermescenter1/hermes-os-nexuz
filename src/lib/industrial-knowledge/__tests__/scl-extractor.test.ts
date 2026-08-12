import { describe, it, expect } from "vitest";
import { extractScl, stripNonCode, stripDeclarations, symbolsIn } from "../extractors/scl";

describe("PHASE 101 — SCL / Structured Text extractor", () => {
  it("blanks comments and string literals without moving any line", () => {
    const source = [
      'A := 1; // "NotATag"',
      '(* "AlsoNotATag" *)',
      "B := 'literal with \"quotes\"';",
      'C := "RealTag";',
    ].join("\n");

    const stripped = stripNonCode(source);

    expect(stripped.split("\n")).toHaveLength(4);
    expect(stripped.split("\n")[0]).toHaveLength(source.split("\n")[0].length);
    expect(symbolsIn(stripped)).toEqual(["RealTag"]);
  });

  it("removes declaration sections so interface members are not read relations", () => {
    const source = [
      "VAR_INPUT",
      '  Start : BOOL;   // "DeclaredOnly"',
      "END_VAR",
      'Run := "ActualTag";',
    ].join("\n");

    const code = stripDeclarations(stripNonCode(source));
    expect(code.split("\n")).toHaveLength(4);
    expect(symbolsIn(code)).toEqual(["ActualTag"]);
  });

  it("classifies assignments into one write and the reads that feed it", () => {
    const result = extractScl(
      [
        'FUNCTION_BLOCK "FB_Permissive"',
        "BEGIN",
        '  "Prm_Hydraulic" := "Hyd_Pressure_Act" > 120.0 AND "Lube_Pressure_OK";',
        "END_FUNCTION_BLOCK",
      ].join("\n"),
    );

    expect(result.units).toHaveLength(1);
    expect(result.units[0].name).toBe("FB_Permissive");
    expect(result.units[0].kind).toBe("FUNCTION_BLOCK");
    expect(result.writes).toEqual(["Prm_Hydraulic"]);
    expect(result.reads).toEqual(["Hyd_Pressure_Act", "Lube_Pressure_OK"]);
  });

  it("reads the condition of a branch without inventing a write", () => {
    const result = extractScl(
      [
        'FUNCTION_BLOCK "FB_Seq"',
        "BEGIN",
        '  IF "Mill_Start_Req" AND "Mill_Mode_Auto" THEN',
        '    "Mill_Running" := TRUE;',
        "  END_IF;",
        "END_FUNCTION_BLOCK",
      ].join("\n"),
    );

    expect(result.reads).toEqual(["Mill_Mode_Auto", "Mill_Start_Req"]);
    expect(result.writes).toEqual(["Mill_Running"]);
  });

  it("treats an input binding as a read and an output binding as a write", () => {
    const result = extractScl(
      [
        'FUNCTION_BLOCK "FB_Caller"',
        "BEGIN",
        '  "FB_DriveInterface"(Enable := "Drive1_Ready", Fault => "Drive1_Fault");',
        "END_FUNCTION_BLOCK",
      ].join("\n"),
    );

    expect(result.calls).toEqual(["FB_DriveInterface"]);
    expect(result.reads).toEqual(["Drive1_Ready"]);
    expect(result.writes).toEqual(["Drive1_Fault"]);
  });

  it("keeps the member path of a data-block access", () => {
    const result = extractScl(
      [
        'FUNCTION "FC_Gap" : VOID',
        "BEGIN",
        '  "DB_MillData".Gap_Act := "DB_MillData".Gap_Sp;',
        "END_FUNCTION",
      ].join("\n"),
    );

    expect(result.writes).toEqual(["DB_MillData.Gap_Act"]);
    expect(result.reads).toEqual(["DB_MillData.Gap_Sp"]);
  });

  it("ignores block-local variables, which are not plant objects", () => {
    const result = extractScl(
      [
        'FUNCTION_BLOCK "FB_Local"',
        "BEGIN",
        '  #retries := #retries + 1;',
        '  "Prod_Count" := #retries;',
        "END_FUNCTION_BLOCK",
      ].join("\n"),
    );

    expect(result.reads).toEqual([]);
    expect(result.writes).toEqual(["Prod_Count"]);
  });

  it("reports the line a relation was found on", () => {
    const result = extractScl(
      [
        'FUNCTION_BLOCK "FB_Lines"',
        "BEGIN",
        "",
        '  "Tag_A" := "Tag_B";',
        "END_FUNCTION_BLOCK",
      ].join("\n"),
    );

    const write = result.units[0].relations.find((r) => r.relation === "WRITES");
    expect(write?.line).toBe(4);
  });

  it("does not mistake END_FUNCTION_BLOCK for a new unit header", () => {
    const result = extractScl(
      [
        'FUNCTION_BLOCK "FB_One"',
        "BEGIN",
        '  "T" := TRUE;',
        "END_FUNCTION_BLOCK",
        '',
        'FUNCTION_BLOCK "FB_Two"',
        "BEGIN",
        '  "U" := TRUE;',
        "END_FUNCTION_BLOCK",
      ].join("\n"),
    );

    expect(result.units.map((u) => u.name)).toEqual(["FB_One", "FB_Two"]);
  });

  it("ignores a block attribute pragma so the first statement still parses", () => {
    // A block header carries `{ S7_Optimized_Access := 'TRUE' }`, whose `:=`
    // precedes every real statement. Reading it as an assignment swallowed the
    // first statement of the block and turned its write into a read.
    const result = extractScl(
      [
        'FUNCTION "FC_Pragma" : Void',
        "{ S7_Optimized_Access := 'TRUE' }",
        "VERSION : 1.0",
        "VAR_CONSTANT",
        "  LIMIT : Real := 140.0;",
        "END_VAR",
        "",
        "BEGIN",
        '  "Prm_Hydraulic" := "Hyd_Pressure_Act" >= LIMIT;',
        "END_FUNCTION",
      ].join("\n"),
    );

    expect(result.writes).toEqual(["Prm_Hydraulic"]);
    expect(result.reads).toEqual(["Hyd_Pressure_Act"]);
  });

  it("recognises a parameterless block invocation as a call, not a read", () => {
    const result = extractScl(
      [
        'ORGANIZATION_BLOCK "OB1_Main"',
        "{ S7_Optimized_Access := 'TRUE' }",
        "BEGIN",
        '  "FC_Permissive_Logic"();',
        "END_ORGANIZATION_BLOCK",
      ].join("\n"),
    );

    expect(result.calls).toEqual(["FC_Permissive_Logic"]);
    expect(result.reads).toEqual([]);
  });

  it("records a read-modify-write as both a read and a write", () => {
    const result = extractScl(
      [
        'FUNCTION_BLOCK "FB_Counter"',
        "BEGIN",
        '  "Prod_Count" := "Prod_Count" + 1;',
        "END_FUNCTION_BLOCK",
      ].join("\n"),
    );

    expect(result.writes).toEqual(["Prod_Count"]);
    expect(result.reads).toEqual(["Prod_Count"]);
  });

  it("is deterministic — the same source always yields the same result", () => {
    const source = [
      'FUNCTION_BLOCK "FB_Det"',
      "BEGIN",
      '  IF "A" THEN "B" := "C"; END_IF;',
      "END_FUNCTION_BLOCK",
    ].join("\n");

    expect(JSON.stringify(extractScl(source))).toBe(JSON.stringify(extractScl(source)));
  });
});
