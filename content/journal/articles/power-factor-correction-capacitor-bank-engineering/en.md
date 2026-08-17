# Power Factor Correction and Capacitor Bank Engineering

## Executive Summary

A capacitor bank does one thing: it supplies reactive power locally so that the supply does not have to. That is genuinely valuable — it reduces current for the same real power, relieves cable and transformer capacity, reduces losses and voltage drop, and in many tariffs it reduces the bill.

**It does not reduce harmonic distortion.** A capacitor bank is not a filter, and on a network with significant distorting load it is the component most likely to be damaged by the distortion, and the component most likely to make the distortion worse through resonance.

Those two paragraphs contain most of what goes wrong in this field. The rest of this article is about the engineering that separates a bank that quietly saves money for twenty years from one that fails fuses, bulges cans and makes the network noisier than before it was installed.

**Safety note.** Capacitors store energy and remain hazardous after disconnection. Work requires isolation, lock-off, the manufacturer's stated discharge time, verification of absence of voltage at the terminals, and competent personnel under the site's rules. Discharge devices can fail; verification is not optional and a discharge resistor is not a substitute for it.

## Displacement, Distortion and True Power Factor

The distinction is the foundation of every correct decision in this article.

```text
S² = P² + Q²                       apparent, active and reactive power
PF_true = P / S                    true (total) power factor, by definition
PF_true ≈ PF_displacement × PF_distortion

  P  = active power (W)          — the power that does work
  Q  = reactive power (var)      — the exchange associated with magnetising
                                   inductance, at the fundamental frequency
  S  = apparent power (VA)       — the product of r.m.s. voltage and current
  PF_displacement = cos φ        — the phase displacement between the
                                   FUNDAMENTAL voltage and current
  PF_distortion                  — the factor accounting for harmonic current

Assumptions and limits:
  - S² = P² + Q² is exact only for sinusoidal conditions; with distortion
    present, an additional distortion power term exists and this simple
    triangle no longer closes
  - cos φ describes only the fundamental; it is NOT the true power factor
    when the current is distorted
  - the product relationship above is the standard engineering decomposition,
    not an exact identity for every waveform
```

**Capacitors act only on the displacement component.** They supply fundamental-frequency reactive power and improve cos φ. They have no mechanism for improving the distortion factor.

**The practical consequence, and the single most common error in this field:** where a plant measures a poor *true* power factor that arises largely from harmonic current — a plant full of rectifier loads, for example — installing capacitors will improve cos φ, may improve very little of the measured kVA, and will expose the capacitors to the harmonic current that caused the problem.

**Establish which component is deficient before designing anything.** A measurement that reports only "power factor" without saying whether it is displacement or true is not sufficient to size a bank.

## Where to Put the Compensation

| Arrangement | Where the reactive current stops flowing | Suits |
| --- | --- | --- |
| **Individual** (at the machine) | The whole path back to the source, including the machine's own feeder | Large motors with long duty cycles |
| **Group** (at an MCC or sub-board) | Everything upstream of that board | Clusters of loads switched together |
| **Central** (at the main board) | Only upstream of the main board | Varying aggregate load, tariff-driven correction |

**Central compensation is the most common and relieves the least.** It reduces the current the transformer and utility supply see, which is usually what the tariff measures, but it does nothing for the cables and switchgear downstream of the bank.

**Individual motor compensation carries a specific hazard that must be respected.** A capacitor connected directly at a motor's terminals remains connected when the motor is disconnected while still rotating. The machine can then self-excite from the capacitor, acting as a generator, and produce voltages above nominal at its terminals — a hazard to insulation and to anyone assuming the machine is dead. The established practice is to size such capacitors conservatively in relation to the motor's magnetising requirement, following the motor manufacturer's guidance, precisely so that self-excitation cannot be sustained. **Where the machine is drive-fed, capacitors must not be connected between the drive and the motor at all.**

## Step Sizing and Controller Behaviour

An automatic bank follows a varying load by switching steps in and out.

- **The smallest step sets the resolution.** Correction can only be as fine as the smallest available step, and the residual will swing by up to that amount.
- **The number of steps sets how well the bank tracks the load**, and also how much switching hardware exists to maintain.
- **Too-fine stepping causes excessive switching**, and every switching operation is a duty cycle on a contactor and a transient on the network.
- **Too-coarse stepping causes hunting** — the controller switching a step in, overshooting, switching it out, and repeating.

**The controller needs three things configured correctly, and the third is the one that goes wrong:**

