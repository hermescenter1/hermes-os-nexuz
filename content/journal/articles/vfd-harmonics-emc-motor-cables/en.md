# VFD Harmonics, EMC and Motor Cable Engineering

## Executive Summary

Two entirely different physical problems get filed under "drive noise", and conflating them is why mitigation so often misses.

**On the input side** the drive's rectifier draws current in pulses rather than sinusoids. That is a low-frequency power-quality problem measured in harmonic orders of the supply frequency, and its consequences are heating, resonance and interference with other equipment on the same supply.

**On the output side** the inverter switches fast, producing steep voltage edges and a high-frequency current that must return to its source. That is an electromagnetic compatibility problem measured in nanoseconds and megahertz, and its consequences are motor insulation stress, bearing damage and disturbance of nearby signal circuits.

Different mechanisms, different mitigations, different measurements. This article treats them separately and deliberately avoids quoting numerical limits, because those depend on the installation, the standard being applied and the point of common coupling — all of which have to be established for the specific site rather than borrowed.

## The Input Side: Where Harmonic Current Comes From

A conventional drive rectifies the supply into a DC link held up by capacitance. Current flows only while the supply voltage exceeds the DC-link voltage, so instead of a sinusoid the drive draws short, high peaks near the voltage crests. Decomposed into a Fourier series, that pulsed waveform contains the fundamental plus a characteristic set of higher orders.

**The single most important distinction in this field:**

- **Harmonic current is a property of the load.** The drive draws it regardless of what it is connected to.
- **Harmonic voltage distortion is a property of the installation.** It is the harmonic current flowing through the source impedance. The same drive on a strong supply produces less voltage distortion than on a weak one.

**This is why a drive's current-distortion figure alone cannot answer the question "will this cause a problem here".** The answer depends on the supply's impedance, on how much other distorting load exists, and on what else is connected. It is a system calculation.

**A second trap worth naming: distortion expressed as a percentage of the actual current can be misleading at part load.** A lightly loaded drive can show a high percentage distortion while its absolute harmonic current is small and harmless. Comparing percentages measured at different loading levels compares nothing. Where a judgement matters, work with harmonic current magnitudes and with the resulting voltage distortion.

## What Harmonics Actually Do

The consequences are mechanical and thermal rather than abstract:

| Effect | Mechanism |
| --- | --- |
| Transformer heating | Additional losses from harmonic currents; eddy-current losses rise strongly with frequency |
| Cable heating | Higher r.m.s. current for the same useful power, plus skin effect at higher orders |
| Capacitor stress | Capacitor impedance falls with frequency, so harmonic voltage drives disproportionate harmonic current into capacitors |
| Resonance | Interaction between system inductance and installed capacitance, amplifying one order |
| Nuisance operation | Protection and metering behaving unexpectedly on distorted waveforms |
| Motor heating | Where motors are fed from a distorted supply directly, not through a drive |

**Resonance deserves emphasis because it is the mechanism that turns an acceptable situation into a damaging one, and because the usual trigger is an action taken to improve things.**

Power factor correction capacitors form a parallel resonant circuit with the supply transformer's inductance. That circuit has a resonant frequency determined by the capacitance and the source inductance. If it falls near a harmonic order the installation actually produces, the loop impedance at that order becomes large and the harmonic voltage — and the current circulating between capacitor and supply — is amplified far beyond what the drive itself injects.

**The practical consequences are recognisable:** capacitor fuses operating without obvious cause, capacitors failing or bulging, transformer heating and noise, and distortion that got *worse* after capacitors were added or after a step of the bank switched in.

The engineering response is not to remove power factor correction but to detune it: adding a reactor in series with each capacitor step shifts the resonant frequency below the lowest significant harmonic order, so the circuit cannot resonate at an order that is present. Any installation combining significant capacitance with significant harmonic-producing load needs that consideration explicitly.

## Input-Side Mitigation, in Order of Escalation

