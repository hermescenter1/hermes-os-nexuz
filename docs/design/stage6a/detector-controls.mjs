/**
 * Phase 107 Stage 6-A.2 — controls for the AST refusal-site analyser.
 *
 * `detector-selfcheck.mjs` proves the analyser catches defects reintroduced into
 * the REAL tree. This proves the analyser's rules directly, on synthetic sources
 * that contain each shape exactly once, so a false negative cannot hide behind a
 * file that happens to have another defect in it.
 *
 * These are fixtures, not fake product code: nothing here is imported by the
 * application, and each string exists to make one rule fire or not fire.
 *
 * Usage: node docs/design/stage6a/detector-controls.mjs
 */
import { sitesIn } from "./refusal-sites.mjs";

const wrap = (body) => `
import { NextResponse } from "next/server";
export async function POST(req) {
  const auth = await requirePlatformAuth(req);
${body}
  return NextResponse.json({ ok: true });
}
`;

const POSITIVE = [
  {
    name: "positional status literal — json(body, 401)",
    src: wrap(`  if ("error" in auth) return json({ error: auth.error }, 401);`),
  },
  {
    name: "deny(409, \"site_context_required\") — literal status AND literal code",
    src: wrap(`  if ("error" in auth) return deny(409, "site_context_required");`),
  },
  {
    name: "object status literal — NextResponse.json(body, { status: 401 })",
    src: wrap(`  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });`),
  },
  {
    name: "hard-coded code beside a forwarded status",
    src: wrap(`  if ("error" in auth) return json({ error: auth.error, code: "AUTHENTICATION_REQUIRED" }, auth.status);`),
  },
  {
    name: "positional literal code — refuse(msg, \"AUTHENTICATION_REQUIRED\", auth.status)",
    src: wrap(`  if ("error" in auth) return refuse("Authentication required", "AUTHENTICATION_REQUIRED", auth.status);`),
  },
  {
    name: "lowercase vocabulary — deny(auth.status, \"internal_error\")",
    src: wrap(`  if ("error" in auth) return deny(auth.status, "internal_error");`),
  },
  {
    name: "ONE hard-coded site in a file whose other sites are correct",
    src: `
export async function GET(req) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);
  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return json({ error: member.error, code: member.code }, member.status);
  return json({ ok: true });
}
export async function POST(req) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);
  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return json({ error: member.error, code: "ORGANIZATION_SCOPE_REQUIRED" }, member.status);
  return json({ ok: true });
}
`,
    expect: 1,   // exactly one of the four sites, not the whole file
  },
  {
    name: "voice-style label hard-coded with a forwarded status",
    src: wrap(`  if ("error" in auth) {
    return { ok: false, response: refuse("Authentication required", "AUTHENTICATION_REQUIRED", auth.status) };
  }`),
  },
  {
    /*
     * The false negative the self-check caught, kept as a control.
     *
     * A site-wide rule asked "does this block mention `auth.code` anywhere?".
     * Reverting the voice guard left a now-DEAD `const code = auth.code === …`
     * above the return, so the block still mentioned it while the response
     * carried a literal. The judgement now happens at the response call.
     */
    name: "a hard-coded label beside a DEAD derived-code computation",
    src: wrap(`  if ("error" in auth) {
    const code = auth.code === "ORGANIZATION_CONTEXT_REQUIRED" ? "ORGANIZATION_SCOPE_REQUIRED" : "AUTHENTICATION_REQUIRED";
    void code;
    return refuse("Authentication required", "AUTHENTICATION_REQUIRED", auth.status);
  }`),
  },
];

const NEGATIVE = [
  {
    name: "full forwarding — status and code both derived",
    src: wrap(`  if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);`),
  },
  {
    name: "deliberate anti-enumeration 404, inline",
    src: wrap(`  if ("error" in auth) return NextResponse.json({ error: "Site not found" }, { status: 404 });`),
  },
  {
    name: "deliberate anti-enumeration 404 behind a zero-arg local helper",
    src: `
function denyAfterLookup() {
  return deny(404, "not_found");
}
export async function POST(req) {
  const actor = await requireOrgActor(req, "org");
  if ("error" in actor) return denyAfterLookup();
  return json({ ok: true });
}
`,
  },
  {
    name: "computed exhaustive mapping — the voice guard's shape",
    src: wrap(`  if ("error" in auth) {
    const code = auth.code === "ORGANIZATION_CONTEXT_REQUIRED" ? "ORGANIZATION_SCOPE_REQUIRED"
      : auth.code === "INTERNAL_ERROR" ? "COPILOT_UNAVAILABLE"
      : "AUTHENTICATION_REQUIRED";
    return refuse("refused", code, auth.status);
  }`),
  },
  {
    name: "mapping through a helper that READS the refusal's status",
    src: wrap(`  if ("error" in auth) return refuse("refused", orgActorRefusalCode(auth.status), auth.status);`),
  },
];

let pass = 0, fail = 0;

console.log("## positive controls — each MUST be flagged");
for (const c of POSITIVE) {
  const sites = sitesIn("control.ts", c.src);
  const n = sites.filter((s) => s.exception).length;
  const ok = c.expect !== undefined ? n === c.expect : n > 0;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "OK  " : "MISS"}  ${c.name}   (exceptions: ${n}${c.expect !== undefined ? `, expected ${c.expect}` : ""})`);
}

console.log("");
console.log("## negative controls — each MUST NOT be flagged");
for (const c of NEGATIVE) {
  const sites = sitesIn("control.ts", c.src);
  const n = sites.filter((s) => s.exception).length;
  const ok = n === 0 && sites.length > 0;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "OK  " : "FALSE POSITIVE"}  ${c.name}   (sites: ${sites.length}, exceptions: ${n})`);
}

console.log("");
console.log(`DETECTOR_CONTROLS=${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
