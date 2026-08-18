# Evidence-Based Industrial Diagnostics and Safe Action Planning

## Executive Summary

Industrial diagnosis is usually described as a search for the cause. That description produces bad practice, because it sets an objective that frequently cannot be reached in the time available and offers no guidance about what to do in the meantime.

**A better description: diagnosis is the disciplined management of an evidence set under time pressure, ending in an action whose consequences are bounded.** Its deliverable is not a cause. Its deliverable is three things — **a ranked set of candidates, the test that would discriminate between them, and a safe next action** — and a diagnosis that produces those under acknowledged uncertainty is a good engineering product, while one that produces a confident cause the evidence does not support is not.

Three propositions organise the method.

**The symptom you are given is not the symptom.** "The drive keeps tripping" is already a hypothesis, and accepting it as a starting point commits the investigation before any evidence exists.

**Confidence must be bounded by the evidence, not by the plausibility of the story.** Two separate gates apply: is there enough valid evidence to conclude anything at all, and does the evidence distinguish this candidate from the others? A compelling narrative satisfies neither.

**And the proposition that makes the method safe: the action is a separate decision from the diagnosis, and it is governed by consequence and reversibility rather than by confidence.** A high-confidence diagnosis may justify only a small action if the consequence of being wrong is severe. A low-confidence one may fully justify an action that is cheap, reversible and produces evidence. **Ranking actions by what they cost if they are wrong — rather than by how sure the investigator feels — is the discipline that keeps diagnosis from becoming gambling.**

This article sets out the method stage by stage, with the artefact each stage produces. It is prospective: a symptom exists and the question is what to do now. The retrospective counterpart — a failure has occurred and the question is how to prevent recurrence — is the subject of the companion article on root cause analysis, and the two hand off to each other at a defined point.

## Stage 0 — Frame the Symptom

**The reported symptom is an interpretation, usually made by someone who was busy.** Normalising it into observations is the first and most error-prone step of the whole method.

**Convert the report into observables**: what was observed, where, when, how often, for how long, under what operating conditions, and by what means. "It trips" becomes "the protection relay operated, logged at these timestamps, with the machine at this load, following this sequence".

**Then ask the two framing questions that determine which investigation this is:**

**Has it ever worked correctly?** A system that has never worked and a system that has stopped working share no method. The first is a commissioning problem — a design error, a configuration error, an installation error, something that was always wrong and only now matters. The second is a degradation or change problem, and its most powerful question is what is different. **Investigations fail routinely because a commissioning fault is being hunted with degradation methods.**

**When did it last work correctly, and what changed between then and now?** The answer bounds the search in time, and the change question — asked across hardware, software, settings, procedures, people, suppliers, feedstock, rate and ambient — is the highest-yield single question in the method.

**And ask whether this is one problem or several.** Sites routinely investigate a bundle of loosely related complaints as if it were a single fault, which guarantees that no hypothesis explains all the evidence and that every hypothesis is therefore discarded.

**Artefact of this stage:** a symptom statement in observables, with conditions, frequency, and a first-known-good / last-known-good boundary.

## Stage 1 — Acquire and Normalise Evidence

Evidence perishes at very different rates, and the fastest-perishing is often the most decisive; the preservation protocol in the companion root cause article applies from the first minute.

**Normalisation is the step nobody names and every investigation needs.** Put every item of evidence onto a common basis:

- **One time base.** Establish the clock offset between every source before comparing anything. Two systems minutes apart produce a confident and completely wrong sequence.
- **One set of units and sign conventions.** A value in the wrong units or with an inverted sign is worse than a missing value, because it is used.
- **Validity, not just value.** A measurement has a state as well as a number: in service, in manual, out of range, forced, simulated, stale. **A forced or simulated value that is read as a measurement will support hypotheses it has no business supporting.**
- **Provenance and class.** Mark every item as **measured**, **recorded**, **reported**, **inferred** or **assumed**. These have completely different weights, and **the most common analytical error is an assumption becoming a fact by being written down twice.**

**Record what you looked for and did not find.** An expected alarm that never appeared, a protection that did not operate, a trend that shows nothing at the time of the event — absences are evidence, and they exist only if somebody writes down that they were sought.

