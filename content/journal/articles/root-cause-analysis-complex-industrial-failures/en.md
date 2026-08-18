# Root Cause Analysis for Complex Industrial Failures

## Executive Summary

**"The root cause" is usually a grammatical error.** Simple failures have one; complex industrial failures have a causal *structure* — an immediate cause that could only produce a failure because several other conditions happened to be true at the same moment, most of which had been true for years.

The consequence of forcing that structure into a single sentence is predictable and expensive. The corrective action removes one link, the structure survives, and the same failure returns in eighteen months wearing different clothes — a different component, a different unit, a different-looking symptom, the same underlying weakness. Sites that experience this conclude that root cause analysis does not work. What did not work was the demand for a singular answer.

Two further claims shape everything below.

**Root cause analysis is an evidence discipline, and evidence perishes.** The most consequential decisions in an investigation are made in the first hours — usually by people restoring production, before anyone has decided that an investigation will happen at all.

**And the analytical failure mode is stopping too early.** The first plausible explanation is the most dangerous moment in an investigation, because from then on every fact is read as support for it.

This article is retrospective: a failure has occurred and the question is why, in a way that prevents recurrence. The forward-looking counterpart — a symptom is present and the question is what to do next, safely — is the subject of the companion article on evidence-based diagnostics and safe action planning. Live fault-finding methods for control and network systems are in the companion troubleshooting articles.

## Five Terms That Are Not Synonyms

| Term | Definition | Test that identifies it |
| --- | --- | --- |
| **Immediate cause** | The event or condition that directly produced the failure | If this had not occurred at that moment, would the failure have occurred then? |
| **Contributing factor** | Something that made the failure more likely, more severe, or harder to detect — but was not sufficient alone | Does removing it reduce likelihood or severity without preventing the mechanism? |
| **Root cause** | A cause which, if corrected, makes this failure — and usually a class of failures — no longer possible, and which the organisation can actually control | Can we change it? If we do, does the mechanism become impossible rather than less likely? |
| **Latent condition** | A weakness present in the system long before the event, dormant until circumstances activated it | How long has this been true? Years usually means latent |
| **Consequence** | What the failure produced | It is downstream of the failure; it cannot be a cause of it |

**Three distinctions do most of the work.**

**A cause is not the last thing that was touched.** "It failed after we changed X" is a hypothesis with a timestamp attached, and it deserves testing rather than adoption. Sequence is not causation, and industrial plants generate coincidences at a high rate.

**A root cause must be within the organisation's control.** "Supplier quality" and "operator error" are usually restatements of the question. **"Human error" as a root cause is a stopping point, not a conclusion** — the analytically useful questions are what made the error likely (unclear procedure, poor labelling, high workload, an interface that invites it) and what made it consequential (no independent check, no protection, no recovery path). Both of those are controllable; "be more careful" is not.

**A consequence in the root cause box is a common and revealing defect.** A report whose root cause reads "loss of production" or "equipment damage" has recorded the outcome and stopped.

## The First Hours Decide the Investigation

Evidence perishes on very different timescales, and the fastest-perishing evidence is often the most decisive.

| Evidence | How it is lost |
| --- | --- |
| **Volatile machine data** | Alarm and event buffers roll; drive and relay fault buffers hold a limited number of records; high-resolution trend data is compressed or aged out |
| **Physical state** | Valve and switch positions are changed during restoration; failed parts are cleaned, dismantled or returned to the supplier; debris is swept up |
| **Consumable samples** | Lubricant, process fluid and residue are lost the moment the machine is flushed |
| **Configuration state** | Settings are corrected during recovery, and the pre-failure configuration is gone |
| **Human recollection** | Degrades within hours, and converges as people discuss the event with one another |

**The conflict with production restoration is real and should be treated as legitimate rather than as a discipline problem.** Nobody is going to hold a plant down for a day to preserve a scene. The workable answer is a short, pre-agreed protocol that costs minutes:

- **Photograph before touching anything**, widely and then closely, including positions of local switches, valves and indicators.
- **Capture the volatile buffers** — alarm history, event log, controller diagnostics, drive and protection relay fault records — before anything is reset or power-cycled.
- **Take the sample** before flushing: lubricant, fluid, residue.
- **Bag and label the failed part** rather than returning it immediately for warranty, and resist cleaning it — the surface is the evidence.
- **Record who was present and what each person was doing**, before shifts change.
- **Note the operating state**: rate, product, configuration, supply, ambient.

