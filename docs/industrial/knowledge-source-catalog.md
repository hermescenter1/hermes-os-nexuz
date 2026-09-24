# Industrial Knowledge Library — Candidate Source Catalog

Status: `PHASE_1_CATALOG` (revision R1, 2026-09-23). This is a proposal for owner review.
**Nothing listed here was downloaded, stored, ingested or published.** It is not legal
advice, and it draws **no legal conclusion**, in particular on sanctions or export
control. Every licence reading below is a paraphrase of the page named in its row, as
observed on **2026-09-23**.

R1 applies the owner instructions of 2026-09-23. It narrows the MVP to licences that are clear and
confirmed for commercial use (§2). It excludes ambiguous-licence, NC, IEC/ISA and
Siemens/Mitsubishi content from ingestion. It limits public display to what each
source's terms permit (§3), and re-checks the licences of every ALLOWED row.

## 0. Legend and common fields

**Ingest decision**

| Decision | Meaning |
|---|---|
| `ALLOWED` | The licence was read on the official page and permits storage, derivative use and **commercial** use. It is eligible for private ingestion **only after** the owner approves the Phase 2 plan. Attribution is always required; the full text is never published. |
| `METADATA_ONLY` | Bibliographic metadata, the official link (where its terms allow, §3) and Hermes-authored notes only. **No file is stored, no text is extracted, no embeddings are made.** |
| `BLOCKED_LICENSE_REVIEW` | Terms are ambiguous, inconsistent, NonCommercial/NoDerivatives, or unreadable. **Nothing is ingested**, and the source stays out of the MVP until the owner or counsel resolves it. |

**MVP flag**
- `MVP`: in the first ingestion scope.
- `MVP-COND`: eligible, but blocked on a named owner decision.
- `—`: not in the MVP.

**Access / licence vocabulary** (from the brief): `public-domain`, `open-license:<id>`,
`free-with-stated-terms`, `user-supplied-licensed-copy`, `commercial-license-required`, `unknown`.

**Fields common to every row unless the row says otherwise**

| Field | Value |
|---|---|
| Review date | 2026-09-23 |
| Checksum | none (not downloaded) |
| Language | English |
| Provenance | the official URL in the row (publisher, manufacturer or standards body), never a mirror |

**Verification levels**
- `V`: the licence or terms text was read on the fetched page.
- `V2`: read twice, with the second fetch made independently during R1.
- `P`: the page was fetched, but the licence detail was not visible, is inconsistent, or does not settle mixed authorship.
- `S`: search snippet only; not relied on for any decision.

## 1. Gating risks (what the terms say; no legal conclusion drawn)

1. **Siemens Terms of Use** (`https://www.siemens.com/en-us/terms-of-use/`, "Last updated: 27 October 2025"; `V2`, read in the browser):
   - **§4.2:** non-transferable, non-sublicensable use "solely for its own business purposes".
   - **§6** lists "Engage in text or data mining", including automated extraction for AI/ML training.
   - **§10.1** refers to locations under comprehensive sanctions and names Iran among its examples.
   - Whether and how these clauses apply to Hermes, including whether Hermes may catalogue or link to Siemens material, is a question for **legal counsel (D1)**. This catalogue does not answer it.
   - Per the owner instruction, Siemens content is **not ingested**.
2. **Mitsubishi Electric FA download page** (`https://www.mitsubishielectric.com/fa/download/index.html`, `P`): the software download service lists excluded countries, including Iran. Same counsel question; **not ingested**.
3. **IEC and ISA:**
   - IEC Webstore terms: `V`, read by the research agent.
   - ISA IP policy: `https://www.isa.org/about-isa/governing-documents/intellectual-property-policy`, `V`.
   - Both prohibit AI use of their publications without permission. **Not ingested**, whether purchased or not.
4. **"Free to download" is not "may store or process".**
   - Rockwell, Schneider, Beckhoff, Omron, OPC Foundation, PI and NAMUR restrict reproduction, redistribution or storage/retrieval.
   - Rockwell additionally prohibits "deep links" and mirroring without permission (`V2`).
5. **NonCommercial open textbooks:** OpenStax University Physics Vol 2 and most LibreTexts electronics and control books are CC BY-NC-SA 4.0. **Not ingested.**
6. **Mixed authorship in US Government works** (NIST SP 800-82r3, CISA). The copyright status of non-government co-authors' portions is not settled by the pages read (§5.4). **Not in the MVP.**

## 2. MVP scope (owner instruction 2026-09-23)