**And distinguish four states, not two.** Evidence can be present and supporting, present and contradicting, **missing** (not yet gathered, and therefore a task), or **unavailable** (cannot be gathered at all — the instrument does not exist, the buffer has rolled, the part was cleaned). Missing defines the next step. **Unavailable defines a permanent ceiling on confidence and must appear in the final report.**

**Artefact of this stage:** an evidence register, each entry carrying its source, timestamp, class, validity and uncertainty.

## Stage 2 — Establish Context and Constraints Before Hypothesising

This ordering is deliberate and it is the safety spine of the method. Most investigators jump from evidence to hypothesis; doing so means the constraints on action are discovered late, usually at the moment somebody proposes a test that cannot be performed.

**Operating context:** state, mode, rate, product, configuration, standby or normal supply, ambient, and what was being done by whom.

**Protection and permissive state — the questions that bound every action that follows:**

- What is the safe state of this process, and how is it reached?
- Which permissives are currently satisfied, and which are not?
- Which interlocks are active, and **is anything currently bypassed, inhibited or forced?**
- What protection is currently guarding this equipment, and what does it protect against?

**The bypass and force register deserves a specific mention**, because it serves two purposes at once. Any protection currently inhibited is a live safety issue that must be visible in the investigation. And it is frequently a diagnostic clue in itself: a force applied months ago to work around an unrelated problem is exactly the kind of latent condition that turns a minor fault into an event.

**Consequence map.** Three questions, answered before any test is designed: what happens if this equipment fails now; what happens if we stop it; what happens if we test it.

**Knowing what will stop you is part of the diagnosis.** An investigation that discovers at hour six that its planned test requires a permit, a shutdown window, a second person or an authorisation nobody present holds has not been unlucky — it skipped this stage.

**Artefact of this stage:** a constraint statement covering safe state, permissives, active bypasses and the consequence of failure, stoppage and testing.

## Stage 3 — Generate Hypotheses Deliberately

**Generate across layers, not within one.** The strongest predictor of a long investigation is a team that generates five hypotheses inside its own discipline. Deliberately cover: process, mechanical, electrical, instrument and measurement, control logic and configuration, communications, power supply, operational and human factors, environmental — and two more that are the most commonly omitted and the most frequently correct:

**"The measurement is wrong."** This belongs as a standing hypothesis on every diagnosis, because a substantial fraction of industrial faults are faithful reports of an untrue number: a plugged impulse line, a stem conduction error, a second reference draining a loop, a changed density behind an inferred level, an input clamping at range. **A plant is not obliged to be broken merely because an instrument says so.**

**"Nothing is wrong."** The system may be responding correctly to a real condition that nobody has recognised — a protection doing its job, an interlock working as designed, a control loop reacting rationally to a disturbance elsewhere. This hypothesis is unpopular because it implies the complaint was mistaken, and it is right often enough to justify the discomfort.

**Generate at least three, and treat difficulty in generating three as a finding about system understanding rather than about the fault.**

## Stage 4 — Score Evidence Against Hypotheses

Build the matrix explicitly: hypotheses across the top, evidence items down the side, each cell marked *supports*, *contradicts*, *neutral*, or *not available*.

Two ideas do most of the work here.

**Evidence that supports every hypothesis has no diagnostic value**, however compelling it feels and however much effort it took to gather. The value of a piece of evidence is measured by what it *rules out*. A trend that is consistent with six candidates has narrowed nothing; an observation that eliminates four of them has done the work of the entire investigation.

**The surviving candidate is the one that survives the contradictions, not the one with the most ticks.** A hypothesis with a great deal of support and one solid contradiction is in worse shape than a hypothesis with modest support and none — because the contradiction must be explained with evidence, and explaining it away without evidence is the most common route to a confident wrong answer.

**The empty cells define the next test, and the best next test is the one that fills the most cells at once.** This is the formal version of what experienced engineers do intuitively: not "what would tell me more about my favourite theory" but "what single observation would most change the shape of this matrix".

**Artefact of this stage:** the matrix, plus a named discriminating test with its expected outcome under each surviving hypothesis.

## Stage 5 — Two Confidence Gates

Confidence is not one number, and treating it as one is where diagnoses become stories.