**That protocol works only if it exists before the failure**, is known to the people who will be first on the scene, and is explicitly authorised so that following it is not seen as delaying restoration.

## Build the Timeline Before Building the Theory

**The timeline is the most productive artefact in an investigation**, and it earns its place twice: it establishes sequence, and — more valuable — it exposes what evidence is missing.

Sources worth assembling: alarm and event logs, historian trends at the highest available resolution, operator logs and shift handovers, work orders and permits, change records, controller and drive fault buffers, protection relay records, laboratory results, and access or attendance records.

**Time synchronisation is the enabler and the usual defect.** Systems whose clocks differ by minutes produce a timeline that is confidently and completely wrong, and the error is invisible because every entry looks precise. **Establish the offset between every source before drawing any conclusion from ordering.**

**Distinguish what the system recorded from what happened.** A "first-out" indication is the first event the system latched, which is not necessarily the first event that occurred — a faster phenomenon may have been below the scan rate, and a suppressed or filtered alarm leaves no record at all. Recorded absence is not absence.

**And look deliberately for what did not happen.** An expected alarm that never appeared, a protection that should have operated and did not, an interlock that permitted something it should have blocked, a standby that failed to start — **absences are evidence, and they are only visible against an expectation**, which is why the timeline should include what the design says should have occurred alongside what did.

## The Evidence Hierarchy

1. **Physical evidence** — the failed component, measured positions, samples taken at the scene, dimensional and metallurgical findings.
2. **Recorded machine data with verified timestamps** — trends, event logs, device fault records.
3. **Contemporaneous documentary records** — logs, permits, work orders, change records made at the time.
4. **Documentation of intent** — drawings, specifications, procedures, design basis.
5. **Human recollection** — indispensable for direction and context, weakest for sequence and detail.

**Two rules follow, and both are frequently violated.**

**Documentation describes intent; the plant describes reality.** When they disagree, the plant is right — and **the disagreement is itself a finding**, usually a more important one than whatever prompted the comparison. An as-built that does not match the installation is a latent condition affecting every future investigation and every future modification.

**Interview early, separately, and for observation rather than explanation.** Ask what a person saw, heard, smelled and did, in order. Do not ask what they think caused it until the observations are recorded, and do not let witnesses discuss the event with each other first: **group recollection converges quickly on a shared narrative that is more confident and less accurate than the individual accounts it replaced.** A witness who offers a theory has stopped being a witness and become an analyst, and their observation is now contaminated by it.

## Causal Structure, Not a Causal Chain

A chain implies a single path from cause to effect. Real failures are structures, and the difference matters because the corrective action follows the shape of the explanation.

**Test each candidate cause for necessity and the set for sufficiency:**

- **Necessary?** Would the failure have occurred without this? If yes, it is not necessary — it may still be a contributing factor.
- **Sufficient as a set?** Do the identified causes, taken together, actually produce the failure? If a gap remains, the explanation is incomplete regardless of how convincing it sounds.

**An explanation that is sufficient but includes unnecessary elements is over-fitted** — it will not generalise, and its corrective actions will address things that were incidental.

**Fault tree thinking is useful conceptually, whether or not a diagram is drawn.** Working backwards from the top event and asking, at each level, whether the conditions below combine as AND or as OR forces a statement that a chain conceals: did these conditions have to coincide, or was each one independently capable of producing the failure? **AND structures are where multi-cause failures live, and they are precisely what a linear method cannot represent.**

**Common-cause failure deserves a specific search.** Wherever redundancy, diversity or independent barriers failed together, there is a shared element, and it is usually one of a short list: a shared supply, a shared calibration or configuration, a shared maintenance visit, a shared design assumption, a shared environment, a shared installer, or a shared spare-parts batch. **Two things that failed together were not independent, whatever the drawing says**, and identifying the shared element is often the most valuable single output of an investigation.

**Latent conditions are found by asking two questions.** *How long has this been true?* — anything true for years is latent, and it was waiting rather than causing. And *what else does this affect?* — the question that turns one incident into a systemic finding, and the one most often skipped because the investigation's scope was defined as one machine.