Mitigation should be chosen for where the problem is — one drive, one switchboard, or the whole installation.

- **Line reactor or DC-link choke.** Adds impedance in series with the rectifier, which lengthens and lowers the current pulse and reduces harmonic content. It is inexpensive, physically small, and also protects the drive from supply transients. The trade-off is a small voltage drop and additional losses. Where nothing else is specified, this is usually the first thing that should have been.
- **Multi-pulse arrangements.** Feeding two rectifier sections through a phase-shifting transformer cancels certain harmonic orders by opposition. Effective and well understood; the cost is a transformer, physical space, and sensitivity to supply unbalance, which degrades the cancellation.
- **Passive tuned filters.** A series L-C branch tuned near a specific order presents a low impedance to it. Effective at that order, and an active participant in the system: a tuned filter can attract harmonic current from other loads on the same bus, and its behaviour changes as plant capacitance and load change. It belongs to a study, not to a catalogue selection.
- **Active harmonic filter or active front end.** Either injects a compensating current or draws near-sinusoidal current at the drive itself. The most flexible and the most expensive; the active front end additionally allows regeneration, which may be the actual reason for choosing it.

**Choose the level that matches the problem.** A single problematic drive does not justify an installation-wide filter, and an installation-wide distortion problem is not solved by a reactor on one machine.

## The Output Side: Steep Edges and Current That Must Return

The inverter produces the motor voltage by switching rapidly between DC-link rails. The result is a series of steep-edged pulses, and two distinct phenomena follow.

### Reflected waves and motor insulation

A motor cable is a transmission line with its own surge impedance. The motor presents a much higher impedance. When a fast-rising pulse reaches that mismatch it reflects, and the reflected wave superimposes on the incoming one, so **the voltage at the motor terminals can substantially exceed the drive's output voltage.**

Two variables govern severity:

- **Rise time.** Faster switching edges make the effect worse and make it appear at shorter cable lengths.
- **Cable length.** Beyond a length related to the rise time and propagation velocity, the reflection arrives while the edge is still rising and the overshoot approaches its maximum.

The stress falls on the first turns of the motor winding, and the failure mode is progressive insulation degradation followed by a winding fault that looks, from the outside, like a motor quality problem.

**Mitigations, from cheapest:** keep the cable short; use a motor rated for inverter supply; fit a dv/dt reactor to slow the edge; fit a sine filter to reconstruct a near-sinusoidal output where cable runs are long or motors are ordinary. Manufacturers state a maximum cable length with and without filters — that figure is the design constraint and must be taken from the equipment rather than assumed.

### Common-mode current and where it returns

The switching also produces a common-mode voltage — a shift of the whole three-phase set relative to earth. Because there is capacitance from windings and cable to earth, that voltage drives a high-frequency current into earth. **That current will return to the drive by some path; the design decides which one.**

If the design provides a low-impedance path — a symmetrical shielded motor cable, bonded 360° at both ends — the current returns along the cable shield, close to the conductors that produced it, and the loop area is small.

If it does not, the current finds another route: through the motor bearings, through the machine frame and structural steel, through the earth conductors of other equipment, or through the screens of signal and network cables that happen to share a route. Each of those is a symptom people spend weeks diagnosing.

**This is why shield termination is not cosmetic.** A shield connected by a short "pigtail" tail at one end is an inductor at these frequencies and does not provide the return path. A 360° bond at both the drive and the motor is the mechanism, and it is one of the very few EMC measures that must be done at both ends rather than one.

## Bearing Currents

Bearing damage from drive-fed motors has two principal mechanisms, and they call for different mitigations.

**Discharge currents.** The common-mode voltage appears across the lubricant film between the rolling elements and the raceway. While the film insulates, voltage builds; when it breaks down, a small discharge occurs. Repeated millions of times, the discharges erode the raceway, producing the characteristic fluted pattern and, eventually, failure.

