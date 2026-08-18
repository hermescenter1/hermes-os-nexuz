# Designing Operator Interfaces for Abnormal Situations

## Executive Summary

Almost all HMI design effort goes into the state a plant is in almost all the time. That is understandable and largely misplaced. During normal operation the interface is a monitoring surface, and a mediocre one is survivable. During an abnormal situation it becomes a decision instrument, and its weaknesses become the operator's weaknesses at exactly the moment that matters.

The design problem is specific: the interface must remain useful when the information reaching it is *worse* than usual — fewer trustworthy measurements, more simultaneous alarms, and less time. Most displays are designed on the opposite assumption.

## Why This Matters

> This article assumes the general principles of high-performance HMI design — hierarchy, colour discipline, faceplates, navigation — and does not repeat them. Its subject is what changes when the process leaves normal.

Three properties of abnormal situations drive the entire design:

**Information degrades exactly when it is most needed.** The instrument that would tell you what is happening is often the one that failed, or is reading through a condition it was not calibrated for. An interface that presents every number with equal confidence is actively misleading in this state.

**Attention narrows under load.** Peripheral information stops being processed. A display whose critical content is spread across the screen relies on a scanning behaviour that stops happening.

**The operator must build a causal story, not read values.** The question is never "what is the level?" It is "why did this happen, what is it doing now, and what will happen if I do nothing?" Interfaces that answer the first question well and the other three not at all are common.

## Alarm Floods

Floods are not an alarm-rationalisation problem alone; they are a presentation problem with its own design response.

> Alarm philosophy, rationalisation, KPIs and the lifecycle that reduces flood frequency are covered in the companion articles on alarm management. This section is about the interface behaviour once a flood is already happening.

**A chronological list is the worst possible presentation during a flood** and the most common one. It presents fifty consequences and one cause in arrival order, with the cause usually near the top and already scrolled away.

Design responses that work:

- **First-out capture.** The initiating event, latched and displayed separately, is the single highest-value piece of information in a flood. It must survive the flood rather than being one row in it.
- **Grouping by plant area or by cause**, so a flood presents as "unit 3 tripped" rather than as sixty independent facts.
- **Suppression that is visible.** Alarms suppressed by design during a known condition are legitimate; suppression the operator cannot see is a hazard, because the operator cannot distinguish "quiet" from "silenced".
- **A rate indication.** Knowing that alarms are arriving faster than they can be read is itself information, and it tells the operator to stop reading the list and look at the process.

The design intent to hold onto: **during a flood, the interface's job is to reduce the list to a situation, not to display the list faithfully.**

## First-Out and Causal Context

First-out information — which condition acted first — is the difference between diagnosing a trip in one minute and thirty.

What makes it usable:

- **It must be captured at the source.** Reconstructing the first cause from timestamps at the supervisory layer fails when scan and communication delays exceed the interval between the events, which for a fast trip sequence they usually do.
- **It must latch.** The initiating condition is frequently gone by the time anyone looks — a pressure that spiked and recovered, a contact that opened for 200 ms.
- **It must be reachable in one step from where the operator already is.** First-out that requires navigating to a diagnostic screen will be consulted after the event, not during it.

**Interlock and permissive visibility belongs here too.** When a start is refused, the interface should show *which* permissive is not satisfied, not merely that the start failed. The alternative is an operator pressing a button repeatedly while the reason sits in logic nobody can see from the control room — a failure pattern that appears in almost every plant with a complex start sequence.

## Degraded Instrumentation

This is the section most often missing entirely, and the one with the largest consequence.

**A failed measurement must never look like a valid one.** Three states must be visually distinct at a glance:

| State | What it means | What the display must convey |
| --- | --- | --- |
| Good | Measurement current and within range | Normal presentation |
| Stale | Last known value, communication lost | Value shown, clearly marked as not current |
| Bad | Sensor fault, out of range, failed | Value withheld or explicitly invalid |

The dangerous case is **stale**, because a frozen value looks exactly like a stable process. An operator watching a level that has not moved for four minutes will draw one conclusion if it is stable and the opposite if the reading is simply dead — and nothing in an unmarked numeric display distinguishes them.

**Derived and calculated values inherit the quality of their inputs.** A flow total computed from a failed transmitter should degrade visibly rather than continuing to accumulate a plausible-looking number. Where a calculation silently substitutes a default for a bad input, the display becomes confidently wrong, which is worse than being unavailable.

**Redundant or related measurements are worth showing together during abnormal states.** Two instruments that normally agree and now disagree is a diagnosis; either one alone is just a number.

## Mode and Degraded Operation

Plants rarely go from running to stopped. They go through intermediate states, and interfaces frequently do not represent those states at all.

The operator needs to know, without asking:

- **What mode each major unit is in** — automatic, manual, local, out of service, maintenance override.
- **Which loops are in manual** and how long they have been there. A controller left in manual after a shift change is a well-known precursor to an excursion, and it is invisible unless the display makes it visible.
- **Which protective functions are bypassed or overridden**, and for how long. Bypasses are sometimes operationally necessary; an unrecorded, unindicated bypass is not a bypass but a hidden change to the plant's protective behaviour.
- **What the plant is currently capable of.** Running on one of two pumps, with a cooling train unavailable, is a different plant from the one the display normally represents.

**The design principle: degraded capability must be visible without the operator having to reason about it from component states.** Inferring "we have no spare cooling capacity" from four separate pump symbols is exactly the kind of mental work that stops happening under load.

## Process Excursions

