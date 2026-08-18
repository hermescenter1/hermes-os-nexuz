# Designing High-Performance HMI Systems

## Executive Summary

A high-performance HMI is not a more attractive mimic diagram. It is an interface designed around a specific engineering claim: that an operator's attention is a fixed, scarce resource, and that every visual element either helps them notice, decide and act — or competes with the elements that do.

That claim has consequences most process graphics violate. Colour becomes something you spend rather than something you decorate with. Numbers become less useful than deviations. Photorealism becomes a liability. And the display hierarchy stops being a menu tree and becomes a model of how operators actually move between levels of detail.

## Why This Matters

The traditional plant mimic was inherited from the panel it replaced: a schematic of the process, colour-coded by equipment type, with every measured value displayed as a number. It is intuitive to specify, easy to sell, and it fails at the one moment it matters.

The failure mode is specific. During normal operation everything is coloured, so nothing stands out; the operator learns to scan rather than to notice. During an upset, the same display is still fully coloured — the abnormal condition has no visual channel left to claim, because normality already used them all.

The engineering statement of that problem: **a display where normal operation is visually loud has no headroom to signal abnormality.** Everything else in high-performance HMI design follows from reserving that headroom.

## Colour Discipline

Colour is the highest-bandwidth pre-attentive channel humans have. Spending it on identity — this pipe is water, that vessel is a reactor — consumes it permanently, because identity never changes and therefore never needs attention.

The discipline that recovers it:

| Visual channel | Reserve for | Do not use for |
| --- | --- | --- |
| Saturated colour | Abnormal conditions and alarms only | Equipment type, product, branding |
| Greyscale shape and line weight | Process structure, equipment identity | — |
| Position and layout | Relationship, flow direction | — |
| Text | Values that must be read exactly | Values that only need comparison |

Two corollaries that are routinely resisted and routinely correct:

**Running equipment should be visually quiet.** The intuition is to make a running pump green. But a plant with two hundred running pumps then has two hundred green objects, and the one that stopped is distinguished only by the absence of green — a much weaker signal than presence would have been. Quiet-when-normal, distinct-when-not is the stronger arrangement.

**Colour must never be the only carrier of meaning.** A meaningful fraction of the male population has some form of colour vision deficiency. Any state distinguished only by hue is invisible to those operators. Pair colour with shape, position or a text token.

## Deviation Over Value

An operator monitoring a pressure does not need to know it is 4.72 bar. They need to know whether it is where it should be, and if not, in which direction and by how much relative to the limits that matter.

This is why the most useful single element in high-performance HMI is not a numeric readout but an **analogue indicator showing the value against its normal operating range and its limits**. It answers "is this OK?" pre-attentively — from across the room, without reading — and "how far off?" on inspection.

The numeric value still belongs on the display, but as a secondary detail for when an exact figure is needed, not as the primary signal. A screen of twenty numbers requires twenty acts of reading and twenty mental comparisons against remembered setpoints. A screen of twenty deviation indicators requires one glance.

## Display Hierarchy

The hierarchy is the navigation model, and it works when each level answers a different question:

```text
Level 1  Plant / area overview
         "Is anything wrong, and where?"
         KPIs, area status, aggregated deviation

Level 2  Process unit
         "What is happening in this unit?"
         The main operating display; most operator time is spent here

Level 3  Equipment detail / faceplate
         "What is this device doing and why?"
         Modes, permissives, interlocks, commands, local trend

Level 4  Diagnostic / support
         "Why is this behaving unexpectedly?"
         Device diagnostics, configuration, maintenance detail
```

Two rules make the hierarchy usable:

**Any level must be reachable from any other in a small, predictable number of actions.** An operator responding to a Level 1 indication should reach the relevant Level 2 display directly from it, not by navigating a menu tree from the root.

**Level 2 is where the design effort belongs.** It is where operators spend most of their time, and it is the level most often neglected in favour of an impressive Level 1 overview that is looked at rarely.

## Faceplates and Consistency

A faceplate is the standard interaction surface for one class of equipment. Its value comes entirely from consistency: once an operator has learned the pump faceplate, they have learned all four hundred pumps.

What a faceplate should expose, and the reason each matters:

- **Current mode**, explicitly — auto, manual, maintenance, out of service. Mode inferred from context is mode misread under pressure.
- **Why the equipment cannot start**, when it cannot: which permissive is unsatisfied, which interlock is active, whether a trip is latched. This is the same distinction discussed in the constraint-layer article, surfaced where the operator makes decisions.
- **Command affordances appropriate to the current mode**, with unavailable commands visibly unavailable rather than absent. An operator should be able to see that a command exists and is currently not permitted.
- **A short local trend**, because "is it stable?" is a question about the recent past, not the present instant.

Consistency is an engineering constraint, not an aesthetic preference: **a second, subtly different pump faceplate is a training and error-rate liability**, and the pressure to create one arrives from a single project's special case. Resist it the same way you resist a mode input that changes a function block's fundamental behaviour — by asking whether it is genuinely a different class of equipment.