```text
Gate 1 — SUFFICIENCY
  Is there enough valid, independent evidence to support any conclusion?
  A property of the evidence set, independent of which hypothesis is favoured.
  Fails when: key signals unavailable, instruments of doubtful validity,
  the event never captured at adequate resolution, records lost.

Gate 2 — DISCRIMINATION
  Does the evidence distinguish this candidate from the others?
  A property of the matrix.
  Fails when: the evidence is consistent with several candidates, or the
  distinguishing observation was never made.

Both gates must pass before a cause is reported.

Notes and limits:
  - passing Gate 2 on a thin evidence set is a coincidence, not a diagnosis
  - passing Gate 1 without Gate 2 is a well-documented shrug: much evidence,
    no discrimination
  - evidence classed as UNAVAILABLE places a permanent ceiling on Gate 1 for
    this investigation, and that ceiling belongs in the report
  - you may ACT without passing both gates; you may not REPORT a conclusion
    you have not reached
```

**That last line is the operative rule.** Action and conclusion are decoupled: the next stage exists precisely so that useful, safe things can be done while the evidence is still insufficient. What is not permitted is converting an unsupported candidate into a stated cause because a report was due.

## Stage 6 — Rank Candidates, Then Plan Action Separately

**First the candidate list**, each entry carrying the evidence for it, the evidence against it, and the observation that would confirm or refute it. That list is a deliverable in its own right and is what should be handed over at a shift change or an escalation.

**Then the pivot that defines this method: the action is chosen by consequence and reversibility, not by rank.**

| Tier | Action | Process risk | Typical cost |
| --- | --- | --- | --- |
| **1** | **Observe** — add recording, raise resolution, arm a triggered capture, wait for recurrence | None | Time |
| **2** | **Non-invasive test** — measure without changing state | Very low | Time, access |
| **3** | **Reversible change inside the operating envelope** — setpoint move, mode change, swap to standby | Bounded and undoable | Minor process disturbance |
| **4** | **Invasive test requiring isolation** — permit, isolation, part of the plant down | Real; requires planning | Downtime, labour |
| **5** | **Irreversible intervention** — replacement, modification | Committed; cannot be undone by observation | Parts, downtime, risk of introducing a new fault |
| **6** | **Action requiring a protection bypass** | A separate category entirely | Authorisation, compensating measures, time limit, reinstatement proof |

**Three rules govern the choice.**

**Take the cheapest action in the list that discriminates.** Not the cheapest action, and not the most informative action — the cheapest one that changes the matrix. Tier 1 is enormously undervalued: arming a high-resolution triggered capture costs nothing, risks nothing, and converts the next recurrence from an anecdote into a waveform.

**Never let the wish to confirm a favoured hypothesis pull you up the tiers.** A Tier 5 intervention chosen because it would prove the theory is a component replacement dressed as a test, and it cannot distinguish a fix from a coincidence.

**And the rule that outranks the others: no diagnostic action may leave the plant in a state whose safe outcome depends on the diagnosis being correct.** This is the sentence that separates safe practice from confident practice. It means that a bypass, a defeated interlock or a disabled protection is never justified by confidence in a diagnosis — only by an explicit risk assessment, an authorisation at the right level, compensating measures, a stated time limit, and a verified reinstatement.

**Permissives and interlocks are the boundary conditions of the plan, not obstacles within it.** A diagnostic step that requires defeating one is a different class of step and goes through a different approval, however inconvenient the timing.

## Stage 7 — Verification and Closure

**Predict before you act.** For each test, state what you expect to observe if the hypothesis is true and what you expect if it is false. **A test whose result you cannot predict either way is not a test** — it is an activity, and it will generate evidence that can be read to suit whatever conclusion is already preferred.

**Verify by mechanism, not by absence of symptom.** This matters most where it is hardest: for an intermittent fault, the symptom not recurring for two weeks is not evidence of a fix, because the symptom did not recur for two weeks before either. Verification means demonstrating that the mechanism has been removed — the loose termination found and remade, the impulse line proven clear, the parameter corrected and its effect observed under the condition that provoked the fault.

**Record the outcome against the prediction**, including when the prediction was wrong. That record is what allows the method to improve, and it is the same feedback loop that condition-monitoring programmes and learned models both require and rarely get.

**Then hand off deliberately.** A diagnosis that ends in a repair has restored a machine. It has not asked why the plant permitted the condition, whether the same weakness exists elsewhere, or what latent condition made a minor fault consequential. **Those questions belong to the retrospective process**, and the hand-off should be explicit: this event warrants an investigation, or it does not, and either way somebody decided.

## Explainability, Auditability and Escalation