## Hypothesis Testing

**A single hypothesis is not an analysis.** Generate several deliberately, including ones nobody believes, because the value of an implausible hypothesis is the evidence it forces you to look for.

For each hypothesis, state two things:

- **What evidence would exist if this were true?** Then go and look.
- **What evidence would exist if this were false?** This is the more powerful question and the less natural one. Disconfirming evidence discriminates between hypotheses; confirming evidence usually does not, because several hypotheses predict the same confirming facts.

**Contradictory evidence is the most valuable material in the file.** A fact that does not fit means one of two things: the fact is wrong, and you must be able to demonstrate why; or the hypothesis is wrong. **Explaining away an inconvenient fact without evidence is the single most common analytical failure in industrial RCA**, and it is how investigations arrive confidently at the wrong answer. Record every contradiction explicitly and state how it was resolved. **A report containing no contradictory evidence is a report that stopped looking.**

**Missing evidence must be recorded as missing**, together with its effect on confidence. Three situations are routinely conflated and have different implications:

- **Never collected** — a process failure that can be fixed for next time.
- **Destroyed by the response** — a reason to improve the preservation protocol, and a limit on what this investigation can conclude.
- **Genuinely does not exist** — the plant does not measure it, which may itself be a finding.

**"We could not determine X" is a legitimate conclusion.** Proceeding silently as though X were known is not, and a report that states its uncertainties is more useful — and more defensible — than one that does not.

## Change History and Operating Context

**"What changed?" is the highest-yield question in industrial failure investigation**, and it must be asked broadly: hardware, software, firmware, settings and parameters, procedures, personnel and shift patterns, suppliers and spare parts, feedstock and product grade, operating rate, control mode, and ambient conditions.

**And the trap that ruins the question: the absence of a change record is not evidence that nothing changed.** Undocumented changes are, almost by construction, the ones most likely to cause failures — because a change that went through a review is a change somebody thought about. Ask the people, look at the physical evidence, compare against the last known configuration, and treat "no changes recorded" as an unanswered question rather than an answer.

**Operating context explains why a failure happened *now*.** Many failure mechanisms only complete in a state the plant is rarely in: an unusual production rate, a transition, a start-up, standby supply, a maintenance configuration, a different product, an extreme ambient. **A failure that appears random is often a failure that requires a rare state**, and identifying the state converts an unexplained event into a predictable one.

## Why Five Whys Is Not Enough

**Stated fairly: Five Whys is a genuinely useful tool.** For a simple failure with a single causal path, discussed by people who know the system, it structures a conversation that would otherwise wander, and it is far better than no method.

**Its limits are specific and worth naming, because it is routinely applied well beyond them:**

- **It assumes a single chain.** It has no way to represent two conditions that had to coincide, which is the structure of most complex failures.
- **The path is chosen by whoever answers.** Each "why" has several true answers; the one that gets recorded reflects the group's assumptions, its expertise and often its interests. Two competent teams reach different roots from the same failure, and the method offers no way to decide which is better.
- **It contains no evidence test.** Any plausible answer advances the chain. Nothing in the method requires the answer to be demonstrated.
- **It terminates arbitrarily** — at five, at the first answer somebody can act on, or at "human error", which is the most common stopping point precisely because it feels like an explanation.

**The fix is to bound it rather than abandon it:** use it to generate direction, require evidence for each step, allow the chain to branch when more than one answer is true, and stop when the necessary-and-sufficient test is satisfied rather than at a count.

## Corrective Actions and Verification

**Rank actions by effectiveness, and be honest about where each one sits:**

| Effectiveness | Type of action | Durability |
| --- | --- | --- |
| Highest | Eliminate the hazard or design out the failure mechanism | Permanent; survives staff turnover |
| High | Engineer a barrier, interlock or protective function | Durable if maintained and tested |
| Moderate | Detect and alarm the developing condition | Depends on the response actually happening |
| Lower | Procedure, checklist or work instruction | Decays with turnover and time pressure |
| Lowest | Training, briefing, awareness | Decays fastest of all |

**Actions at the bottom of the hierarchy are chosen disproportionately often**, because they are quick, cheap and can be closed the same week. They are legitimate as supplements and unreliable as primary controls, and a corrective action list consisting entirely of briefings and procedure updates is a list that will not prevent recurrence.

