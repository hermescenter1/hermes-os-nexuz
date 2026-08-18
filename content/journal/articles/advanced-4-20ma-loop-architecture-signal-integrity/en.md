# Advanced 4–20 mA Loop Architecture, Isolation and Signal Integrity

## Executive Summary

The 4–20 mA loop is the most successful analogue interface in industrial history, and its reputation for simplicity is the source of most of the trouble it causes. **The standard specifies a current, not a circuit.** Everything that makes a real loop work — or fail in interesting ways — sits in the five questions the standard does not answer:

**Who supplies the loop voltage?** **Where is the loop's single connection to the reference system?** **What else is in series, and what did each of those devices assume?** **Does a digital protocol share the same pair, and does everything in the path let it through?** **How does the receiving input actually measure, and does it share anything with its neighbours?**

Get one of these wrong in an obvious way and the loop reads zero — cheap, immediate, fixed in an hour. Get one wrong in a subtle way and the loop works, reads plausibly, and is wrong by a few percent for years, or communicates intermittently, or drifts with the weather, or moves with a completely different process variable.

The fundamentals, the loop budget arithmetic and the general failure taxonomy are set out in the companion article on 4–20 mA current loops. The plant-level questions — signal categories, segregation, shield policy and isolation granularity across a system — are in the companion article on instrumentation architecture. This article is the loop itself, treated as a circuit.

## Who Powers the Loop: The Active and Passive Matrix

This single question explains more first-day commissioning failures than any other, and the vocabulary around it is genuinely inconsistent between manufacturers.

**The definition that never changes:** an **active** device supplies the voltage that drives the loop. A **passive** device does not — it either regulates the current (a transmitter) or measures it (a receiver), but it contributes no energy. **Every loop needs exactly one active device.**

**On the field side**, the distinction is not the same as the two-wire/four-wire distinction, and conflating them is a common error:

- A **two-wire transmitter** takes its own supply from the loop and regulates the loop current. It is inherently passive: it cannot power the loop because it is powered *by* it.
- A **four-wire transmitter** has its own supply, but its current output may be **either** active (it drives the loop) **or** passive (it regulates a current supplied by someone else). A four-wire device is not automatically an active source, and assuming it is has broken many commissioning days.

**On the system side**, an input channel is active if it provides loop power and measures the returning current, and passive if it only measures a current supplied elsewhere.

| | **Passive input** (measures only) | **Active input** (supplies and measures) |
| --- | --- | --- |
| **Passive transmitter output** | Nothing powers the loop — an external supply is required | Correct; the standard two-wire arrangement |
| **Active transmitter output** | Correct; the transmitter drives the loop | **Two sources in series — wrong** |

**The failure signatures are distinct and worth memorising:**

**Passive into passive** gives zero current. Everything appears dead, no device is damaged, and the natural response — replace the transmitter, then the cable, then the card — finds nothing, because nothing is broken. The loop simply has no source.

**Active into active** puts two supplies in series into a low-impedance circuit. The current is determined by whichever source dominates rather than by the measurement; the reading is typically pegged at the top of range or nonsensical; and depending on the devices, one of the two inputs may not survive it.

**The vocabulary trap is worth stating explicitly.** Manufacturers describe this distinction as active/passive, source/sink, self-powered/loop-powered, or with terms defined only in their own documentation, and the mappings are not consistent across vendors. **Determine the arrangement from the terminal diagram and the presence or absence of an internal supply, never from the word on the datasheet.** A two-minute look at the drawing settles what an hour of argument will not.

**Polarity is the other half of this.** The loop is a DC circuit and it is polarised throughout. A reversed connection yields zero current in most cases, and some devices have reverse protection while others do not.

## What Else Is in Series: Multi-Device Interaction

A 4–20 mA loop is a series circuit, and this has two consequences that pull in opposite directions.

**The current is identical everywhere in the loop.** This is the entire virtue of the standard: a voltage drop along the cable does not change the measurement, and every series device sees the same current regardless of its position. It is why the interface survived fifty years.

**The voltage at each point is not.** Every series device sits at a different potential relative to the loop supply, which means each device's own reference moves depending on what is upstream of it. **This is why the position of a device in the loop matters even though the current does not change** — and why an indicator with an earthed case behaves differently in one position than another.