**The diagnostic record is a deliverable, not a by-product.** A record with this shape can be reviewed by someone who was not there, disagreed with on specific grounds, reused when the fault recurs, and defended if the decision is later questioned:

- The symptom statement in observables.
- The evidence register with provenance, validity and the items recorded as unavailable.
- The hypothesis-evidence matrix.
- The two gates and where they stood.
- The ranked candidates with their supporting and contradicting evidence.
- The action taken, its tier, and why that tier was chosen.
- The prediction, the observed result, and the discrepancy if any.

**Escalation is a designed state, not an admission of failure**, and its triggers should be defined before the investigation starts:

- The sufficiency gate cannot be passed with the resources available.
- The safe action set is exhausted and the next discriminating step is Tier 4 or above.
- The next step requires authority the investigator does not hold.
- The consequence of being wrong exceeds the investigator's mandate.
- A time box expires.

**Set the time box at the start.** Investigations without one drift, and an investigation that has quietly consumed three shifts without a decision point has usually stopped generating evidence and started generating opinions.

**And escalate with the artefacts, not with the conclusion.** Handing over "we think it's the transmitter" wastes the escalation; handing over the matrix, the register and the named discriminating test lets the next person start where you stopped rather than at the beginning.

## Where Tools and Models Fit

Every tool available to an industrial engineer — a historian query, a physics model, a learned anomaly detector, a searchable case history, a knowledge base — enters this method at one of exactly two points.

**At Stage 1, as an evidence source**, in which case it carries provenance, validity and uncertainty like any other evidence, and is marked *recorded* or *inferred* rather than *measured*.

**At Stages 3 and 4, as a hypothesis generator or a discriminator** — proposing candidates a human might not have considered, or filling cells in the matrix.

**No tool enters at Stage 6.** The action decision is governed by consequence, reversibility, authorisation and the plant's safety case, and those are human and organisational judgements. This is the same boundary the companion article on industrial AI draws for the same reason, and it does not move as tools improve.

Good tooling makes the artefacts of this method cheap to produce and cheap to retrieve — evidence with its provenance attached, prior cases with their outcomes, the matrix, the record. That is a genuine and substantial contribution, and it is a property of good tooling in general: **nothing in the method depends on any particular platform, and a whiteboard and a notebook execute it correctly.**

## Failure Modes of the Method

**The reported symptom accepted as the symptom.** The investigation is committed before evidence exists.

**"Has it ever worked?" never asked.** A commissioning fault hunted with degradation methods.

**Several loosely related complaints investigated as one fault.** No hypothesis explains everything, so every hypothesis is discarded.

**Evidence compared across unsynchronised clocks.** A confident and wrong sequence.

**Forced, simulated or out-of-service values read as measurements.** Hypotheses supported by numbers that mean nothing.

**Assumptions promoted to facts by repetition.** The most common analytical error in the method.

**Absent evidence never recorded as sought.** The alarm that did not appear is invisible.

**Missing and unavailable evidence conflated.** One defines a task; the other defines a permanent limit on confidence.

**Hypotheses generated within one discipline.** The fault is in another.

**"The measurement is wrong" not on the list.** A faithful report of an untrue number, chased through the process.

**"Nothing is wrong" not on the list.** A protection doing its job, investigated as a fault.

**Evidence valued by volume rather than by discriminating power.** Much gathered, nothing ruled out.

**A contradiction explained away without evidence.** The most common route to a confident wrong answer.

**One confidence number instead of two gates.** Specificity on thin evidence, or sufficiency without discrimination.

**A cause reported because a report was due.** The evidence did not change; the deadline did.

**Action chosen by rank rather than by consequence.** Gambling with the plant on the strength of a feeling.

**A Tier 5 intervention used as a test.** A replacement dressed as an experiment; a fix indistinguishable from a coincidence.

**A bypass justified by confidence in the diagnosis.** The safe outcome now depends on being right.

**Constraints discovered at hour six.** The planned test cannot be performed and never could.

**A test performed without a prediction.** Evidence that can be read to suit the preferred answer.

**An intermittent declared fixed because it has not recurred.** It had not recurred before either.

**Escalation with a conclusion instead of artefacts.** The next person starts at the beginning.

**No time box.** Three shifts of opinion generation.