**Circulating currents.** In larger machines, high-frequency flux asymmetry induces a voltage along the shaft, driving current in a loop through shaft, bearings and frame. This mechanism grows with frame size.

**Mitigations, selected by mechanism:**

- An insulated bearing — conventionally at the non-drive end — interrupts the circulating loop.
- A shaft grounding brush or ring provides a low-impedance path that bypasses the bearing.
- A common-mode core or a sine filter reduces the source of the problem rather than diverting it.
- Correct shielded cable and 360° bonding reduces the current available to cause damage.

**The diagnostic signature is worth recognising:** motors that fail at a repeatable interval, with bearing damage rather than winding damage, on drive-fed applications — particularly where the motor cable is unshielded or the shield is pigtailed. That pattern is a design finding, not a lubrication or supplier problem, and replacing the bearings on the same interval forever is the expensive alternative to fixing it.

## Cabling, Routing and High-Frequency Earthing

- **Use the cable type the drive manufacturer specifies**, and use it for its whole length. A shielded cable that becomes unshielded for the last few metres inside a machine has an unshielded section exactly where the coupling matters.
- **Symmetrical construction matters.** Cables with symmetrically arranged protective conductors keep the current distribution balanced and reduce the net external field.
- **Segregate motor cables from signal, instrument and network cables.** The motor cable is the noisiest cable in the plant. Separate ducts, separate trays, and where crossing is unavoidable, cross at right angles.
- **High-frequency earthing is not the same as protective earthing.** A long, thin protective conductor is perfectly adequate for fault protection and useless at megahertz, because its inductance dominates. High-frequency bonding needs short, wide, low-inductance connections to a common metallic structure — mounting plates bonded to the enclosure, unpainted contact surfaces, bonded cable trays.
- **Earth leakage.** EMC filters conduct a continuous leakage current to earth by design. That has consequences for residual-current protection selection and for earth conductor sizing, and it is a common cause of unexplained tripping when drives are added to circuits protected by devices chosen for a different load type.

## Commissioning and Measurement

**Measure before, not only after.** A baseline of voltage distortion and current waveform taken before drives are installed — or before more are added — converts a later argument into an analysis. This is the same discipline as baselining network counters, and it is skipped for the same reason.

What is worth measuring, and what each measurement answers:

| Measurement | Question it answers |
| --- | --- |
| Input current waveform and harmonic spectrum, at rated load | What is the drive actually drawing? |
| Voltage distortion at the point of common coupling | What does the installation experience, and what do other loads see? |
| Distortion with and without capacitor steps in service | Is there a resonance, and which order? |
| Transformer and cable temperature under load | Is harmonic heating significant in practice? |
| Motor terminal voltage, with instrumentation rated for the rise times | Is the reflected-wave overshoot within what the motor can take? |
| Bond and shield continuity, both ends | Does the common-mode current have its intended path? |
| Earth leakage current | Is the protective device selection compatible? |

**Two cautions.** Harmonic measurement is load-dependent, so a measurement at low load says little about the condition that matters. And measurements at these frequencies require appropriate instrumentation and, where they involve energised equipment, qualified personnel working under the site's procedures.

## Troubleshooting by Mechanism

| Symptom | Likely mechanism | Domain |
| --- | --- | --- |
| Capacitor fuses operating, capacitors failing | Resonance amplifying one harmonic order | Input side |
| Distortion worsened after adding capacitors | Resonance introduced by the added capacitance | Input side |
| Transformer running hot with normal r.m.s. load | Harmonic losses | Input side |
| Repeated bearing failures at a similar interval | Common-mode discharge or circulating current | Output side |
| Motor winding failures on long cable runs | Reflected-wave overvoltage | Output side |
| Instrument or network faults that appear when a drive runs | Common-mode current on an unintended return path | Output side |
| Residual-current device tripping when drives start | EMC filter leakage current | Installation |
| Audible motor noise changing with switching frequency | PWM harmonics in the motor | Output side |