**Adding a device consumes budget that was allocated at design time**, which the companion article treats in full. The point to add here is the *interaction* rather than the arithmetic:

**Every added device is a candidate second reference.** A panel indicator with an earthed case, a chart recorder with a grounded input, a trip amplifier whose common is bonded to the enclosure — each of these may introduce a connection between the loop and the reference system. Since the loop is allowed exactly one such connection, adding a device can silently violate the rule that the original design satisfied.

**Every added device is also a candidate loop-breaker.** A series element whose failure mode is open-circuit converts its own fault into a total loss of measurement. This is sometimes exactly what is wanted — a fail-safe trip arrangement — and sometimes a surprise, particularly when the device was added for a convenience reason such as a local display.

**When more than one system needs the value, split it rather than chaining it.** A signal splitter or a repeater with multiple outputs delivers the same measurement to several receivers as independent circuits, each with its own reference and its own budget. Daisy-chaining receivers in series ties their fates together, stacks their burdens, and multiplies the reference problem by the number of devices. The splitter costs more at purchase and considerably less over twenty years.

**Two systems must never both try to drive the same loop.** The arrangement occurs when a measurement is "shared" with a second control system by wiring its input in parallel rather than in series, or by connecting a second active input. The result is not a shared measurement; it is two sources arguing.

## The Single Reference Rule

**A 4–20 mA loop should have exactly one connection to the reference system.** Neither zero nor two.

**Zero connections** leave the loop floating, so its common-mode potential relative to the receiving input is undefined and can drift anywhere the coupling takes it — including outside the input's usable common-mode range, at which point the reading is invalid rather than noisy.

**Two connections** are worse, because they create a genuine parallel circuit. The loop current can now return by two routes: the intended return conductor, and the reference system between the two connection points. **The consequence is not primarily noise — it is a reading error**, because the share of the current that returns through the reference path bypasses the receiving input's sense resistor. The card measures less current than the transmitter is producing, and the reading is stable, plausible and low.

**That is the crucial and under-appreciated point of this article.** A second earth on a current loop does not necessarily announce itself as instability. It very often announces itself as a calibration discrepancy that survives recalibration, because the next calibration simply adjusts the transmitter to compensate for the current that is going somewhere else.

**Where the single point belongs** is usually the receiving end, so that the measurement and its reference share a potential. A barrier arrangement may dictate otherwise, in which case the barrier's requirement governs.

**The second reference is usually accidental, and the usual suspects are few:**

- A transmitter whose sensor circuit is not isolated from its housing, where the housing is in metallic contact with earthed process pipework.
- A shield landed on a loop conductor rather than on a dedicated shield bar.
- A surge protection device whose earth connection is, by design, a connection to the reference system.
- Moisture in a field enclosure creating a resistive path that is neither open nor short.
- An added indicator, recorder or trip amplifier as described above.

**Isolation is the general answer.** A loop isolator turns one circuit with two references into two circuits with one reference each, which is why isolators are fitted far more often to solve earthing problems than to solve noise problems.

## Barriers and Isolators, as Circuit Elements

Within the loop, a barrier and an isolator are completely different components, and treating them as interchangeable safety devices misses everything that matters electrically.

**A zener-type barrier is a passive network in series with the loop.** Electrically, it adds series resistance and drops voltage, which comes directly out of the compliance budget. Functionally, it depends on a connection to a defined intrinsic-safety earth in order to limit energy, which means **the barrier dictates where the loop's reference is** — the earthing decision is made by the safety device, not by the instrumentation designer.

**A galvanic isolator breaks the loop into two independent circuits.** The field side and the system side each have their own reference, which removes the earthing constraint entirely. Many isolators also supply the field side, acting as a repeater power supply.

**Here is the consequence that catches people, and it is worth stating as a rule.** **Fitting an isolator changes which side of the loop is active.** A retrofit isolator installed to cure an earthing problem typically presents an *active* output to the system side. If that system input was already an active input — because it was previously powering a two-wire transmitter directly — the retrofit has just created an active-into-active loop. The measurement was fine yesterday, the isolator was installed to improve it, and today the loop reads full scale.

**The general rule that follows: any change to the devices in a loop is a change to the loop's architecture**, and the active/passive matrix, the reference point and the compliance budget must all be re-checked, not just the one that motivated the change.