The MVP contains **only** sources whose licence is clear and confirmed for commercial use:

| # | Source | Licence (as read on the official page) | Ver. | Condition |
|---|---|---|---|---|
| O1 | Kuphaldt, *Lessons In Industrial Instrumentation*, v3.01 | CC BY 4.0 | V2 | attribution |
| O2 | Kuphaldt, *Modular Electronics Learning (ModEL)* | CC BY 4.0 | V2 | attribution |
| O4 | Woolf et al., *Chemical Process Dynamics and Controls* | CC BY: the Open Textbook Library says "Creative Commons Attribution 4.0"; the LibreTexts copy says CC BY 3.0 | V2 | Acquire only from the host whose licence statement is recorded, and record which. Both versions permit commercial use. |
| O5 | Johnson, *Electrical Engineering* (LibreTexts) | CC BY 1.0 | V2 | attribution |

`MVP-COND`:
- **O6** (Dickson-Self, CC BY-SA 4.0, `V2`) is commercially usable, but ShareAlike obliges any *published derivative* to be CC BY-SA. It enters only after D3-SA is decided.

Everything else is **excluded from the MVP**:
- G1, G2 and O3: authorship or licence ambiguity.
- O7–O12: NC.
- O13: unknown terms.
- All M rows (vendor terms) and all S rows (standards).
- All C rows (commercial).

## 3. Public-site display policy (rule 5)

The public site may show only what each source's terms allow. **Full text, figures, cover art and logos are never published**, including for ALLOWED sources.

| Group | May show publicly | Link |
|---|---|---|
| ALLOWED open textbooks (O1, O2, O4, O5, O6) | title, author, edition, licence name + licence URL, attribution line, Hermes-authored summary | official host link |
| NIST/CISA (G1, G2) | bibliographic metadata, Hermes-authored summary | official landing page |
| NC/unknown open texts (O3, O7–O13) | bibliographic metadata only | official page |
| Commercial books (C1–C21) | bibliographic metadata (title, authors, publisher, edition, ISBN as shown) | publisher page |
| Standards (S1–S9) | bibliographic metadata and reference number | issuer's catalogue page |
| Rockwell (M11) | bibliographic reference only | **no deep link** (terms prohibit deep links without permission); at most the site's top level |
| Schneider, Beckhoff, Omron, CODESYS, ABB (M12, M13, M15–M17) | bibliographic reference | official page |
| **Siemens (M1–M10), Mitsubishi (M14)** | **HOLD: nothing published** until counsel answers D1 | **HOLD** |

Every published entry must carry "Hermes does not host this document". Summaries are original Hermes text, never paraphrased excerpts.

## 4. Official manufacturer documentation (none ingested)