- A target, expressed as a power factor or a reactive power setpoint.
- A hysteresis band and a time delay, so that transient load changes do not cause switching.
- **A current measurement that sees the load and not the capacitors.** The measuring CT must be positioned so that it measures the total load current including the compensated load, and its polarity must be correct. A CT installed in the wrong position — measuring only part of the load, or including the bank's own current — produces a controller that behaves nonsensically: switching in at light load, refusing to switch at heavy load, or oscillating. This is among the most common commissioning defects, and it is invisible without measurement.

## Switching Duty and Stored Energy

**Capacitor switching is an unusually severe duty.** Energising a capacitor produces a high-amplitude, high-frequency inrush current whose peak greatly exceeds the steady-state current, because the capacitor initially behaves as a short circuit.

**Back-to-back switching is the worst case.** When a step is energised while other steps are already connected, the already-charged capacitors discharge into the incoming one through a very low impedance path, producing an inrush considerably higher than energising a single step from the supply alone.

The engineering responses:

- **Capacitor-duty contactors**, which incorporate pre-charging resistors and auxiliary contacts to limit the inrush. Ordinary contactors used for capacitor switching weld their contacts, and the failure is usually attributed to contactor quality.
- **Damping or detuning reactors in series with each step**, which limit inrush as a side benefit of their main purpose.
- **Static switching** where the switching rate is high enough that mechanical contacts are unsuitable.

**Stored energy is a safety matter, not a nuisance.** A disconnected capacitor holds charge. Discharge devices are fitted to bring the terminal voltage down within a specified time, and a step must not be re-energised before it has discharged — re-energising a charged capacitor produces a severe transient. For work on the bank: isolate, wait the manufacturer's stated discharge time, and then **verify absence of voltage at the terminals**. A discharge resistor is a component that can fail open, and the verification exists for exactly that case.

## Resonance: The Mechanism That Turns a Bank Into a Problem

This is the part that decides whether a bank is an asset on a modern industrial network.

**A capacitor bank and the supply inductance form a parallel resonant circuit.** At the resonant frequency, the impedance seen by a harmonic current source becomes high, and the harmonic voltage — together with the current circulating between the capacitors and the supply — is amplified well beyond what the distorting loads themselves inject.

An estimate of where that resonance sits:

```text
h_r ≈ √( S_sc / Q_c )              APPROXIMATE, FOR SCREENING ONLY

  h_r  = resonant harmonic order (dimensionless, relative to the
         fundamental frequency)
  S_sc = short-circuit level at the busbar where the bank is connected (VA)
  Q_c  = reactive power of the connected capacitance at nominal voltage (var)

Assumptions and limits:
  - treats the supply as a simple inductance and the bank as a simple
    capacitance; real networks contain other capacitance (cables, other banks)
    and other inductance, which shift the actual resonance
  - S_sc must be the value at the bank's busbar in the operating configuration
    being considered, and it CHANGES with network configuration
  - this is a screening estimate to identify risk, not a substitute for a
    harmonic study
```

**Two consequences make this more than an academic concern.**

**First, a stepped bank has a different resonant order at every step combination.** As the controller switches steps, the connected capacitance changes and the resonance moves. A plant may be entirely comfortable at most step combinations and resonant at one — which produces a fault that appears intermittently, correlates with load, and is extremely confusing until someone measures distortion with steps deliberately switched in and out.

**Second, the network's short-circuit level changes.** Running on one transformer instead of two, or on a generator, moves the resonance. A bank that is safe in the normal configuration may be resonant in the maintenance configuration.

**The recognisable symptoms of resonance** are capacitor fuses operating without obvious cause, capacitors failing or bulging, transformer heating and audible noise, and distortion that measurably worsened after the bank was installed or after a step switched in.

## Detuning Reactors: What They Do and What They Do Not Do

**A detuned bank places a reactor in series with each capacitor step**, chosen so that the series resonance of that reactor-capacitor branch sits *below* the lowest significant harmonic order present on the network.

**The effect:** above the tuning point, the branch behaves inductively rather than capacitively. Because it is no longer capacitive at the harmonic orders that exist, it cannot form a parallel resonance with the supply at those orders. The resonance risk is removed by construction rather than by hoping the network does not contain the offending order.

**Three points that are routinely missed:**

**A detuned bank is not a harmonic filter.** It is designed to protect itself and the network from resonance. It is not designed to absorb harmonic current, and specifying it as harmonic mitigation is a misdescription. A **tuned filter** — deliberately tuned *at* a harmonic order to present a low impedance and absorb it — is a different device with a different design basis, and it requires a network study because it interacts with everything else on the bus and can attract harmonic current from other loads.

