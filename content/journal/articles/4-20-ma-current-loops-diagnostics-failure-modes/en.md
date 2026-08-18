# 4–20 mA Current Loops: Diagnostics and Failure Modes

## Executive Summary

The 4–20 mA current loop has outlived several generations of replacement technology for one reason: it is diagnosable. Current is constant everywhere in a series loop, so a single meter reading anywhere along it is a statement about the whole loop. A live zero at 4 mA distinguishes "the process is at minimum" from "the loop is broken". And the loop carries its own power, so the same two conductors that deliver the measurement also prove the transmitter is alive.

This article is about extracting that diagnostic value systematically rather than by trial and error — and about the two failure modes the loop cannot reveal on its own.

## Why the Loop Is Built This Way

Three properties, each a deliberate design choice:

**Current, not voltage.** Voltage drops along a cable; current does not. A 4–20 mA signal is immune to conductor resistance up to the point where the loop supply can no longer drive the required voltage. On a several-hundred-metre run in a plant, that immunity is the whole point.

**Live zero.** The bottom of the range is 4 mA, not 0 mA. Zero current is therefore not a valid measurement — it is unambiguously a fault. A 0–20 mA scheme cannot distinguish a broken wire from a genuine minimum reading, and that single difference is why 4–20 mA became the standard.

**Two-wire loop power.** The transmitter draws its supply from the same loop it modulates, which is why its quiescent draw must stay below 4 mA. This constrains transmitter design but eliminates a separate power cable to every field device.

## The Loop Budget

Every loop has a voltage budget, and the majority of "the transmitter reads low at the top of the range" complaints are budget failures rather than instrument failures.

The supply must cover, at the maximum current of 20 mA:

- the transmitter's minimum operating voltage
- plus the voltage across every series load — the receiver's sense resistor, any indicator, any barrier or isolator
- plus the cable resistance drop, both conductors

Cable drop is straightforward and routinely forgotten:

```text
V_cable = I × R_loop
        = 0.020 A × (2 × length × resistance per metre)
```

The consequence of an inadequate budget is characteristic and easy to misread: the loop tracks correctly across most of the range and then flattens near the top, because the transmitter can no longer sustain 20 mA at the available voltage. It looks exactly like a transmitter span problem, and it is not.

Every series element added later — a panel indicator, a signal splitter, an isolator retrofitted for an earthing problem — consumes budget that was allocated at design time. Adding one without recalculating is a common way to break a loop that worked for years.

## Diagnostic Method

The productive approach treats the loop as a series circuit with known properties and narrows by measurement, not by substitution.

### Symptom: reading is wrong or absent

**Step 1 — measure the loop current.** Not the value on the HMI; the current itself, with the meter in series or with a clamp designed for milliamp DC. The reading immediately partitions the problem:

| Measured current | Interpretation |
| --- | --- |
| 0 mA | Open circuit, dead supply, or failed transmitter |
| Below 3.6 mA | Downscale drive — many transmitters signal internal fault this way |
| 3.6–4 mA | At or under range — check process against transmitter zero |
| 4–20 mA, steady | Loop is healthy; the problem is scaling, configuration or the process |
| Above 21 mA | Upscale drive, or a short across part of the loop |
| Fluctuating | Noise, intermittent connection, or a genuinely unstable process |

Note the distinction in the last row: a fluctuating current is not automatically a fault. Confirming whether the process itself is unstable is step zero, and it is skipped surprisingly often.

**Step 2 — if the current is right but the displayed value is wrong, the fault is above the loop.** Scaling in the input module, engineering-unit conversion, or the display configuration. Measuring the current first is what makes this a two-minute conclusion instead of a field trip.

**Step 3 — if the current is wrong, halve the loop.** Break it at a junction box roughly in the middle and measure from each side. A loop is a series circuit; each measurement eliminates half the remaining candidates. This is faster than working outward from either end and far faster than replacing components in sequence.

**Step 4 — check the supply under load.** A loop supply that reads correctly with no load and sags under 20 mA is a failing supply. Measuring it unloaded proves nothing.

### Symptom: reading drifts slowly over weeks

Drift has a small number of causes and they are distinguishable:

- **Moisture ingress.** The classic signature is drift correlated with weather, and a leakage path to earth that shows up as a resistance measurement between conductor and earth well below the megohm range. Junction boxes and cable glands are where to look.
- **Sensor process effects** — coating, plugged impulse lines, deposit on a probe. The tell is that the loop electrical checks are clean while the reading disagrees with an independent measurement of the same process variable.
- **Genuine electronic drift** in the transmitter, which is real but slower and rarer than either of the above, and is what calibration intervals exist to bound.

