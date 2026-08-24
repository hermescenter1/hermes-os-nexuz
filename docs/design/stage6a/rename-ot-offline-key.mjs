/**
 * Phase 107 Stage 6-A — rename the OT connectivity key, and only that one.
 *
 * The Phase 94C1 claim-integrity gate forbids the word "offline" anywhere in the
 * OT interface, and it is right to: in an industrial console "offline" is a
 * statement about a GATEWAY, and this failure is about the browser's own request
 * to Hermes. So `otEdge.states.offline*` becomes `connectionFailed*`.
 *
 * `errors.resource.offline*` — the CRM / portal / billing vocabulary — keeps its
 * name. There "offline" means the browser's connection and carries no claim
 * about equipment.
 *
 * A blind whole-file replace renamed the WRONG one, because `errors.resource`
 * appears first in the catalogue. This edits inside the `otEdge` object's span
 * only, and verifies both namespaces afterwards.
 *
 * Usage: node docs/design/stage6a/rename-ot-offline-key.mjs
 */
import fs from "node:fs";

/** The character span of one top-level object in the catalogue text. */
function spanOf(src, key) {
  const start = src.indexOf(`\n  "${key}": {`);
  if (start === -1) throw new Error(`namespace ${key} not found`);
  let depth = 0;
  let i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return [start, i + 1];
  }
  throw new Error(`namespace ${key} is unterminated`);
}

for (const locale of ["en", "fa", "de"]) {
  const file = `messages/${locale}.json`;
  let src = fs.readFileSync(file, "utf8");

  // 1. Undo the mis-targeted rename in errors.resource, if it landed there.
  const [eStart, eEnd] = spanOf(src, "errors");
  let errors = src.slice(eStart, eEnd);
  const repaired = errors
    .replace('"connectionFailedTitle"', '"offlineTitle"')
    .replace('"connectionFailedBody"', '"offlineBody"');
  if (repaired !== errors) {
    src = src.slice(0, eStart) + repaired + src.slice(eEnd);
    console.log(`${locale}: repaired errors.resource`);
    errors = repaired;
  }

  // 2. Rename inside otEdge only.
  const [oStart, oEnd] = spanOf(src, "otEdge");
  const otEdge = src.slice(oStart, oEnd);
  const renamed = otEdge
    .replace('"offlineTitle"', '"connectionFailedTitle"')
    .replace('"offlineBody"', '"connectionFailedBody"');
  src = src.slice(0, oStart) + renamed + src.slice(oEnd);

  JSON.parse(src);
  fs.writeFileSync(file, src);

  const m = JSON.parse(src);
  console.log(
    `${locale}: otEdge.states.connectionFailedTitle=${"connectionFailedTitle" in m.otEdge.states}` +
    `  errors.resource.offlineTitle=${"offlineTitle" in m.errors.resource}`,
  );
}

const keys = (l, path) => {
  const m = JSON.parse(fs.readFileSync(`messages/${l}.json`, "utf8"));
  return Object.keys(path.split(".").reduce((o, k) => o[k], m)).sort().join(",");
};
for (const path of ["otEdge.states", "errors.resource"]) {
  const [en, fa, de] = ["en", "fa", "de"].map((l) => keys(l, path));
  console.log(`${path} parity  en=fa ${en === fa}  en=de ${en === de}`);
}