## HART Coexistence: The Constraints Nobody Reads Until Commissioning

HART superimposes a frequency-shift-keyed digital signal on the same pair that carries the analogue current. Its mean value is zero, which is why it does not disturb the analogue measurement — a genuinely elegant piece of engineering that hides three constraints.

**The loop needs enough resistance.** The digital signal is a small current modulation, and it is detected as a *voltage*, which means it needs resistance to develop across. **This is the exact opposite direction from the DC budget**, which pushes the designer to minimise resistance. A loop optimised purely for compliance voltage can be too low-impedance for reliable HART communication, and the required minimum is a design input, not an accident.

**The loop must not shunt the digital signal.** Excessive cable capacitance on a long run, a filter capacitor added across an input to "clean up" a reading, or a series device presenting a low impedance at the signalling frequencies will all attenuate the digital signal while leaving the DC current untouched. **This produces a completely coherent fault that people nevertheless find baffling: the measurement is perfect and communication is impossible.** They are different signals with different requirements sharing one pair.

**Not everything in the path passes HART.** Barriers, isolators and some input cards may or may not be transparent to the digital signal, and this is a specification item to be confirmed rather than assumed. A loop with a HART transmitter and a non-transparent isolator has HART devices and no HART.

**Two operational points complete the picture.**

A hand-held communicator must be connected across a resistance, not across a low-impedance source — which is why connecting at one point in a loop works and connecting at another does not, and why this is a source of considerable confusion in the field.

And **a device left in multi-drop mode parks its analogue output at a fixed low current**, because in that mode the current no longer carries the measurement. The 4–20 mA reading from such a device is a constant, plausible-looking low value, and it is not a measurement at all. A device inadvertently configured this way passes every wiring test and reports a stable process that does not exist.

**Finally, a governance point.** HART carries the device's own diagnostics, its configuration, its calibration history and often a secondary variable. **If nothing in the plant reads any of it, the site has bought HART transmitters and installed them as analogue ones** — which is a legitimate decision, but should be a decision rather than a discovery.

## The Receiving End: Analogue Input Architecture

The input converts current to voltage across a sense resistor and digitises the result. Four properties of that arrangement decide behaviour, and only one of them appears in most specifications.

**Differential or single-ended.** A differential input measures the voltage between two terminals and rejects what is common to both; a single-ended input measures against a shared reference. This determines the channel's common-mode behaviour directly, and the general treatment of common-mode belongs to the instrumentation architecture article. The loop-level point is that a single-ended input places the burden of reference discipline entirely on the field wiring.

**Whether channel returns are shared.** This deserves the most attention because it produces a fault class that looks impossible. On many input modules, channel returns are commoned internally or share a return conductor. Every channel's current then flows through that shared impedance and develops a voltage across it — **so each channel's reading is influenced by every other channel's current.** The symptom is unmistakable once you know to look for it: **a measurement that moves in sympathy with a completely unrelated process variable**, because the unrelated loop's current is changing. Technicians who have not met this before will replace the innocent transmitter repeatedly.

**Range, resolution and over-range behaviour.** Whether the card reports under-range and over-range as distinct states or simply clamps at the limits determines whether the diagnostic information described in the next section survives to the control system. A card that clamps at 4 mA destroys the distinction between "0% of range" and "transmitter reporting a fault".

**Scan rate and filtering.** A channel averaged over a long window hides transients, so an intermittent contact appears as a slow droop rather than a step. A channel sampled quickly with no filtering shows electrical noise that the process does not contain. Both are configuration decisions, both change what a diagnostician can see, and neither is usually recorded.

**Distributed I/O adds one more element.** When the input sits in a remote node, the loop's reference relationship is with that node, not with the control room, and the node's own supply and earthing arrangement become part of the loop's architecture. A loop that satisfies the single-reference rule with respect to the control room may not satisfy it with respect to the node.

## The Current Value Is Evidence

The most under-used diagnostic in instrumentation is the number itself. A 4–20 mA loop signals its own health, provided the receiving chain preserves the distinction.

