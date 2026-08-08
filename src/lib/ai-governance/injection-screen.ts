// PHASE 95 — prompt-injection signal screening.
//
// This screen does NOT try to "fix" injection by deleting words. It CLASSIFIES
// injection signals so the router/envelope can (a) always keep retrieved text as
// untrusted data, and (b) hard-deny the highest-risk asks (secret / cross-tenant
// / system-prompt extraction, tool-call manipulation). Instruction/data
// separation in the envelope is the primary defence; this is defence-in-depth.
//
// Multilingual by design (Persian / English / German). Detection also folds
// base64-ish encoded blobs so a "decode and follow" payload is flagged.

export type InjectionSignal =
  | "override"
  | "system_prompt_extraction"
  | "secret_extraction"
  | "cross_tenant_extraction"
  | "tool_call_manipulation"
  | "citation_fabrication"
  | "encoded_payload";

/** Signals that, alone, make a request high-risk (never allowed to influence
 *  the model as an instruction). */
export const HIGH_RISK_SIGNALS: readonly InjectionSignal[] = [
  "system_prompt_extraction",
  "secret_extraction",
  "cross_tenant_extraction",
  "tool_call_manipulation",
];

const PATTERNS: Record<InjectionSignal, RegExp[]> = {
  override: [
    /ignore (all|any|the)?\s*(previous|prior|above)\s*(instructions|prompts|rules)/i,
    /disregard\s+(the\s+)?(system|previous|above)/i,
    /you are now\b/i,
    /new (system )?instructions?:/i,
    /forget (everything|all previous)/i,
    // Persian
    /دستور(?:ات| های)?\s*(?:قبلی|بالا).{0,12}(?:نادیده|فراموش)/,
    /از این پس تو\b/,
    // German
    /ignoriere\s+(alle|die)\s+(vorherigen|obigen)\s+(anweisungen|regeln)/i,
    /vergiss\s+(alles|alle vorherigen)/i,
  ],
  system_prompt_extraction: [
    /(reveal|show|print|repeat|output)\s+(your|the)\s+(system\s*prompt|instructions|guardrails|policy)/i,
    /what (are|were) your (system )?(instructions|rules)/i,
    /پرامپت\s*(سیستم|سیستمی)/,
    /دستورالعمل(?:‌| )?های\s*سیستم/,
    /(zeige|nenne|gib).{0,20}(system[- ]?prompt|systemanweisung)/i,
  ],
  secret_extraction: [
    /\b(api[_ -]?key|secret|token|password|credential|private key)\b/i,
    /\b(reveal|show|print|leak)\b.{0,30}\b(key|secret|token|password)\b/i,
    /کلید\s*(?:api|خصوصی|مخفی)|رمز\s*عبور|توکن/,
    /(zeige|verrate).{0,20}(schlüssel|passwort|token|geheimnis)/i,
  ],
  cross_tenant_extraction: [
    /\b(other|another|different)\s+(tenant|organisation|organization|company|customer|user)('|’)?s?\b.{0,40}\b(data|documents?|cases?|secrets?)\b/i,
    /\ball (tenants|organisations|organizations|customers)\b/i,
    /داده(?:‌| )?های\s*(?:سازمان|شرکت|مستأجر)\s*دیگر/,
    /(daten|dokumente).{0,20}(anderer|einer anderen)\s*(organisation|firma|mandant)/i,
  ],
  tool_call_manipulation: [
    /\b(call|invoke|execute|run)\b.{0,20}\b(tool|function|command|shell|api)\b/i,
    /\bwrite\b.{0,15}\b(plc|register|setpoint|coil|opc|modbus)\b/i,
    /\bsend\b.{0,15}\b(command|write)\b.{0,15}\b(plc|device|gateway)\b/i,
    /دستور\s*(?:اجرا|نوشتن).{0,15}(?:plc|تجهیز)/i,
    /(führe|rufe)\s+.{0,15}(werkzeug|funktion|befehl)\s+aus/i,
  ],
  citation_fabrication: [
    /\b(cite|reference|source)\b.{0,25}\b(https?:\/\/|doc[_-]?id|record\s*id)\b/i,
    /\bmake up\b.{0,15}\b(citation|reference|source)\b/i,
    /منبع\s*(?:جعلی|بساز)|ارجاع\s*جعلی/,
  ],
  encoded_payload: [
    // Long base64-ish blobs that could carry "decode and follow" instructions.
    /[A-Za-z0-9+\/]{40,}={0,2}/,
    /\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){6,}/i,
  ],
};

export interface InjectionScreenResult {
  signals: InjectionSignal[];
  highRisk: boolean;
}

/** Screen a piece of text (a user question OR a retrieved chunk). */
export function screenForInjection(text: string): InjectionScreenResult {
  const found = new Set<InjectionSignal>();
  const haystack = typeof text === "string" ? text : "";
  for (const [signal, regexes] of Object.entries(PATTERNS) as [InjectionSignal, RegExp[]][]) {
    if (regexes.some((re) => re.test(haystack))) found.add(signal);
  }
  const signals = [...found];
  const highRisk = signals.some((s) => HIGH_RISK_SIGNALS.includes(s));
  return { signals, highRisk };
}