**Repair treated as investigation.** The machine runs; the latent condition and its extent are never examined.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A critical compressor trips roughly once a month. Each time it restarts without difficulty and runs normally afterwards. Nothing has been found in three previous attempts to investigate. Production is losing a shift each time and has requested that the tripping protection be bypassed so the unit can keep running until the cause is identified.

```text
Symptom (framed):
The machine's protection has operated on eleven occasions over ten months.
Trips occur at varying load and time of day, restart is always successful, and
the machine subsequently runs within normal parameters. The system has worked
correctly for years, so this is a change or degradation investigation, not a
commissioning one.

Evidence register (extract, with class):
- [recorded] protection relay event log: eleven operations, each with a
  timestamp and the initiating element identified
- [measured] the relay's own high-resolution disturbance record for the
  three most recent events shows a genuine, short excursion of the measured
  quantity beyond the protection setting
- [recorded] the plant historian shows nothing unusual at any of the eleven
  timestamps; its trend for these tags is stored with a deadband and a
  one-minute aggregation
- [recorded] the clock offset between the relay and the historian is small
  and has been established
- [measured] the protection setting matches the current setting sheet
- [reported] operators consistently describe no unusual process behaviour
  before the trips
- [measured] the relevant instrument loops have been checked and are within
  calibration
- [unavailable] no high-resolution record exists for the eight earlier
  events; the relay buffer holds only the most recent three
- [missing] no measurement exists of the quantity at a resolution and
  bandwidth capable of showing what happens in the moments before the
  excursion
- [recorded] the bypass and force register shows no active bypasses on this
  machine
- [recorded] the change record shows no modifications to the machine, its
  protection or its control in the past two years; the absence of a record is
  not treated as proof that nothing changed

Constraints:
- safe state is a controlled stop, which the protection already achieves
- the protection in question is the machine's principal defence against a
  condition that would cause major damage
- the consequence of the machine failing unprotected is severe and
  irreversible; the consequence of a trip is a lost shift

Hypotheses and discrimination:
  H1  Spurious operation of the protection (relay or wiring fault)
  H2  Instrument fault presenting a false excursion to the protection
  H3  A real, short-duration process excursion the protection is correctly
      detecting
  H4  A real excursion originating outside the machine (supply, upstream
      unit, another consumer)
  H5  Nothing is wrong: the setting is inappropriate for a legitimate
      transient that has always occurred

The relay's own high-resolution record is the discriminating evidence and it
was already available. It shows the measured quantity genuinely exceeding the
setting, which contradicts H1: the relay is not operating without an input to
operate on. It does not discriminate between H2, H3, H4 and H5, because all
four produce exactly that record.

The historian's silence is not evidence against a real excursion. Its deadband
and one-minute aggregation cannot represent an event of this duration, so a
flat trend is the expected appearance of a genuine short excursion in this
archive. Reading it as evidence of a spurious trip would be an error of the
kind this Journal has described repeatedly: an absence in a record that could
not have contained the thing.

Gates:
  Sufficiency  — NOT PASSED. The critical evidence is what happens in the
                 seconds before the excursion, and nothing on the plant
                 records at that resolution.
  Discrimination — NOT PASSED. Four candidates remain, all consistent with
                 every item of evidence held.

Action decision:
The bypass request is a Tier 6 action. It is refused, and the reasoning is
recorded: the only firm finding so far is that the protection is responding to
a real excursion, so a bypass would remove a functioning defence against a
condition that is demonstrably occurring, on the strength of a diagnosis that
has not been reached. The safe outcome would then depend on the diagnosis
being right, which is precisely the condition this method forbids.

The action taken instead is Tier 1. High-resolution triggered capture is armed
on the relevant electrical and process signals, triggered from the protection's
own start signal with adequate pre-trigger memory, together with a capture of
the upstream supply and of the adjacent unit's activity to address H4. Process
risk is nil, cost is a day of instrument work, and the next recurrence — which
the evidence says will arrive within about a month — will convert the
unavailable evidence into measured evidence and discriminate between the four
remaining candidates.

Two supporting measures are taken while waiting: the machine's restart
sequence is reviewed so that a trip costs less than a shift, and the operating
team is asked to record local conditions at the next event.

A time box is set at two recurrences. If the captures do not discriminate,
the investigation escalates with its artefacts rather than continuing.
```

**This is what a good diagnosis looks like when the answer is not available.** No cause has been identified. Both gates have failed and are recorded as failed. And the output is still substantial: one candidate eliminated on evidence, a correctly reasoned refusal of an unsafe request, a zero-risk action that will produce the discriminating evidence at the next occurrence, a compensating measure, and a time box.