**Detuning raises the voltage across the capacitor.** The reactor's voltage adds to the capacitor's at the fundamental frequency, so the capacitors in a detuned bank must be rated for a voltage above the system nominal. Fitting standard capacitors into a detuned arrangement shortens their life.

**Detuning changes the delivered reactive power** compared with the same capacitors without reactors, so the bank's rating must be calculated for the detuned arrangement rather than from the capacitor rating alone.

**When to detune:** where significant distorting load exists or is planned. On a modern industrial network with drives, rectifiers and electronic loads, detuning is the normal expectation rather than an upgrade. Where the situation is uncertain, a measurement of the existing distortion spectrum is the input to the decision.

## Capacitor Stress, Environment and Protection

**Capacitor impedance falls with frequency**, so harmonic voltage drives disproportionate harmonic current into capacitors. The result is heating additional to the fundamental current, and the failure sequence — heating, dielectric degradation, bulging, fuse operation or rupture — is characteristic.

**Overvoltage is the other primary stressor.** Capacitor life is strongly voltage-dependent, and sustained overvoltage — including the elevated voltage inherent in a detuned arrangement and the voltage rise caused by overcompensation at light load — shortens it.

**Temperature is the third.** Capacitor life falls markedly with ambient temperature, and a bank enclosure containing reactors is a heat source. Ventilation, filters and clearances are part of the design, and a blocked filter is a life-shortening defect rather than a housekeeping issue.

**Protection appropriate to a bank includes:**

- Overcurrent protection sized for the bank's current including harmonic content and inrush duty.
- **Unbalance protection** on multi-element banks, which detects the failure of individual elements before the remaining elements are overstressed and fail in cascade. This is the protection most likely to be absent and most likely to have prevented a total loss.
- Overvoltage protection, since capacitors are voltage-sensitive.
- Individual element fuses where the construction uses them.

## Overcompensation, Light Load and Generators

**Overcompensation produces a leading power factor**, and its consequences are not symmetrical with lagging operation:

- **Voltage rise** at the point of connection, which stresses capacitors and other equipment.
- **Tariff penalties in the other direction** under many commercial arrangements.
- **Fixed compensation at light load is the usual cause.** A bank sized for full production is oversized at night, on weekends and during shutdowns, and a fixed bank cannot step out.

**Generator interaction deserves an explicit design decision.** A generator's excitation control is designed to supply reactive power, not to absorb it, and a leading power factor can drive it toward instability or loss of excitation. **The established practice is that power factor correction is disconnected or explicitly controlled when the plant runs on standby generation**, and the transfer scheme should implement that rather than leaving it to an operator to remember.

**VFD-rich plants deserve a specific warning.** A drive's rectifier input typically presents a high *displacement* power factor already — there is little fundamental reactive power to correct. Where the measured *true* power factor is nevertheless poor, the deficit is distortion, and capacitors will not address it while being exposed to the harmonic current that caused it. **The correct response is a harmonic assessment, not a capacitor bank.**

## Commissioning and Maintenance

**Measure before designing:**

- Displacement power factor and true power factor separately, at the intended connection point.
- The harmonic distortion spectrum, at representative load — a light-load measurement will not represent the condition that matters.
- The short-circuit level at the busbar, in each operating configuration.
- The load profile over time, so that step sizing matches the real variation rather than the peak.

**At commissioning:**

- Verify the controller CT position and polarity by observing controller behaviour against a known load change.
- Confirm each step switches in and out and that the achieved correction matches the step rating.
- Verify discharge: measure the terminal voltage decay after disconnection against the specified time.
- **Measure distortion with steps deliberately switched in and out**, in the configurations the plant can run in. This is the practical test for resonance and it takes an hour.
- Record temperatures in the enclosure at sustained load.

**In maintenance:**

- Inspect for bulging cans, discoloration and operated fuses — a failed element in an unprotected bank is a precursor to a cascade.
- Verify discharge devices, which fail silently.
- Keep ventilation paths and filters clear.
- Check contactor contacts, which carry an unusually severe duty.
- **Re-assess the bank whenever distorting load is added**, because the network the bank was designed for no longer exists.

## Failure Modes

**Bank installed to correct a distortion-driven true power factor.** No tariff improvement, and capacitors stressed by the harmonic current.

**Undetuned bank on a network with significant distortion.** Resonance, fuse operation, capacitor failure, worsened distortion.

**Detuned bank fitted with standard-voltage capacitors.** Shortened life from the elevated capacitor voltage.

**Detuned bank specified as harmonic mitigation.** It protects against resonance; it does not absorb harmonics.

**Controller CT wrongly positioned or reversed.** The bank switches nonsensically and nobody notices until the bill or the failures arrive.