| # | Title | Issuer | Doc ID / edition / date (as seen) | Official URL | Access / licence | Ver. | Decision | MVP |
|---|---|---|---|---|---|---|---|---|
| M1 | Programming Styleguide for S7-1200/S7-1500 | Siemens | Entry 109478084; ed. 04/2025 | https://support.industry.siemens.com/cs/ww/en/view/109478084 | `free-with-stated-terms` (Siemens ToU) | V | METADATA_ONLY (internal registry; public HOLD-D1) | — |
| M2 | Programming Guideline for S7-1200/S7-1500 | Siemens | Entry 90885040; ed. 12/2018, V1.6 | https://support.industry.siemens.com/cs/ww/en/view/90885040 | same | V | same | — |
| M3 | SIMATIC S7-1500/ET 200MP System Manual | Siemens | Entry 59191792; ed. 11/2025; A5E03461182-AN | https://support.industry.siemens.com/cs/ww/en/view/59191792 | same | V | same | — |
| M4 | SIMATIC S7-1200 System Manual | Siemens | Entry 109814829; V4.6 11/2022; A5E02486680-AP. **The page says a newer edition exists; its ID is not verified.** | https://support.industry.siemens.com/cs/ww/en/view/109814829 | same | V | same, superseded | — |
| M5 | PROFINET with STEP 7, Function Manual | Siemens | Entry 49948856; ed. 11/2025; A5E03444486-AQ | https://support.industry.siemens.com/cs/ww/en/view/49948856 | same | V | same | — |
| M6 | SIMATIC Safety – Configuring and Programming | Siemens | Entry 54110126; ed. 11/2025; A5E02714440-AR | https://support.industry.siemens.com/cs/ww/en/view/54110126 | same | V | same, safety-critical | — |
| M7 | SINAMICS G120 CU240B-2/CU240E-2, Operating Instructions | Siemens | Entry 109757230; ed. 04/2018, FW V4.7 SP10. **Newer edition exists.** | https://support.industry.siemens.com/cs/ww/en/view/109757230 | same | V | same, superseded | — |
| M8 | TIA Portal Information System | Siemens | V20 / V21 (from URL) | https://docs.tia.siemens.cloud/ | `unknown` (no terms on page) | P | same | — |
| M9 | SCE training curriculums | Siemens SCE | — | https://www.siemens.com/en-us/content/sce-educational-institutions/documents/ | `unknown` (account-gated) | S | BLOCKED_LICENSE_REVIEW | — |
| M10 | Siemens application examples | Siemens | — | (legal notice not fetched) | `unknown` | S | BLOCKED_LICENSE_REVIEW | — |
| M11 | Rockwell Literature Library | Rockwell | — | terms: https://www.rockwellautomation.com/en-us/company/about-us/legal-notices/terms-and-conditions-of-access.html | `free-with-stated-terms`. No copying or reproduction without permission; **no deep links or mirroring**; downloads limited to buyers of genuine products. | V2 | METADATA_ONLY (no deep link) | — |
| M12 | Schneider Electric documentation | Schneider | ToU last updated 2014-09-29 | https://www.se.com/ww/en/about-us/legal/terms-of-use/ | `free-with-stated-terms`. Personal, non-commercial reproduction only. | V | METADATA_ONLY | — |
| M13 | Beckhoff Information System | Beckhoff | — | https://infosys.beckhoff.com/ | `free-with-stated-terms`. Use without authorisation prohibited. | V | METADATA_ONLY | — |
| M14 | Mitsubishi Electric FA manuals | Mitsubishi | — | https://www.mitsubishielectric.com/en/terms/index.html | `free-with-stated-terms`. Personal or internal use; country exclusions on downloads. | P | METADATA_ONLY (internal registry; public HOLD-D1) | — |
| M15 | Omron IA documentation | Omron | — | https://ia.omron.com/terms/ | `free-with-stated-terms`. Beyond personal print or save needs permission. | V | METADATA_ONLY | — |
| M16 | ABB Library | ABB | — | https://library.abb.com | `unknown` (T&C did not load) | P | BLOCKED_LICENSE_REVIEW | — |
| M17 | CODESYS Online Help | CODESYS GmbH | © 2022 | https://content.helpme-codesys.com | `unknown` | P | BLOCKED_LICENSE_REVIEW | — |

## 5. Standards, government and open textbooks

### 5.1 Standards and industry bodies (none ingested)

| # | Title | Issuer | Edition / date / ref | Official URL | Access / licence | Ver. | Decision | MVP |
|---|---|---|---|---|---|---|---|---|
| S1 | IEC 61131-3:2025 | IEC | Ed. 4.0, 2025-05-22 | https://webstore.iec.ch/en/publication/68533 | `commercial-license-required`; AI use prohibited without permission | V | METADATA_ONLY | — |
| S2 | IEC 62443-3-3:2013 | IEC | Ed. 1.0, 2013-08-07 | https://webstore.iec.ch/en/publication/7033 | same | V | METADATA_ONLY | — |
| S3 | IEC 61508-1:2010 | IEC | Ed. 2.0, 2010-04-30 | https://webstore.iec.ch/en/publication/5515 | same | V | METADATA_ONLY | — |
| S4 | IEC 61511-1:2016 | IEC | Ed. 2.0, 2016-02-24 | https://webstore.iec.ch/en/publication/24241 | same | V | METADATA_ONLY | — |
| S5 | ISA-88 / ISA-95 / ISA-5.1 | ISA | editions not verified | https://www.isa.org/about-isa/governing-documents/intellectual-property-policy | `commercial-license-required`; AI upload banned | V/P | METADATA_ONLY | — |
| S6 | OPC UA Specifications | OPC Foundation | Agreement v1.15, 2024-02-16 | https://opcfoundation.org/license/specifications/1.15/ | `free-with-stated-terms`. Storage and retrieval systems prohibited. | V | METADATA_ONLY | — |
| S7 | PLCopen guidelines / XML | PLCopen | not verified | https://plcopen.org/downloads/ | `unknown` | P | BLOCKED_LICENSE_REVIEW | — |
| S8 | PROFINET System Description | PI | Order No. 4.132, 2018 | https://www.profibus.com/download/profinet-technology-and-application-system-description | internal use only | V | BLOCKED_LICENSE_REVIEW | — |
| S9 | NAMUR Recommendations | NAMUR | — | https://www.namur.net/en/recommendations-and-worksheets/access-conditions.html | `commercial-license-required` | P | METADATA_ONLY | — |

