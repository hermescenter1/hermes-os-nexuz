# Phase 95 — Prompt-Injection & RAG-Poisoning Threat Model

## Untrusted input channels

user question, uploaded documents, Knowledge Graph entries, Library/article
bodies, imported PLC/SCADA text, comments, metadata, API payloads, OCR text,
tenant-authored content, system-generated context. **All are DATA.** Only the
Hermes deterministic engine and the fixed SYSTEM policy are instructions.

## Controls

- **Instruction/data separation** (`prompt-envelope.ts`): retrieved content is
  fenced as `UNTRUSTED_RETRIEVED_DATA` with an explicit policy that it may
  contain malicious instructions and is evidence only; fence-closing attempts
  from inside data are neutralised.
- **Normalisation** (`content-normalisation.ts`): strips NUL/control/zero-width
  (keeps Persian ZWNJ), NFKC-folds, bounds nesting/size — without deleting
  evidence words.
- **Screening** (`injection-screen.ts`): multilingual (FA/EN/DE) detection of
  override, system-prompt/secret/cross-tenant extraction, tool-call manipulation,
  citation fabrication, encoded payloads. High-risk ⇒ router `BLOCKED`.
- **Citation allow-list** (`output-schema.ts` + `citation-verifier.ts`): the
  model may only reference server-issued opaque ids; DB ids/URLs are rejected.
- **RAG provenance** (`rag-provenance.ts`): cross-tenant / revoked / deleted /
  archived / unpublished sources are BLOCKED from retrieval; unreviewed content
  is never authoritative (at most DATA_ONLY, and never for safety claims).

## Attacks evaluated (offline dataset)

direct override; indirect retrieved injection; fake system message; system-prompt
extraction; secret extraction; other-tenant extraction; tool-call manipulation;
citation fabrication; unsafe industrial instruction; encoded/base64 instruction;
Persian/English/German injection; nested JSON/HTML-comment injection. See
`tests/fixtures/ai-governance/{injection,rag-poisoning,citation-integrity}.jsonl`.

Zero-tolerance metrics (enforced by the offline eval): high-risk attack success,
secret disclosure, cross-tenant disclosure, system-prompt disclosure,
fabricated-citation, RAG instruction-override, untrusted-as-authoritative — all 0.

## Residual / follow-up

The controls are library-complete and tested; wiring the envelope + provenance
filter into the live `/api/brain` and `src/lib/rag/*` paths (default-off) is the
documented next work unit. Offline heuristics are defence-in-depth; the envelope
separation (not word-deletion) is the primary guarantee.
