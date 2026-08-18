# PLC Troubleshooting Through Evidence-Based Diagnostics

## Executive Summary

Most industrial fault-finding is component substitution presented as diagnosis: replace the sensor, then the module, then the drive, and declare the problem solved when the symptom stops. It sometimes works. It produces no understanding, cannot be taught, and fails completely on intermittent faults — which are the faults that actually consume the time.

The alternative is partitioning: use one measurement to eliminate half the candidates, repeat, and stop when one component remains. This article sets out where the partition boundaries are in a PLC-controlled system, what evidence to capture before touching anything, and the discipline that makes intermittent faults tractable.

## The Central Boundary: Command Versus Feedback

Almost every discrete fault in a PLC-controlled system partitions at one place: **is the controller commanding the action, and is the feedback confirming it?**

Four combinations, four entirely different investigations:

| Command | Feedback | Meaning | Where to look |
| --- | --- | --- | --- |
| FALSE | FALSE | Nothing was asked | Upstream: permissives, interlocks, sequence |
| TRUE | FALSE | Asked, did not happen | Downstream: output, wiring, contactor, device |
| FALSE | TRUE | Happened unasked | Feedback path, or genuine uncommanded operation |
| TRUE | TRUE | It worked | The complaint is about something else |

That single reading eliminates most of the plant. The first row sends you into the program; the second sends you into the panel; and the two are almost never investigated by the same person with the same tools.

The reason this matters more than it sounds: **the most common wasted diagnosis is investigating the command path when the command was never issued.** Equipment "not starting" because a permissive is missing looks exactly like equipment "not starting" because a contactor coil is open — from the operator's side of the machine.

## Evidence to Capture Before Touching Anything

Once someone starts changing things, the original state is gone. Capture first:

1. **The controller's diagnostic buffer**, with timestamps, around the event. This is the controller's own account and it is discarded on some operations.
2. **The command and feedback states** for the affected equipment.
3. **Permissive and interlock states individually** — not the combined result.
4. **Distributed station and channel status** for every module involved.
5. **Cycle time**: minimum, maximum and current.
6. **Network port statistics** for the relevant stations: errors, discards, link flaps.
7. **What else was happening** — what started, what stopped, what was being operated.
8. **The first-out record** if the equipment has one.

Points 4 and 6 are the ones most often skipped and most often decisive. An input whose station has dropped out is not a measurement; logic that does not evaluate station status will act on frozen or zeroed values as though they were real, and nothing in the program's own view reveals it.

## The Partitioning Method

**Step 1 — Establish that the fault is real and reproducible.** "It sometimes does not start" needs a frequency and a correlation before it is a fault report. If it happens once per shift on the night shift only, that is already evidence.

**Step 2 — Read command and feedback.** Partition per the table above.

**Step 3 — If the command is FALSE, work up the permissive chain.** Each condition is either satisfied or not; the unsatisfied one is the next question. This is where the design decision to make each condition individually visible pays for itself — without it, this step requires a controls engineer and the program.

**Step 4 — If the command is TRUE and feedback FALSE, halve the physical path.** The chain is: output module → field wiring → interposing relay → contactor coil → contactor contacts → device → feedback contact → input wiring → input module. Measure in the middle rather than working from one end. Each measurement eliminates half the remaining chain.

**Step 5 — Confirm the fix by reproducing the fault and then removing it.** A symptom that stops after a change is not proof the change was the cause; plenty of intermittent faults pause on their own. Where it is safe to do so, restoring the original condition and seeing the fault return is the difference between a repair and a coincidence.

## The Discipline That Makes It Work

**Never change two things between observations.** This is the single rule that separates diagnosis from guessing. If a technician replaces a sensor and reseats a connector, and the fault stops, nothing has been learned — and the untouched cause may still be present in thirty identical machines.

**Measure, do not infer.** "The 24 V must be fine because the light is on" is an inference. The measurement takes ten seconds and is either evidence or a surprise.

**Record what was measured, not what was concluded.** "Terminal 14: 0 V with command TRUE" survives a shift handover. "Wiring problem" does not.

## Intermittent Faults Are a Measurement Problem

An intermittent fault is not mysterious; it is a fault whose triggering condition has not been identified yet. The productive approach is to find the correlation rather than to watch and wait.

**Correlate against everything simultaneously present.** Time of day, production rate, ambient temperature, which other equipment is running, whether a crane passed, whether it rained, how many HMI clients are connected. The correlation is the diagnosis: a fault that happens only above a certain line speed is a timing problem; one that happens only when a large drive starts is an electrical noise or supply problem; one that happens only in the afternoon is thermal.

**Log continuously rather than watching.** A fault that appears once per shift will not be observed live. Trigger a data capture on the fault condition and record the surrounding evidence automatically — this converts weeks of waiting into one occurrence.