An excursion is a trajectory, not a value, and interfaces built around present values consistently under-serve it.

**Trends are decision support, not history.** A value at 78 % means little; a value at 78 % that was 45 % four minutes ago means something specific. During abnormal conditions, the trend of the key variables should be visible where the operator is looking, not one navigation step away.

Design elements that matter for excursions:

- Trends with **an appropriate window for the process time constant**. A one-hour window on a fast process shows a vertical line; a five-minute window on a slow one shows noise.
- **Limits drawn on the trend**, so proximity is spatial rather than arithmetic.
- **Rate of change made explicit** where it drives the decision. For some processes, how fast a variable is moving determines the response more than where it currently is.
- **Related variables on shared time axes**, because the relationship between two curves is often the diagnosis.

## Avoiding Interface Overload

Every element in this article adds information, and the overall design constraint pulls the other way: **an interface that presents more during an abnormal situation has usually made the situation worse.**

Reconciling these requires deciding what to *remove*:

- Decoration, gradients, three-dimensional effects and animation consume attention and convey nothing. Their cost is invisible during normal operation and significant during an event.
- Detail appropriate to steady-state monitoring can recede when the situation changes; not everything visible normally needs to remain visible.
- Popups that demand acknowledgement during a developing situation are an interruption at the worst possible moment.
- The number of navigation steps between noticing something and understanding it is a design parameter. Under load, three steps is often equivalent to infinity.

**A useful test: can the operator answer "what is wrong, what caused it, what is it doing, and what should I do" without leaving the display they are on?** If not, the design is asking for navigation at the moment navigation is least likely.

## Safe Recovery

Recovery gets less design attention than the event itself and is where a second incident most often originates.

What the interface should support:

- **Where the plant currently is in the recovery sequence**, if a sequence exists. Restart procedures are frequently in a document while the plant is on a screen.
- **What must be true before the next step** — permissives again, presented as a checklist state rather than as a refusal after the attempt.
- **What has been reset and what has not.** A latched trip that was cleared in one place and not another is a classic cause of a second trip minutes later.
- **What is still bypassed from the event.** Overrides applied during the abnormal condition must be visible during recovery, or they become permanent by accident.

**Recovery is also when the record is made.** An interface that makes it easy to capture what happened — a snapshot, an annotation, a preserved event window — produces a post-event review with evidence rather than recollection.

## Failure Modes

**Chronological alarm list as the only presentation.** The cause is one row among sixty, already scrolled past.

**No first-out, or first-out derived at the supervisory layer.** Sequence reconstruction fails because the events are closer together than the scan interval.

**Frozen values indistinguishable from stable ones.** Communication loss reads as a steady process.

**Calculations that substitute defaults for bad inputs.** The display is confidently wrong.

**Interlock refusals without a reason.** The operator retries; the blocking permissive is not visible from the control room.

**Manual loops and bypasses that are not indicated.** An operational state nobody can see becomes an operational state nobody remembers.

**Trends one navigation step away.** The trajectory that explains the situation is not where attention is.

**Recovery driven by a paper procedure while the plant is on screen.** Steps are skipped or repeated; a second trip follows.

## A Representative Scenario

*The following is an illustrative engineering example.*

A process unit trips. The alarm list receives more than eighty entries within a minute. Operators isolate the unit safely, but the restart is delayed while the cause is investigated, and the delay dominates the production loss.

The evidence, assembled afterwards: the initiating condition was a single transmitter failing to an out-of-range value, which drove its control loop to an extreme and propagated. In the alarm list, the transmitter fault appeared as one entry among the flood, indistinguishable in presentation from the eighty consequences. On the process display, the transmitter's value continued to be shown in the same style as every valid measurement — the display had no representation for "bad".

Two design absences turned a five-minute diagnosis into an hour: no first-out latch, and no visual distinction for invalid data. Neither is expensive to correct; both were simply never specified, because the display was designed for the plant running normally.

The correction is unglamorous and structural: capture and latch the initiating event at the controller, render bad and stale quality distinctly wherever a value appears, and place the first-out indication where the operator already looks. None of it changes the process; all of it changes how quickly the process is understood.

## Recommended Practice

- Design the abnormal case explicitly; do not treat it as the normal display under stress.
- Capture and latch first-out at the source, and display it where the operator already is.
- Present floods as situations — grouped, rate-indicated, with suppression visible — not as faithful chronological lists.
- Make good, stale and bad data visually distinct wherever a value appears.
- Degrade derived values with their inputs rather than substituting defaults.
- Show why a permissive or interlock is blocking, not merely that it blocked.
- Indicate loops in manual, active bypasses and overrides, with elapsed time.
- Make degraded plant capability visible directly, not inferable from component states.
- Put trends with limits and appropriate time windows where the decision is made.
- Remove decoration and unnecessary detail; measure the design by navigation steps under load.
- Support recovery on screen: sequence position, outstanding permissives, reset state, remaining bypasses.
- Review displays after real events, using them as the test the design never got.

## Conclusion

An interface for abnormal situations is not a more detailed version of the normal interface. It is designed against different assumptions: less trustworthy data, less available attention, less time, and a question that is causal rather than numeric.

The specific elements are individually modest — first-out latching, quality-differentiated values, visible bypasses, trends with limits, permissive reasons — and collectively they decide whether an event is diagnosed in minutes or in hours. The reason they are so often absent is not cost or difficulty. It is that the display was specified by people imagining the plant working, and it will be used by people whose plant has stopped.