| Observed current | Candidate mechanisms | Discriminating test |
| --- | --- | --- |
| **Zero** | Open circuit, no loop supply, reversed polarity, passive-into-passive | Measure loop voltage at the field terminals; substitute a known source at the marshalling rack |
| **Below the measuring range** | Transmitter deliberately signalling a fault (fail-low convention) | Read the device diagnostics digitally; the transmitter knows why |
| **Above the measuring range** | Transmitter signalling a fault (fail-high), or sensor over-range | Same — the device distinguishes the two |
| **At the bottom of the measuring range** | A genuine 0% reading | Compare with an independent indication of the process |
| **Stable but implausible and constant** | Multi-drop parking, mis-scaled device, saturated or blocked sensor | Read the configuration; check the impulse line or sensor |
| **Reads low, stable, survives recalibration** | Second reference draining part of the loop current | Compare a series measurement at the field end with the card's reported value |
| **Moves with an unrelated process variable** | Shared return conductor on the input module; cross-talk | Correlate with the other loop's current; check the module's return architecture |
| **Drifts with temperature, weather or time of day** | Insulation leakage, condensation path, thermal effect at a joint | Insulation resistance over a period; provoke the environmental condition |
| **Correct value, no digital communication** | Loop resistance too low, excessive capacitance, non-transparent device in path | Measure loop resistance; check what the path contains |

**The distinction that matters most and is destroyed most often is between zero and fail-low.** Zero current means the circuit is broken or unpowered — a wiring problem the transmitter cannot report because it is not participating. A current deliberately below the measuring range means the transmitter is alive, is communicating, and is telling you it has a problem. **Conventions such as NAMUR NE 43 exist precisely to make that distinction machine-readable**, and a plant that configures its inputs to clamp, or maps both conditions to the same alarm, has thrown away the most useful thing the loop can say.

**One consequence for design:** the fail direction is a configuration choice with a process consequence. A transmitter configured to fail high on a loop that drives a control valve produces a different plant response from one configured to fail low, and that decision belongs with the process engineer, not with whoever last replaced the device.

## Intermittent Faults: Discriminating by Provocation

Intermittent loop faults are not diagnosed by inspection; they are diagnosed by recording and by provocation. The general evidence-based method is set out in the troubleshooting articles; what follows is specific to the loop.

**Record the current, do not read it.** An instantaneous reading tells you the loop is fine right now, which is exactly what everyone already knew. A continuous recording — a data-logging meter in series, a clamp-type recorder, or the control system's own historian at an adequate scan rate — converts an intermittent event into a waveform with a shape and a timestamp. The shape alone is often diagnostic: a step to zero is an open circuit; a droop is a resistance rising; a spike is coupling.

**Provoke with discrimination.** Each provocation isolates a different location, which is what makes this method fast:

- **Flex the cable at the gland and at each termination**: a fault that follows the flexing is mechanical, at that point.
- **Tap or gently vibrate the transmitter**: a fault that follows is inside the device or at its terminal block.
- **Warm or cool the field enclosure**: a fault that follows temperature is a leakage or condensation path, or a thermal joint.
- **Operate the suspected aggressor**: a fault that follows a drive or a contactor is coupling, and belongs to the segregation and shield discussion rather than to the loop.
- **Wet the enclosure**, where safe and appropriate: an insulation path that only exists when damp will not be found on a dry afternoon.

**Half-split with disconnect links.** Substitute a known, stable current source at the marshalling rack in place of the field wiring. If the fault disappears, it is field-side. If it persists, it is in the system side — the input module, the configuration, or the scaling. This one test partitions the problem in five minutes and is why disconnect links are worth specifying, as described in the instrumentation architecture article.

**Measure insulation resistance over a period, not as a spot value.** A single measurement in dry conditions proves very little about a loop that misbehaves after rain. The useful evidence is the trend and the correlation with conditions.

**Read the transmitter's own diagnostic history digitally** where the device supports it. Device-side events are timestamped by the device and may show a sensor fault, a supply excursion or a self-test failure that occurred while nobody was looking at the loop.

**And resist sequential replacement.** Replacing the transmitter, then the cable, then the card is a strategy that succeeds eventually, teaches nothing, and cannot distinguish a fix from a coincidence — particularly with an intermittent fault, whose absence for a week is not evidence.

## Commissioning the Chain