The diagnostic discipline: prove the electrical path is clean before touching calibration. Recalibrating a transmitter to compensate for a moisture path produces a loop that is now wrong in two ways and will drift again as soon as the weather changes.

### Symptom: intermittent, correlated with plant activity

Intermittent faults that appear when a nearby motor starts, a crane passes, or a welder is used are almost always installation faults rather than instrument faults. The candidates:

- **Instrument cable routed with power cable**, picking up interference through capacitive or inductive coupling. Separation distance and crossing at right angles are the mitigations, and both are cheaper before the cable is pulled.
- **Shield earthed at both ends**, creating an earth loop in which circulating current injects noise into the signal. The convention that avoids this is a shield earthed at one end only — normally the control-system end — with a continuous drain wire and no accidental second earth at a gland or junction box.
- **A mechanical intermittent** — a terminal not tightened to specification, a corroded crimp, a cable flexing on a moving machine. These are found by disturbing the suspect connection while watching the current, not by looking at it.

The evidence to gather before touching anything: what else was running when the fault occurred, whether it repeats on the same trigger, and whether the disturbance appears on adjacent loops too. A disturbance on one loop is a loop problem; the same disturbance on every loop in a marshalling cabinet is an earthing or supply problem.

## Failure Modes the Loop Cannot Reveal

Two failures are invisible to loop-current diagnostics, and both matter.

**A correct signal that no longer represents the process.** A level transmitter with a blocked impulse line reports a steady, plausible, perfectly stable value. Electrically, the loop is flawless. Nothing in the current says the measurement stopped tracking reality. The only defences are cross-checks against an independent measurement, plausibility limits on rate of change, and the observation — which operators make and instruments do not — that a value has been *too* steady.

**A transmitter that is correctly calibrated to the wrong reference.** If the zero was set against an incorrect assumption about installation height, fluid density or mounting, the loop is internally consistent and externally wrong. This is a commissioning defect and it is caught only by validating against a known process condition, not by any electrical test.

Digital protocols on the same wiring — HART, or fully digital fieldbuses — address part of this by carrying transmitter self-diagnostics alongside the primary value. That information genuinely helps, but it does not close either gap: a transmitter cannot report that its impulse line is blocked, and it cannot know that its reference is wrong.

## Commissioning Considerations

- **Record the as-commissioned loop resistance and supply voltage.** Three years later, that baseline is what makes it possible to say whether something changed.
- **Verify at the extremes, not just at mid-range.** A budget failure only shows near 20 mA.
- **Check the shield earthing physically**, at both ends, rather than trusting the drawing. Second earths are created during installation, not during design.
- **Validate against a known process condition** at least once, so the loop is proven end to end rather than only electrically.

## Safety Considerations

Loops that form part of a safety instrumented function are governed by the functional-safety standards for the sector, and their fault behaviour is part of what was assessed — including whether the transmitter drives upscale or downscale on internal fault, and whether the receiving logic treats out-of-range values as a fault or clamps them to range. Clamping an out-of-range signal to 4 mA in the input configuration silently discards exactly the diagnostic the live zero exists to provide.

All work on loops associated with energised equipment follows the plant's electrical safety rules and isolation procedures. Intrinsically safe loops in hazardous areas carry additional constraints: the certified entity parameters of the barrier, cable and field device are part of the safety case, and substituting any of them — including adding a series element that seemed electrically harmless — invalidates it.

## Recommended Engineering Practice

- Calculate the voltage budget at 20 mA, including cable, and recalculate whenever a series element is added.
- Measure current before forming any hypothesis; it partitions the problem in one reading.
- Halve the loop rather than replacing components in sequence.
- Prove the electrical path clean before recalibrating.
- Earth the shield at one end only, and verify it physically.
- Configure the input to treat out-of-range as a fault, not to clamp it.
- Cross-check critical measurements against an independent source — the loop cannot detect a plugged impulse line.

## Conclusion

The current loop is a diagnostic instrument as much as a signalling scheme. Its properties — constant current, live zero, self-powered transmitter — were chosen so that a competent engineer with a meter can partition a fault in one measurement and localise it in a handful more.

What defeats that design is not its age but method: replacing components in sequence instead of narrowing by measurement, recalibrating before proving the electrical path, and trusting a stable reading that has stopped being a measurement. The loop will tell you almost everything. It is worth knowing precisely which two things it will not.