**Three transferable points.** First, **the discriminating evidence already existed** — in the relay's own record, which nobody had retrieved in three previous attempts. Second, **the historian's silence was not evidence**, because its storage configuration could not have captured the event; treating a record's limitations as a finding is one of the most productive errors in this field. Third, **the refusal of the bypass was the most important engineering decision in the whole investigation**, and it was made on the basis of what the evidence did establish rather than on what it did not.

## Recommended Practice

- Restate every reported symptom as observations before doing anything else, and record the conditions under which it occurs.
- Ask whether the system has ever worked correctly, and choose the investigation type accordingly.
- Establish the last-known-good boundary, and ask what changed across hardware, software, settings, procedures, people, supply, feedstock, rate and ambient.
- Check whether you are investigating one problem or several.
- Normalise evidence onto one time base, one set of units and one sign convention, and establish clock offsets before comparing anything.
- Record validity as well as value; treat forced, simulated, out-of-service and stale values as what they are.
- Classify every item as measured, recorded, reported, inferred or assumed, and never let an assumption become a fact by repetition.
- Record what you looked for and did not find; absences are evidence.
- Distinguish missing evidence from unavailable evidence, and carry the unavailable items into the report as a ceiling on confidence.
- Establish safe state, permissives, active bypasses and forces, and the consequence of failure, stoppage and testing — before generating hypotheses.
- Generate hypotheses across disciplines, and always include "the measurement is wrong" and "nothing is wrong".
- Build the hypothesis-evidence matrix explicitly, and value each item of evidence by what it rules out rather than by what it supports.
- Treat a solid contradiction as decisive unless it can be shown wrong with evidence.
- Choose the next test as the one that fills the most empty cells, not the one that would confirm the favourite candidate.
- Apply both gates separately — sufficiency and discrimination — and report a cause only when both pass.
- Act without a conclusion when the action is safe; never report a conclusion you have not reached.
- Rank actions by tier, take the cheapest tier that discriminates, and record why that tier was chosen.
- Never justify a bypass, a defeated interlock or a disabled protection by confidence in a diagnosis.
- Never leave the plant in a state whose safe outcome depends on the diagnosis being correct.
- Predict the outcome of every test under each hypothesis before performing it.
- Verify by mechanism, and never accept the non-recurrence of an intermittent as proof of a fix.
- Keep the diagnostic record as a deliverable: symptom, register, matrix, gates, candidates, action, prediction, result.
- Define escalation triggers and a time box at the start, and escalate with artefacts rather than with a conclusion.
- Decide explicitly whether the event warrants a retrospective investigation, and hand it over deliberately.

## Conclusion

Fifty articles into this Journal, the same principles keep arriving from different directions, and they are worth stating together because they are the substance of the method rather than its decoration.

**Measure before replacing.** Almost every article here contains a case where components were changed in sequence and the fault was elsewhere.

**The discriminating evidence usually already exists**, in a device's own memory, in a comparison nobody made, in a difference between two channels that were assumed identical. Retrieval beats acquisition more often than anyone expects.

**Absence is evidence**, but only when its absence could have been recorded — and a record that could not have contained the thing is silent, not exculpatory.

**Assumptions are silent dependencies.** Configured constants, calibration factors, model parameters and design intents fail without alarming, and they are the mechanism behind a startling share of confident wrong numbers.

**Agreement between identical things is not confirmation.** Identical redundancy produces identical errors, and the resulting agreement is the expected outcome whether the pair is right or wrong.

**The first plausible explanation is the most dangerous moment in any investigation**, and the antidote is the deliberate search for the fact that does not fit.

**And the safety layers stay deterministic.** Protection, interlocks and safety functions are provable in advance, independent of everything above them, and never subordinated to a diagnosis — however confident, however well-evidenced, however urgent the production pressure.

None of this requires a particular tool, a particular platform or a particular technology. It requires that evidence carries its provenance, that confidence is bounded by what the evidence supports, that action is bounded by consequence rather than by conviction, and that the record is good enough for somebody else to disagree with. A plant that works this way is not one where nothing goes wrong. It is one where, when something does, the next hour is spent on evidence rather than on opinion — and where the action taken while the answer is still unknown is one that can be undone.