### 5.2 Government publications

| # | Title | Issuer | Edition | Official URL | Access / licence | Ver. | Decision | MVP |
|---|---|---|---|---|---|---|---|---|
| G1 | SP 800-82 Rev. 3, Guide to OT Security | NIST | September 2023; DOI 10.6028/NIST.SP.800-82r3; supersedes Rev. 2 (06/03/2015) | https://csrc.nist.gov/pubs/sp/800/82/r3/final | See §5.4 | P | **BLOCKED_LICENSE_REVIEW** (R1: was ALLOWED) | — |
| G2 | CISA ICS Advisories / publications | CISA | ongoing | https://www.cisa.gov/news-events/ics-advisories | See §5.4 | P | **BLOCKED_LICENSE_REVIEW** (R1: was ALLOWED) | — |

### 5.3 Open textbooks

| # | Title | Author | Edition / date | Official URL | Licence | Ver. | Decision | MVP |
|---|---|---|---|---|---|---|---|---|
| O1 | Lessons In Industrial Instrumentation | Tony R. Kuphaldt | "Version 3.01 (stable)"; © 2006–2022 | https://www.ibiblio.org/kuphaldt/socratic/sinst/ | `open-license:CC-BY-4.0` | V2 | ALLOWED | **MVP** |
| O2 | Modular Electronics Learning (ModEL) Project | Tony R. Kuphaldt | © 2016–2026 | https://www.ibiblio.org/kuphaldt/socratic/model/ | `open-license:CC-BY-4.0` | V2 | ALLOWED | **MVP** |
| O3 | Lessons In Electric Circuits, Vol. I–VI | Tony R. Kuphaldt | Vols I–VI, 2006–2010; minor revisions to 2023 | https://www.ibiblio.org/kuphaldt/electricCircuits/ | **Inconsistent:** the index says "Creative Commons License" but links a Design Science License file (`Devel/dsl.html`); the Vol I appendix says CC BY 4.0; per-volume notices for II–VI are unread | P (R1 re-read) | **BLOCKED_LICENSE_REVIEW** (R1: was conditional ALLOWED) | — |
| O4 | Chemical Process Dynamics and Controls | Peter J. Woolf | 2009 | https://open.umn.edu/opentextbooks/textbooks/chemical-process-dynamics-and-controls | CC BY ("Creative Commons Attribution 4.0" on the OTL page; the LibreTexts copy says 3.0) | V2 | ALLOWED | **MVP** |
| O5 | Electrical Engineering (Johnson) | Don H. Johnson | edition not verified | https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Introductory_Electrical_Engineering/Electrical_Engineering_(Johnson) | `open-license:CC-BY-1.0` | V2 | ALLOWED | **MVP** |
| O6 | Troubleshooting Motors and Controls | Ken Dickson-Self | edition not verified | https://workforce.libretexts.org/Bookshelves/Electronics_Technology/Troubleshooting_Motors_and_Controls_(Dickson-Self) | `open-license:CC-BY-SA-4.0` | V2 | ALLOWED | MVP-COND (D3-SA) |
| O7 | Fiore: DC/AC Circuit Analysis; Semiconductor Devices; Op Amps | James M. Fiore | — | https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics | CC BY-NC-SA 4.0 | V | BLOCKED_LICENSE_REVIEW (NC) | — |
| O8 | Introduction to Control Systems | Kamran Iqbal | — | https://eng.libretexts.org/ | CC BY-NC-SA 4.0 | V | BLOCKED_LICENSE_REVIEW (NC) | — |
| O9 | Dynamic Systems and Control | Dahleh, Dahleh, Verghese | — | https://eng.libretexts.org/ | CC BY-NC-SA 4.0 | V | BLOCKED_LICENSE_REVIEW (NC) | — |
| O10 | Introduction to Electric Power Systems | James Kirtley | — | https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electro-Optics/Introduction_to_Electric_Power_Systems_(Kirtley) | CC BY-NC-SA 4.0 | V | BLOCKED_LICENSE_REVIEW (NC) | — |
| O11 | Electromechanical Systems | Chad Davis | 2018, updated 2024 | https://open.umn.edu/opentextbooks/textbooks/electromechanical-systems | CC BY-NC-SA | P | BLOCKED_LICENSE_REVIEW (NC) | — |
| O12 | University Physics Volume 2 | Ling, Moebs, Sanny | OpenStax, 2016 | https://openstax.org/books/university-physics-volume-2/pages/preface | CC BY-NC-SA 4.0 | V2 | BLOCKED_LICENSE_REVIEW (NC) | — |
| O13 | Feedback Systems, 2nd ed | Åström, Murray | Princeton UP, 2021; ISBN 9780691193984 | https://press.princeton.edu/books/hardcover/9780691193984/feedback-systems | `unknown` for the author-hosted copy | P | METADATA_ONLY | — |