- **Confirm the active/passive arrangement from the terminal diagrams** of every device in the loop before anything is energised.
- **Verify the reference point** and confirm there is exactly one, including any surge device, indicator or barrier earth.
- **Measure the total loop resistance** and check it against both the maximum permitted by the compliance budget and, where HART is used, the minimum required for communication.
- **Confirm the digital path** by communicating with the field device from the system end, not only at the transmitter.
- **Verify the fail direction** and confirm that the input reports under-range and over-range as distinct states rather than clamping.
- **Check for shared returns** on the input module and, where present, verify cross-channel behaviour by exercising one loop and watching its neighbours.
- **Prove the whole chain in engineering units** at several points across the range, including the extremes, and confirm the sign.
- **Record loop resistance, insulation resistance and the measured current at each test point** as a commissioning baseline. Every future diagnosis compares against these numbers, and if they do not exist the comparison is against memory.

## Failure Modes

**Passive transmitter into passive input.** Zero current, nothing broken, and a sequence of unnecessary replacements.

**Active output into active input.** Two sources in series; readings pegged or nonsensical, and possible damage — usually arrived at by assuming a four-wire device is an active source, or by trusting vendor vocabulary instead of the terminal diagram.

**Second reference on the loop.** A stable low reading that survives recalibration, because part of the current bypasses the sense resistor — and each recalibration preserves the defect while removing the symptom.

**Zero references on the loop.** Undefined common-mode; readings valid until they suddenly are not.

**Isolator retrofitted without re-checking the active/passive matrix.** A loop that worked yesterday reads full scale today.

**Barrier's earthing requirement not recognised as the loop's reference decision.** Two references, established by the safety device.

**Receivers daisy-chained in series instead of split.** Stacked burden, shared fate, and one reference problem per device.

**Two systems connected to the same loop as sources.** Not a shared measurement.

**Series device with an open-circuit failure mode added for convenience.** A local display that can take out the measurement.

**Loop resistance minimised, then HART expected to work.** The digital signal has nothing to develop across — as does adding a filter capacitor across the input, or leaving a non-transparent device in the path.

**Device left in multi-drop mode.** A stable, plausible, constant reading that is not a measurement.

**HART devices installed and their diagnostics never read.** Paid for, not used.

**Shared-return input module with cross-talk.** A measurement that tracks an unrelated process; the innocent transmitter gets replaced.

**Input configured to clamp at range limits.** The distinction between 0% and a device fault is destroyed before it reaches the control system.

**Intermittent fault chased by sequential replacement.** Eventually successful, never explained, and indistinguishable from coincidence.

**Loop diagram not updated after modification.** The architecture exists only in the drawing, and the drawing is wrong.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A level transmitter reads consistently low by a small but operationally significant margin. The instrument is recalibrated; the reading is correct for a while and then drifts low again. During the same period, a pressure measurement on an adjacent channel of the same input module is observed to move slightly whenever the level in the first vessel changes — a correlation nobody can explain, since the two processes are unconnected.

```text
Symptom:
One 4-20 mA loop reads persistently low and returns to reading low after
recalibration; a second loop on the same input module tracks the first loop's
process variable despite no process connection between them.

Evidence:
- a series measurement of the current at the field terminals of the level
  transmitter reads higher than the value the input module reports
- the discrepancy is proportional: larger at 20 mA than at 4 mA
- the level transmitter is a two-wire device whose sensor circuit is not
  isolated from its housing, and the housing is clamped to earthed process
  pipework at the vessel
- the input module's common is bonded to the cabinet reference
- the loop therefore has two connections to the reference system
- the input module's channel returns share a common internal node
- the second loop's apparent variation is small and correlates with the
  first loop's current, not with its own process
- insulation resistance of the field cable is good; the cable is not
  implicated
- both recalibrations adjusted the transmitter upward

Reasoning:
One root cause with two visible effects. The loop has two references — the
non-isolated transmitter earthed at the vessel, and the input module's common
bonded in the cabinet — so the reference system is in parallel with the loop's
return conductor. A share of the loop current therefore returns through the
earthing path and never passes through the module's sense resistor. The module
measures less current than the transmitter is producing, so the reading is low;
and because the diverted share is proportional to the loop current, the error
scales with the measurement, which is exactly what the field comparison shows.

Recalibration removed the symptom without touching the mechanism. Each
adjustment made the transmitter produce more current so that the reduced share
arriving at the module read correctly — which also increased the current
flowing through the earth path, and left the loop one step further from its
design condition.

The second effect follows from the input module's architecture. The current
returning through the reference path re-enters the module at its common, which
is shared with the neighbouring channel's return. The shared impedance turns
that current into a small voltage that offsets the neighbour's reading, so the
pressure channel appears to follow the level process. The pressure transmitter
is entirely healthy.

Next investigations:
- compare series-measured current against reported current on every loop in
  this module to find any others with a diverted return
- identify every connection between each loop and the reference system,
  including transmitter housings, surge devices, indicators and shield bars
- confirm the input module's return architecture from its documentation
- evaluate restoring a single reference per loop, either by isolating the
  transmitter's sensor circuit from its housing or by fitting a loop isolator,
  and re-check the active/passive arrangement afterwards
- reverse the compensating calibration adjustments once the reference is
  corrected, and re-establish a calibration baseline
```