## Trends

Trends deserve deliberate design because they are how operators reason about causality.

**Related variables belong on one trend.** A controller's process variable, setpoint and output on one chart shows the loop's behaviour; the same three on three charts shows three unrelated lines.

**Default time spans should match the process time constant.** A ten-minute window on a slow thermal process shows a flat line; a twelve-hour window on a fast flow loop shows noise. Neither supports reasoning.

**Scales should be stable, not auto-ranging.** An auto-ranging chart redraws its own axis as the data changes, which makes a small excursion look identical to a large one. A fixed, meaningful scale preserves the visual magnitude of a deviation — which is the entire point.

## ISA-101 and Where Judgement Remains

ISA-101 provides the recognised framework for the HMI lifecycle — philosophy, style guide, design, implementation, operation and change management. Its most valuable contribution is structural: it establishes that an HMI has a documented philosophy and a style guide that individual displays must conform to, rather than each screen being an independent design decision by whoever built it.

What the standard frames but does not decide for you is the content: which variables belong on Level 2, what the normal operating range of each indicator is, which conditions justify a colour, and what an operator is expected to do about each. Those are process and operations decisions, and they require the people who run the plant in the room.

The practical failure to avoid: adopting the visual style — grey backgrounds, muted palette — without the philosophy or the rationalisation behind it. The result looks like a high-performance HMI and performs like the mimic it replaced, because the underlying decisions about what deserves attention were never made.

## Operator Workload

Two workload questions are worth designing against explicitly.

**How many displays must an operator hold in working memory to understand the plant state?** If the answer is more than a small number, the Level 1 overview is not doing its job.

**How many navigation actions separate noticing a problem from acting on it?** Each one is a place to lose the thread, and under alarm-flood conditions each one competes with the alarm queue for attention.

A related discipline: **the display should not require the operator to compute.** If an operator routinely subtracts two values, compares against a remembered limit or mentally integrates a rate, that arithmetic belongs in the system. The operator's scarce resource is judgement, not calculation.

## Failure Modes

**Rainbow normality.** Every element coloured, so abnormality has no channel. The most common defect and the hardest to retrofit, because it requires re-deciding every graphic.

**Photorealistic graphics.** 3D vessels, gradients and shadows add visual detail that carries no process information while consuming the attention budget. Realism is not comprehension.

**Alarm colour reused for identity.** Red used for a product line, a valve type or a brand accent. The operator's pre-attentive response to red is now unreliable.

**Faceplate drift.** Several variants of the same equipment class, each slightly different, each learned separately.

**Auto-ranging trends.** Every excursion looks the same size.

**Level 1 built for visitors.** An impressive overview designed to be shown to management, and a neglected Level 2 where operators actually work.

## A Representative Scenario

*The following is an illustrative engineering example.*

A water treatment plant's filtration overview shows twelve filters, each drawn as a coloured vessel with numeric readouts for flow, differential pressure and level. During normal operation the display is fully saturated. An operator scanning it must read thirty-six numbers and compare each against a remembered normal range.

The high-performance redesign draws the same twelve filters as grey shapes, each carrying a differential-pressure deviation indicator against its normal band. A filter approaching backwash reads as a visibly displaced indicator; a filter that has failed to complete a backwash carries the only colour on the screen.

The information content is unchanged — the same measurements are available, and the exact numbers remain one click away on the faceplate. What changed is the number of reading acts required to answer "is anything wrong?": from thirty-six to zero.

## Maintainability

Graphics are software and age like it. Two practices matter:

**Build from a library of standard objects**, not by copying and editing screens. A change to the pump symbol should propagate; if it requires editing two hundred displays, it will not happen and the inconsistency becomes permanent.

**Keep the style guide as an enforced artefact**, not a document written once at project start. Where the tooling can validate conformance — palette, symbol usage, font sizes — that check is worth more than a review that happens when someone remembers.

## Recommended Practice

- Write the HMI philosophy and style guide before designing displays; use them as the decision criteria.
- Reserve saturated colour for abnormal conditions; render structure and identity in greyscale.
- Never encode meaning in hue alone.
- Show deviation against a normal range as the primary indication; keep exact values secondary.
- Design a four-level hierarchy and invest the most effort in Level 2.
- Standardise faceplates per equipment class and resist per-project variants.
- Group related variables on one trend, with stable scales and process-appropriate spans.
- Remove arithmetic from the operator; put it in the system.
- Build displays from a shared object library so a change propagates.

## Conclusion

The measure of an HMI is not how much of the plant it shows. It is how quickly an operator can answer three questions: is anything wrong, where, and what should I do. A display that answers all three without reading has done its job; one that requires scanning and mental arithmetic has moved work from the system to the person least able to spare it.

The techniques are unglamorous — grey backgrounds, fewer numbers, consistent faceplates, honest scales. What makes them work is the underlying decision to treat operator attention as the constrained resource in the design, and to spend it deliberately.