**Every action must name the cause it addresses.** An action list that does not map onto the causal structure is a to-do list that happened to be written after a failure. **Actions against contributing factors are worth taking** — they reduce likelihood or severity — but they must be labelled as such, so that nobody concludes the mechanism has been eliminated when it has only been made less likely.

**Extent of condition is the question that converts a repair into a prevention.** Where else does this latent condition exist? Which other machines were re-rated in that project? Which other loops use that configured constant? Which other procedures have the same gap? **This question is skipped more than any other, because the investigation's scope was defined as one asset**, and it is where most of the value of an RCA actually lies.

**Verification must be defined in advance.** For each action: what evidence will show it worked, who will check, and on what date. **An unverified corrective action is an intention.** And if the same failure recurs after the actions were implemented and verified, that is not a reason to repeat the actions — it is evidence that the analysis was wrong, and the investigation should be reopened as an analysis failure rather than as a new incident.

## Failure Modes of the Investigation

**A single cause demanded by the reporting format.** The structure is flattened to fit the form.

**The first plausible explanation adopted.** Everything after it is read as confirmation.

**Consequence recorded as root cause.** The outcome noted, the mechanism unexamined.

**"Human error" as a terminal answer.** A stopping point that names a person instead of a condition.

**A cause outside the organisation's control.** True, perhaps, and not actionable.

**Evidence destroyed during restoration because no protocol existed.** The decisive evidence lost in the first hour by people doing their jobs.

**Timeline built from unsynchronised sources.** Confident and wrong.

**Recorded absence treated as absence.** A suppressed alarm read as a non-event.

**Witnesses interviewed together and late.** A shared narrative more confident and less accurate than the accounts it replaced.

**Documentation trusted over the plant.** The drawing believed, the installation not checked.

**Contradictory evidence explained away without evidence.** The most common route to a confident wrong answer.

**Missing evidence not recorded as missing.** Confidence stated where none is warranted.

**"No changes recorded" accepted as "nothing changed".** The undocumented changes are the interesting ones.

**Redundant failures analysed separately.** The shared element — the actual finding — never identified.

**Extent of condition never asked.** One machine repaired, three others still waiting.

**Corrective actions consisting of briefings and procedure updates.** The controls that decay fastest, chosen as the primary answer.

**No verification date.** Actions closed on implementation rather than on effect.

**Recurrence treated as a new incident.** The evidence that the analysis was wrong, discarded.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A large rotating machine fails catastrophically. The immediate finding is a destroyed bearing. The initial investigation concludes that the bearing was of poor quality, the supplier is changed, and the action is closed. Eleven months later, a similar machine in the same area fails the same way.

```text
Symptom:
Repeat catastrophic bearing failure on similar machines eleven months apart,
after an initial investigation concluded "bearing quality" and changed
supplier.

Evidence:
- the second failed bearing shows damage consistent with lubricant
  starvation; the first bearing was cleaned before examination and its
  surface evidence was lost
- no lubricant sample was taken from the first machine before it was flushed
  during restoration; the site had no evidence-preservation protocol
- the greasing route covering both machines was rationalised three years ago,
  moving these machines from a weekly to a monthly interval as part of a
  route-efficiency project
- both machines were re-rated to a higher operating speed two years ago
  during a debottlenecking project
- the debottlenecking project's change documentation covers process
  parameters and electrical ratings; it contains no reference to maintenance
  plans, and the maintenance system was not consulted
- the lubrication interval in the maintenance plan has never been revised
  since original commissioning
- the site's management-of-change procedure applies to process and
  engineering changes; changes to maintenance plans are handled separately by
  the planning function with no cross-reference in either direction
- three further machines were re-rated in the same project
- the first investigation is documented as a single-cause finding with one
  corrective action

Reasoning:
The immediate cause of the second failure is bearing degradation by lubricant
starvation. That is the mechanism, and it is not the answer.

Two contributing factors made starvation possible. The greasing interval was
extended during a route rationalisation that optimised route efficiency
without reference to individual machine duty. And the machines were later
re-rated to a higher speed, which changes the lubrication demand, without any
review of the maintenance plan. Either change alone might have been tolerable;
together they moved the machines outside the regime the plan was written for.
This is an AND structure, and it is exactly what the first investigation's
single-cause conclusion could not represent.

The latent condition is organisational and long-standing: the site's
management-of-change process has no link between a change in equipment duty
and the maintenance plan for that equipment. That condition had been true for
years, affected every asset on the site, and is the cause that is both
correctable and general.

The bearing supplier was a plausible immediate answer supported by no evidence
— the surface evidence had already been destroyed and no lubricant sample
existed. The absence of a preservation protocol therefore did more than lose
one investigation; it made the wrong conclusion the only available one, and
bought eleven months of false confidence.

Next investigations:
- confirm the starvation mechanism metallurgically on the second bearing and
  sample the lubricant from the remaining machines now, before any further
  intervention
- reconstruct the lubrication requirement at the re-rated duty and compare it
  against the current plan
- establish the extent of condition: review the three other machines re-rated
  in the same project, and then every asset whose duty has changed since its
  maintenance plan was written
- test whether the management-of-change gap has produced other unreviewed
  maintenance plans, in which case the finding is broader than lubrication
- review the route rationalisation project for other intervals extended
  without duty review
- write and authorise an evidence-preservation protocol, since its absence is
  itself a contributing factor to the eleven-month delay
```