**Ordinary contactors used for capacitor switching.** Welded contacts, attributed to contactor quality.

**Step re-energised before discharge.** Severe transient, contactor and capacitor damage.

**No unbalance protection on a multi-element bank.** One element fails, the rest overstress, and the bank is lost.

**Fixed compensation on a plant with light-load periods.** Overcompensation, leading power factor and voltage rise.

**Bank left connected on standby generation.** Leading power factor into a machine designed to supply reactive power.

**Bank not reassessed after drives were added.** The resonance condition changed and nobody re-ran the check.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A compressor station's electrical supply is metered on apparent power. A review of the bills identifies a persistently poor power factor, and an automatic capacitor bank is specified and installed at the main board to correct it. The bank is undetuned, sized from the measured reactive demand.

After installation the measured cos φ improves as expected. The billed apparent power barely changes. Within a few months, capacitor fuses begin operating.

```text
Symptom:
Correction achieved on cos φ, no meaningful reduction in billed kVA,
followed by capacitor fuse operations.

Evidence:
- most of the station load is fed through rectifier front ends
- measured displacement power factor before installation was already
  reasonably high
- measured TRUE power factor before installation was substantially lower
  than the displacement value
- the harmonic current spectrum at the main board shows significant
  content at low orders
- distortion measured with the bank switched out is moderate; with certain
  step combinations connected it rises sharply at one order
- the failed capacitors show thermal signatures rather than mechanical damage

Reasoning:
Two separate findings, with one root. First, the power factor deficit was
mostly a DISTORTION deficit, not a displacement deficit — and capacitors act
only on displacement, which is why cos φ improved while the metered apparent
power did not. Second, adding undetuned capacitance to a network with
significant harmonic sources created a parallel resonance near an order that
is present, which amplified the harmonic current circulating through the
capacitors and overheated them. The step-dependent distortion measurement is
the signature: the resonant order moves as the controller switches steps.

Next investigations:
- confirm the harmonic spectrum and the busbar short-circuit level in each
  operating configuration
- screen the resonant order for each step combination against the measured spectrum
- determine what share of the metered apparent power is attributable to
  distortion rather than displacement
- evaluate detuning the existing bank versus harmonic mitigation at the sources
```

The remediation has two independent parts, and treating it as one problem produces the wrong answer. Detuning the bank removes the resonance and protects the capacitors — it does not improve the metered apparent power, because it does not remove harmonic current. Reducing the distortion itself, at or near the drives, is what addresses the billing, and it is a different project with a different cost.

**The transferable point is the distinction this article opens with: capacitors correct displacement. If the deficit is distortion, a capacitor bank answers a question the plant was not asking — and, undetuned, it makes the real problem worse.**

## Recommended Practice

- Measure displacement and true power factor separately before designing anything, and establish which component is deficient.
- Where the deficit is distortion, treat it as a power quality problem, not a compensation problem.
- Choose individual, group or central compensation from where the reactive current should stop flowing.
- Size individual motor capacitors conservatively against the motor's magnetising requirement, per the motor manufacturer, to prevent self-excitation; never fit capacitors between a drive and its motor.
- Size steps from the measured load profile, balancing resolution against switching frequency, with hysteresis and delay to prevent hunting.
- Verify controller CT position and polarity by observed behaviour, not by drawing.
- Specify capacitor-duty switching devices and account for back-to-back inrush.
- Detune where significant distorting load exists or is planned, and specify capacitors rated for the elevated voltage a detuned arrangement produces.
- Do not describe a detuned bank as harmonic mitigation; a tuned filter is a different device requiring its own study.
- Screen the resonant order for every step combination and every network configuration, including one-transformer and generator cases.
- Fit unbalance protection on multi-element banks, plus overcurrent and overvoltage protection.
- Provide ventilation and treat filter and temperature maintenance as life-determining.
- Disconnect or explicitly control compensation when running on standby generation, by scheme rather than by procedure.
- Verify discharge behaviour at commissioning and always verify absence of voltage before work, regardless of discharge devices.
- Measure distortion with steps switched in and out at commissioning, and re-assess the bank whenever distorting load is added.

## Conclusion

Reactive compensation is a mature, economical and well-understood technology whose failures come almost entirely from applying it to the wrong problem or installing it on a network it was not designed for.

The two questions that prevent most of those failures are simple. Is the power factor deficit displacement or distortion — because capacitors address only the first? And does the network contain harmonic sources — because if it does, an undetuned bank is not a neutral addition but an active participant that can amplify what is already there. Answer both with measurements, detune when the answer says to, and a capacitor bank remains one of the quietest and most cost-effective assets in the electrical room.