**Two transferable lessons.** First, **a second reference on a current loop produces a reading error, not necessarily noise** — which is why it survives every check that looks for instability and why recalibration appears to work. Second, **the discriminating evidence was a comparison, not a measurement**: the current at the field end and the current reported by the card should be identical, and the fact that they were not is a complete diagnosis of a whole class of faults, obtainable in ten minutes with one meter.

## Recommended Practice

- Establish the active/passive arrangement of every device from terminal diagrams before energising, and never from vendor vocabulary alone.
- Remember that a four-wire transmitter may have a passive output, and confirm which it has.
- Design every loop with exactly one connection to the reference system, document where it is, and audit for accidental additions.
- When a reading is persistently low and recalibration keeps being needed, compare the current measured in series at the field end against the value the input reports before adjusting anything.
- Treat any change to the devices in a loop as an architectural change and re-check the active side, the reference point and the compliance budget together.
- Expect a retrofitted isolator to change which side of the loop is active, and verify the system input's arrangement before installing it.
- Recognise that a zener barrier's earthing requirement is a decision about the loop's reference; a galvanic isolator removes that constraint.
- Split signals to multiple receivers rather than daisy-chaining them in series.
- Before adding any series device, check its failure mode — an open-circuit failure converts a device fault into a lost measurement.
- Where HART is used, design the loop resistance against both the compliance maximum and the communication minimum, and confirm every device in the path is transparent to the digital signal.
- Never add filter capacitance across an input on a HART loop without checking the effect on communication.
- Verify device configuration on commissioning, specifically that no device is left in multi-drop mode.
- Decide whether the plant will use HART diagnostics; if it will not, record that as a decision.
- Check whether the input module shares channel returns, and when a measurement tracks an unrelated process variable, suspect the module before the transmitter.
- Configure inputs to report under-range and over-range as distinct states, and preserve the difference between a broken loop and a transmitter reporting a fault.
- Set the fail direction as a process decision, not a device default.
- Diagnose intermittents by recording and by discriminating provocation, and half-split with a substituted source before replacing anything.
- Record loop resistance, insulation resistance and measured currents at commissioning as a baseline, and keep the loop diagram current through every modification — a loop's architecture is invisible in the field and lives only in the drawing.
- Recalibrate against evidence rather than against a schedule alone: a transmitter needing a persistent correction in the same direction is describing the loop, not itself.
- Inspect field enclosures for moisture as a loop-integrity activity, and read stored device diagnostics periodically where HART devices exist — an unretrieved fault history is evidence that expires.

## Conclusion

The 4–20 mA loop earns its longevity honestly: a current that is immune to voltage drop, a two-wire device that powers itself, a fault indication built into the signal range, and a digital layer that shares the pair without disturbing the analogue value. None of that is accidental, and all of it still works.

What the standard does not do is design the circuit. It does not decide who supplies the energy, where the reference lives, what else shares the series path, whether the digital layer survives the journey, or how the receiving end measures. Those are engineering decisions, they are made once and then inherited by everyone who touches the loop afterwards, and they are invisible in the field — a loop with two references and a loop with one look identical on the cable tray.

The practical consequence is that most advanced loop diagnosis is architectural archaeology: establishing what the circuit actually is, rather than what the drawing says it is. A plant that documents the active side, the reference point and the series contents of each loop — and that re-checks all three whenever a device changes — spends its time on measurement problems instead. Everyone else spends it replacing healthy transmitters.