### 5.4 Why G1 and G2 left the ALLOWED set (R1)

**G1, NIST SP 800-82r3.**
- NIST's policy page (https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications, `V2`) says works by NIST employees are not subject to US copyright, and that "foreign rights are reserved". It grants a worldwide royalty-free right to reprint, and requests the credit line "Republished courtesy of the National Institute of Standards and Technology."
- The same page says some NIST-published works "may have been written by third parties and may be subject to copyright protection".
- The landing page (`V2`) lists 4 of 10 authors as MITRE. The publication's own front-matter notice lives inside the PDF. Reading it counts as a download, which is not authorised in this phase.
- Result: `BLOCKED_LICENSE_REVIEW` until that notice is read with permission.

**G2, CISA.**
- The only statement read, on the linking policy page (https://www.cisa.gov/linking-policy, `V2`), is that cisa.gov is "a public domain website" for linking purposes.
- The page does not address reuse of content. Advisories embed vendor-supplied text.
- Result: `BLOCKED_LICENSE_REVIEW`.

## 6. Commercial books (bibliographic metadata only; rule 4)

Every row is `commercial-license-required` and **METADATA_ONLY**.
- **No commercial or purchased book enters RAG** unless a licence expressly permitting machine processing and use in a commercial system is presented and reviewed.
- A retail purchase is not such a licence.

| # | Title | Author(s) | Publisher | Edition / date seen | ISBN (seen on page) | Official URL | Ver. |
|---|---|---|---|---|---|---|---|
| C1 | Automating with SIMATIC S7-1500, 2nd ed | Hans Berger | Wiley / Publicis | 2nd ed, 2017–2018 | 978-3-89578-460-6 (hc) | https://www.wiley.com/en-us/Automating+with+SIMATIC+S7-1500:+Configuring,+Programming+and+Testing+with+STEP+7+Professional,+2nd+Edition-p-9783895784606 | V |
| C2 | Automating with SIMATIC S7-1200, 3rd ed | Hans Berger | Wiley / Publicis | May 2018 | 978-3-89578-470-5 (hc) | https://www.wiley.com/en-us/Automating+with+SIMATIC+S7+1200:+Configuring,+Programming+and+Testing+with+STEP+7+Basic,+3rd+Edition-p-9783895784705 | V |
| C3 | Programmable Logic Controllers | Frank D. Petruzella | McGraw Hill | "2025 Release" | 9781266016394 | https://www.mheducation.com/highered/product/programmable-logic-controllers-petruzella.html | V |
| C4 | Programmable Logic Controllers, 6th ed | W. Bolton | Elsevier (Newnes) | 2015-03-06 | 978-0-12-802929-9 (URL path only) | https://shop.elsevier.com/books/programmable-logic-controllers/bolton/978-0-12-802929-9 | P |
| C5 | PLCs: Programming Methods and Applications | J. R. & F. D. Hackworth | Pearson / Prentice Hall | 2004 | 9780130607188 (library record) | https://digitalcommons.odu.edu/engtech_books/3/ | P |
| C6 | IEC 61131-3: Programming Industrial Automation Systems | K.-H. John, M. Tiegelkamp | Springer | not verified | not verified | (Springer redirected to login) | S |
| C7 | Instrument and Automation Engineers' Handbook, 5th ed | B. G. Lipták, K. Venczel (eds.) | CRC / Routledge | 5th ed | 9781466559325 | https://www.routledge.com/Instrument-and-Automation-Engineers-Handbook-Process-Measurement-and-Analysis-Fifth-Edition---Two-Volume-Set/Liptak-Venczel/p/book/9781466559325 | V |
| C8 | Process Control Instrumentation Technology, 8th ed | Curtis D. Johnson | Pearson | 2005-06-21 | 9780131194571 | https://www.pearson.com/en-us/subject-catalog/p/process-control-instrumentation-technology/P200000001307/9780131194571 | V |
| C9 | Process Dynamics and Control, 4th ed | Seborg, Edgar, Mellichamp, Doyle | Wiley | Sept 2016 | 978-1-119-28591-5 | https://www.wiley.com/en-us/Process+Dynamics+and+Control,+4th+Edition-p-9781119285915 | V |
| C10 | Electric Machinery Fundamentals, 5th ed | Stephen J. Chapman | McGraw Hill | © 2012 | 0073529540 | https://highered.mheducation.com/sites/0073529540/information_center_view0/ | P |
| C11 | Electrical Transformers and Rotating Machines, 4th ed | Stephen L. Herman | Cengage | © 2017 | 9781305494817 | https://www.cengageasia.com/TitleDetails/isbn/9781305494817 | P |
| C12 | Electromagnetic Compatibility Engineering | Henry W. Ott | Wiley | Aug 2009 | 978-0-470-18930-6 | https://www.wiley.com/en-us/Electromagnetic+Compatibility+Engineering-p-9780470189306 | V |
| C13 | Electromagnetic Compatibility Engineering, 2nd Edition, Updated | Archambeault, Drewniak, Diepenbrock (eds.); Ott not named on the page | Wiley | eBook Aug 2026 | 978-1-394-19828-3 (eBook) | https://www.wiley.com/en-us/Electromagnetic+Compatibility+Engineering,+2nd+Edition,+Updated-p-00400694 | P |
| C14 | Grounding and Shielding, 6th ed | Ralph Morrison | Wiley-IEEE Press | 2016 | 978-1-119-18374-7 (hc) | https://www.wiley.com/en-us/Grounding+and+Shielding:+Circuits+and+Interference,+6th+Edition-p-9781119183754 | V |
| C15 | Industrial Network Security, 3rd ed | Eric D. Knapp | Elsevier | 2024-03-26 | 978-0-443-13737-2 (URL path only) | https://shop.elsevier.com/books/industrial-network-security/knapp/978-0-443-13737-2 | P |
| C16 | Protective Relaying, 4th ed | J. L. Blackburn, T. J. Domin | CRC Press | 2014 | 9781439888117 | https://www.routledge.com/Protective-Relaying-Principles-and-Applications-Fourth-Edition/Blackburn-Domin/p/book/9781439888117 | V |
| C17 | Practical Modern SCADA Protocols | G. Clarke, D. Reynders | Elsevier (Newnes) | 2004 | 9780750657990 | https://shop.elsevier.com/books/practical-modern-scada-protocols/clarke/978-0-7506-5799-0 | V |
| C18 | Industrial Cybersecurity, 2nd ed | Pascal Ackerman | Packt | not verified | not verified | (403) | S |
| C19 | Modern Power Electronics and AC Drives | Bimal K. Bose | Pearson | not verified | not verified | (unreachable) | S |
| C20 | OPC Unified Architecture | Mahnke, Leitner, Damm | Springer | not verified | not verified | (login redirect) | S |
| C21 | Industrial Motor Control, 7th ed | Stephen L. Herman | Cengage | not verified | not verified | (unreachable) | S |

Rows marked `S` are **low-confidence placeholders**. Their bibliographic data must be confirmed on a publisher page before any registry record is created.

## 7. Coverage of the MVP against the requested domains

| Domain | MVP sources | Gap |
|---|---|---|
| Electrical fundamentals, circuits | O5, O2 | protection and LV/MV switchgear: none open |
| Machines, drives | none (O6 is MVP-COND) | no open drives text |
| Siemens S7/TIA/WinCC | **none** | no ingestible source; Hermes-authored notes only |
| Multi-vendor PLC, IEC 61131-3 | **none** | no open PLC textbook with a verified licence |
| Instrumentation, 4–20 mA, valves, calibration | **O1** (strong) | — |
| Industrial electronics, EMC, grounding | O2 | EMC/grounding depth only in commercial books |
| Process control, SCADA, historians, OT networks | O4, O1 | SCADA protocols only in commercial books |
| ICS security, functional safety | **none** (G1, G2 on hold) | all candidates held or commercial |

The MVP is honest but narrow. Its value is strongest in instrumentation and process control, and **absent** for Siemens/PLC depth. That depth must come from Hermes-authored engineering notes that reference official manuals as metadata only, with public display subject to §3.

## 8. Decisions

Owner decisions D1–D9, marked decided or open, are maintained in `knowledge-ingestion-proposal.md` §11.