**Three transferable lessons.** First, **the immediate cause is the mechanism, not the answer** — starvation explains how the bearing died and nothing about why the plant allowed it. Second, **the latent condition was the general one**: a missing link between duty change and maintenance plan, true for years, affecting every asset, and correctable — which is what makes it the root cause rather than either individual change. Third, **the absence of an evidence protocol did not merely weaken the first investigation; it determined its conclusion**, because with the surface evidence cleaned and no lubricant sample, "bearing quality" was the only hypothesis that could not be tested and therefore the only one that survived.

## Recommended Practice

- Write and authorise a short evidence-preservation protocol before you need it, and make sure the people first on scene know it and are permitted to follow it.
- Photograph, capture volatile buffers, sample, bag the failed part and record the operating state — in the first minutes, not after a decision to investigate.
- Build the timeline before the theory, and establish clock offsets between every source before drawing conclusions from sequence.
- Include in the timeline what the design says should have happened, so that absences become visible.
- Interview early, separately, and for observation rather than explanation.
- Treat a disagreement between documentation and the plant as a finding, not as an inconvenience.
- Use the five terms precisely, and never place a consequence or an uncontrollable external factor in the root cause field.
- Reject "human error" as a terminal answer, and ask instead what made the error likely and what made it consequential.
- Test each candidate cause for necessity and the set for sufficiency, and state explicitly whether conditions had to coincide.
- Search deliberately for the shared element whenever supposedly independent things failed together.
- Ask how long each condition has been true, and what else it affects.
- Generate multiple hypotheses and seek disconfirming evidence for each.
- Record every contradiction and state how it was resolved; record missing evidence as missing, and distinguish never-collected from destroyed from non-existent.
- Ask what changed across every dimension, and treat "no changes recorded" as an unanswered question.
- Identify the operating state the failure required, because that is why it happened now.
- Bound Five Whys: evidence at each step, branching where several answers are true, and termination on sufficiency rather than on a count.
- Rank corrective actions by effectiveness, label actions against contributing factors as such, and do not let briefings be the primary control.
- Ask the extent-of-condition question in every investigation, and scope it beyond the asset that failed.
- Define verification evidence, an owner and a date for every action, and close actions on demonstrated effect.
- Treat recurrence after verified actions as evidence that the analysis was wrong, and reopen it as such.

## Conclusion

The purpose of an investigation is not to explain a failure; it is to prevent the next one. Those are different objectives, and the difference shows up in the shape of the answer. An explanation can be satisfying, single-sentenced and shareable. A prevention has to name a condition the organisation controls, demonstrate that removing it makes the mechanism impossible, and check afterwards that it did.

The disciplines that get there are unremarkable individually: preserve evidence in the first hour, build the timeline before the theory, rank evidence honestly, look for the conditions that had to coincide rather than the link in a chain, hunt actively for the fact that does not fit, and ask where else the weakness exists. What makes them hard is that each one costs something at the moment it is needed — time while production is down, comfort while a satisfying explanation is available, scope while the investigation is supposed to be about one machine.

The failures that recur are almost always the ones where those costs were avoided.