**The reasoning pattern: symptoms on the supply side of the drive point to low-frequency harmonics; symptoms at the motor, the bearings or nearby signal circuits point to high-frequency common-mode and dv/dt.** Establishing which side a symptom belongs to eliminates half the possible causes before any measurement.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A petrochemical site converts several large pumps to variable speed to improve control and reduce energy consumption. The drives are correctly sized and each is fitted with a line reactor. Commissioning is uneventful and the energy savings are realised.

Four months later, the site begins losing capacitor fuses in the power factor correction bank on the same switchboard. Two capacitor cans are replaced. The transformer feeding the board is reported as running hotter and noisier than before, though within its rating.

The evidence assembles cleanly once the right measurement is taken. Voltage distortion at the switchboard is measured with the capacitor bank in and out of service. **With the bank switched out, distortion is modest and consistent with the drives' harmonic current and the supply impedance. With the bank in service, distortion at one particular harmonic order rises sharply.** That is the signature of a parallel resonance: the bank's capacitance and the transformer's inductance resonate near an order that the drives actually produce, and the resulting circulating current flows between the capacitors and the supply.

Nothing is faulty. The drives produce the harmonic current they were always going to produce; the capacitor bank has been in service for years and was entirely appropriate before there were harmonic sources on that board. **The two were correct individually and incompatible together, and nobody re-examined the capacitor bank when the drives were added.**

The remediation is to detune the bank — adding reactors in series with each capacitor step so the resonant frequency sits below the lowest significant order — after a study that establishes the orders present, the bank's steps and the source impedance. Replacing capacitors on the existing arrangement would have continued indefinitely.

**The transferable point is the one that recurs whenever an installation changes: adding a harmonic-producing load changes the electrical environment of every other piece of equipment on that board, and the capacitor bank is the component most likely to discover that first.**

## Recommended Practice

- Separate the two problems explicitly: low-frequency harmonics on the input, high-frequency EMC on the output. Diagnose and mitigate them independently.
- Treat current distortion as the drive's property and voltage distortion as the installation's; evaluate against the actual source impedance.
- Compare harmonic current magnitudes, not percentages measured at different loading levels.
- Examine every installation that combines power factor capacitors with harmonic-producing load for resonance, and detune where indicated.
- Fit line reactors or DC chokes as the default first measure; escalate to multi-pulse, passive or active solutions on the basis of a study.
- Match the mitigation level to the problem level — one drive, one board, or the installation.
- Take a power-quality baseline before drives are installed and before any expansion.
- Check cable length against the manufacturer's stated maximum; specify inverter-duty motors, dv/dt reactors or sine filters where it is approached or exceeded.
- Use the specified symmetrical shielded cable for the full run, bonded 360° at both drive and motor.
- Provide short, wide, low-inductance high-frequency bonding; do not rely on the protective conductor for EMC.
- Address bearing currents by mechanism: insulated bearing for circulating current, shaft grounding for discharge, filters to reduce the source.
- Segregate motor cables from signal and network routes; cross at right angles where unavoidable.
- Account for EMC filter leakage current when selecting residual-current protection and sizing earth conductors.
- Measure at realistic load, with appropriate instrumentation, by qualified personnel.

## Conclusion

Drives are not badly behaved; they behave exactly as their electronics require, and the installation either accommodates that or discovers it. The accommodation splits cleanly along a frequency boundary: below it, the question is how much harmonic current flows into what impedance and whether anything in the installation resonates with it. Above it, the question is how steep the edges are and whether the high-frequency current has a defined path home.

Almost every expensive surprise in this field comes from treating one of those two questions as though it were the other — fitting an input filter to cure bearing failures, or blaming motor quality for a reflected-wave problem, or adding capacitors to an installation that has just acquired harmonic sources. Get the split right and the mitigations are ordinary engineering: a reactor, a detuned bank, the specified cable, and a shield terminated properly at both ends.