**Distinguish "intermittent" from "systematic but rarely triggered".** A signal shorter than the I/O update interval is missed every time it is short — it only *looks* intermittent because the condition producing a short pulse is itself occasional. That is a systematic fault with an occasional trigger, and it has a completely different remedy.

## A Worked Example

*The following is an illustrative engineering scenario.*

**Symptom:** A conveyor drive occasionally fails to start on the automatic sequence. Restarting manually always works. Roughly once per shift, more often on the night shift.

**Evidence captured on three occurrences:**

- command TRUE, run feedback FALSE, for the full start supervision window each time
- overload trip FALSE
- all permissives satisfied at the moment of command
- diagnostic buffer: no controller entry at any occurrence
- remote station status: brief communication interruption on the station carrying the drive's run feedback, coincident with each occurrence
- network port statistics: discard counter on that port rising, incrementing in steps that precede each event
- the night shift runs a second crane on the same aisle

**Reasoning:** The command was issued, so the sequence and permissives are exonerated. Feedback never confirmed. But the drive itself never faulted, and manual restart works — which is inconsistent with a failed contactor or coil. The station interruption coincident with each occurrence explains it: the feedback was not lost at the device, it was lost in transport. The rising discard counter localises it to one port, and the crane correlation suggests a physical cause — a flexing cable or a connector disturbed by movement.

**What substitution would have done:** replaced the drive (no change), then the contactor (no change), then possibly the PLC module — three parts, three shifts, and a fault still present because the actual cause is a cable.

The evidence that decided it — station status and port statistics — costs nothing to read and is invisible to anyone who does not know to look.

## Common Diagnostic Errors

- **Diagnosing from the HMI value rather than the source.** The HMI shows what the program computed, which may be several transformations away from the field.
- **Trusting a stable reading.** A frozen input is stable. So is a plugged impulse line. Stability is not validity, and a value that has been *too* steady is itself evidence.
- **Forcing to test.** Forcing proves the logic downstream of the force; it proves nothing about the chain upstream, and a force left in place is its own future fault.
- **Escalating without evidence.** Handing a fault to engineering with "it does not work" restarts the diagnosis from zero. The captured evidence is what makes escalation useful.
- **Accepting the first plausible explanation.** Plausible is not demonstrated. The check is whether the explanation accounts for *all* the evidence, including the parts that were inconvenient.

## Making a Plant Diagnosable

Much of what makes fault-finding fast is decided at design time, and the highest-value items are cheap:

- **Evaluate station and channel status in the logic that uses those inputs.** This single practice converts an entire class of silent failures into reported ones.
- **Give every equipment object a status word** distinguishing "not commanded", "permissive missing", "faulted" and "in transition".
- **Give the operator interface a reason field** that names the single condition currently holding the sequence, so the first question of every call-out is already answered.
- **Surface the diagnostic buffer** to maintenance rather than only to engineering.
- **Capture first-out** on any equipment with multiple trip sources.
- **Record commissioning baselines** — cycle time min/max, loop resistance, network error counters at zero. Almost every difficult investigation begins with "has this changed?", and only a baseline can answer it.

## Safety Considerations

Diagnosis has a hazard that repair does not: it is performed on a plant that is still able to move. Forcing an output, releasing a permissive or energising a circuit to observe it can start equipment that somebody is standing next to, so every observation made on a live system needs the same authorisation and the same isolation-of-people that a physical intervention would get — and the pressure of a production stop is exactly when that is skipped.

Two specific cautions. **Forcing or overriding on a running plant changes what the control system will do**, and the person doing it must know what the forced state means for every piece of equipment that consumes it — not just the one being investigated. **Nothing credited as a protection layer is bypassed for diagnostic convenience**; that bypass is governed by the plant's management-of-change process, not by the urgency of the fault.

## Recommended Practice

- Read command and feedback before forming any hypothesis.
- Capture the full evidence set before changing anything, with timestamps.
- Partition the physical path by halving, not by working from one end.
- Never change two things between observations.
- Record measurements, not conclusions.
- Find the correlation for intermittent faults; do not wait for a recurrence.
- Trigger automatic data capture on the fault condition.
- Confirm a repair by removing and restoring the cause where it is safe to do so.
- Design station status, status words and first-out into the application so the plant can explain itself.

## Conclusion

Evidence-based diagnosis is not a more careful version of substitution; it is a different activity. Substitution asks "what can I replace?" Diagnosis asks "what does the evidence eliminate?" — and the second question converges, while the first can run indefinitely.

The method is unremarkable: partition at the command/feedback boundary, capture evidence before disturbing anything, change one thing at a time, and treat an intermittent fault as a correlation waiting to be found. What makes it possible is largely decided long before the fault — in whether the plant was built to report its own state, or built to be silent.
