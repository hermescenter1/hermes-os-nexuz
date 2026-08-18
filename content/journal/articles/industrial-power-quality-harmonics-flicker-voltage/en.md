# Industrial Power Quality: Harmonics, Flicker and Voltage Disturbances

## Executive Summary

"We have a power quality problem" is not a diagnosis. It is a category, and the category contains phenomena with almost nothing in common except that they all appear as departures from an ideal sinusoidal supply.

A harmonic is a steady-state, periodic distortion of the waveform shape. A voltage dip is a transient loss of magnitude lasting cycles. Flicker is a repetitive fluctuation slow enough to be seen by a human eye and fast enough to be irritating. A transient is a microsecond-to-millisecond excursion. Unbalance is an asymmetry between phases. Commutation notching is a repeated high-frequency disturbance imposed on the voltage by converters. They have different causes, different victims, different instruments and — this is the point that costs money — different remedies. A measure that solves one of them typically does nothing for the others, and in at least one well-known case makes another worse.

This article separates the phenomena, explains what each measurement can physically reveal, and maps each one to the mitigation that addresses it. The drive-specific input and output behaviour that generates much of this — input rectifier current, output edges, cable and earthing practice — is treated in the companion article on drive harmonics and EMC, and the reactive-compensation and resonance material sits in the companion article on capacitor banks. What follows is the plant-level view: what is happening on the network, how to see it honestly, and what to do about it.

## The Family, Separated

| Phenomenon | Time character | Typical origin | Typically damages or disturbs |
| --- | --- | --- | --- |
| **Harmonics** | Steady-state, periodic | Non-linear load current | Transformers, neutrals, capacitors, motors |
| **Voltage dip (sag)** | Event, cycles to seconds | Faults elsewhere, large motor starting | Contactors, drives, PLC supplies, relays |
| **Interruption** | Event, cycles upward | Protection operation, supply loss | Everything not held up |
| **Flicker** | Repetitive, sub-second to seconds | Cyclic or fluctuating loads | Human perception via lighting |
| **Transient** | Impulse or oscillation, µs to ms | Lightning, switching operations | Insulation, electronics, drive DC links |
| **Unbalance** | Steady-state asymmetry | Uneven single-phase load, faults | Induction motors, converters |
| **Notching** | Repetitive, high-frequency | Line-commutated converters | Zero-crossing detection, electronics |
| **Frequency deviation** | Slow | Generation-load imbalance | Time references, generator-fed islands |

**Two observations from this table drive everything that follows.** The first is that the *victims* differ. A plant whose complaint is "drives keep tripping" and a plant whose complaint is "the transformer runs hot" are almost certainly not describing the same phenomenon. The second is that steady-state phenomena and event phenomena require fundamentally different measurements — and an instrument configured for one is structurally blind to the other.

## What the Measurement Window Lets You See

This section decides whether an investigation succeeds, and it is where most of them fail.

**A power quality instrument does not record the waveform continuously.** It computes quantities over a basic measurement interval and then aggregates those into longer intervals for storage. The standardised approach — the one instrument classes in IEC 61000-4-30 are built around — takes a short basic window of a few cycles and aggregates upward through intermediate intervals to ten minutes and two hours.

**The consequence is blunt: a 10-minute aggregated rms trend cannot show a 100 ms dip.** The dip is averaged into 600 seconds of normal voltage and disappears into a trend line that looks unremarkable. This is the single most common reason an investigation concludes "no power quality problem found" while the process continues to stop.

Four rules follow, and they are not optional:

- **Event capture must be enabled and thresholded appropriately**, separately from trend recording. Dips, swells and interruptions are recorded as events with a residual magnitude and a duration, not as trend samples.
- **Transients require a sampling rate the trend function does not use.** An instrument recording harmonics faithfully may not capture an impulse at all. If transients are suspected, that capability must be specifically present and specifically armed.
- **Measure where the victim is, not only at the incoming supply.** Voltage distortion and dip magnitude both change through the network. A measurement at the main incomer answers a question about the supply; a measurement at the tripping panel answers the question that was asked.
- **Record for a period that covers the operating cycle.** A two-hour measurement on a quiet afternoon proves nothing about a phenomenon that appears during a shift change, a batch transition or a specific product.

**Time synchronisation across measurement points is what turns data into a conclusion.** Two synchronised recorders — one upstream, one downstream — resolve the question "did this come from the network or from us?" far more reliably than any single-point index. Without common time, two recordings are two anecdotes.

**Finally, record the victim as well as the supply.** The drive fault log, the PLC event stamp and the trip relay record are evidence, and correlating them against the disturbance timeline is what proves causation instead of coincidence. A disturbance that occurs frequently but never coincides with a trip is not the cause of the trips.

## Harmonics: A Current Phenomenon With a Voltage Consequence

**The load draws non-sinusoidal current; the network turns that current into voltage distortion.** Where that current meets the impedance of the supply, it develops a voltage at each harmonic frequency, and the resulting distorted voltage is then imposed on every other load sharing the busbar. This single sentence contains the whole attribution logic: current distortion belongs to the load that produces it, and voltage distortion is a shared condition at the point of common coupling.

```text
THD_V = √( Σ V_h² ) / V_1   for h = 2, 3, 4, …    voltage distortion
THD_I = √( Σ I_h² ) / I_1   for h = 2, 3, 4, …    current distortion

  V_h, I_h  = r.m.s. value of the harmonic of order h
  V_1, I_1  = r.m.s. value of the fundamental component

Assumptions and limits:
  - THD is defined against the FUNDAMENTAL, so THD_I rises at light load
    even when the absolute harmonic current is falling — a high THD_I on a
    lightly loaded feeder can be harmless
  - demand-referred indices exist precisely to remove that artefact by
    relating harmonic current to a demand current rather than to the
    instantaneous fundamental
  - the summation is truncated at the instrument's highest measured order;
    two instruments with different limits report different THD
  - THD says nothing about WHICH orders are present, and the orders are
    what determine the effect
```

**Which orders appear is determined by the converter topology.** A six-pulse rectifier produces characteristic orders at h = 6k ± 1 — that is, the 5th, 7th, 11th, 13th and so on. A twelve-pulse arrangement cancels the lowest of these and leaves h = 12k ± 1, beginning at the 11th. **Single-phase electronic loads are a different population**: they produce triplen orders (3rd, 9th, …) which are zero-sequence and therefore *add* rather than cancel in the neutral of a four-wire system. This is why a neutral conductor in an office or control-room distribution can carry more current than any phase, and why delta windings — which circulate zero-sequence current rather than passing it on — matter in the transformer arrangement.

**The effects are specific, and each has its own mechanism:**

- **Transformer heating.** Eddy-current loss rises steeply with frequency, so harmonic current heats a transformer far more than the same rms value at fundamental frequency would. Transformers feeding heavily distorted load are specified with this in mind, either through a rated capability for harmonic loading or through explicit derating.
- **Neutral overload**, from triplen orders as described above, in a conductor often historically sized smaller than the phases.
- **Capacitor stress**, because capacitive impedance falls with frequency — and, more seriously, the resonance interaction covered in the capacitor-bank article.
- **Motor heating**, since harmonic sequences produce fields that do not contribute useful torque but do produce loss.
- **Instrument and protection behaviour**, where a device sensing average or peak rather than true rms reads incorrectly on a distorted waveform.

**On limits: do not work from a remembered number.** Frameworks for harmonic limits exist and are widely applied, but they are defined at a specified point, they depend on system parameters such as the short-circuit ratio at that point, they distinguish current limits (the load's responsibility) from voltage limits (the network's condition), and they differ between standards and editions. The applicable limit for a given site is the one in the connection agreement and the applicable standard edition — not one recalled from a previous project.

## Voltage Dips: The Expensive One

**By industrial impact, voltage dips are usually the dominant power quality phenomenon**, and they are the one least amenable to the equipment people instinctively buy.

**Most dips originate outside the plant.** A fault anywhere on the connected network depresses voltage across a wide area until protection clears it, which is why dips correlate with weather and with events kilometres away, and why they arrive in clusters. Inside the plant, direct-on-line starting of large machines and transformer energising produce dips of their own.

**A dip is characterised by residual voltage and duration** — how deep, how long. Two further characteristics matter for sensitive equipment: the **phase-angle jump** that accompanies many dips, and the **point on the wave** at which the dip begins and ends. Equipment susceptibility is conventionally expressed as a voltage-tolerance envelope; curve-based descriptions such as the ITIC/CBEMA family, and equipment specifications such as SEMI F47 for semiconductor manufacturing, exist precisely to make susceptibility a specifiable property rather than a discovered one.

**The critical engineering insight is that a dip is missing energy.** No filter, reactor or capacitor can restore it. Anything that rides a dip through must either store energy or tolerate its absence. That distinction eliminates most of the products people are tempted to buy for the problem.

**The weakest link is almost never the most expensive device.** A drive with a well-charged DC link and a kinetic-buffering function can ride through a dip that a plain AC contactor coil cannot — so the drive survives while the contactor feeding it drops out, and the process stops anyway. Practical ride-through is therefore built at the *control* level first:

- Hold up the control supply — the PLC, the I/O and the control circuits — where the energy required is small.
- Address contactor drop-out specifically, through coil arrangements that tolerate the depression or through control logic that does not require an uninterrupted coil.
- Use the drive's own ride-through capability deliberately, and understand what it does to the process when it engages.
- Design the restart. A plant that survives the dip electrically but cannot restart in a controlled sequence has converted a one-second event into an hour of production loss.

## Flicker: A Perceptual Quantity, Not an Electrical One

**Flicker is the only entry in this family defined by human perception.** It is the visual sensation caused by repetitive fluctuation of the supply voltage acting on lighting, and the quantity that is measured is deliberately not "voltage variation" but the severity of the perceived effect.

**A flickermeter models the chain lamp → eye → brain** and produces severity indices: a short-term index evaluated over ten minutes, and a long-term index derived by aggregating twelve consecutive short-term values across a two-hour window. The scale is anchored so that unity corresponds to the reference perceptibility level used to calibrate the instrument.

**Typical sources are loads that fluctuate rapidly and repeatedly** rather than loads that are simply large: arc furnaces, resistance and arc welding, rolling mills, crushers, sawmills, large reciprocating compressors, and switching operations on fluctuating generation.

**Two points are routinely confused, and both matter:**

**Flicker is not harmonics, and a harmonic measurement does not measure it.** They can coexist — an arc furnace produces both, plus interharmonics — but they are separate quantities requiring separate evaluation, and mitigating one does not mitigate the other.

**The classical flickermeter is built around the response of an incandescent reference lamp.** Modern lighting technologies do not respond identically to voltage fluctuation, so a measured index and the complaints from the shop floor can diverge in either direction. The measurement remains the correct contractual and comparative instrument; it should not be treated as a complete predictor of what people will actually see under a specific installed lighting technology.

**Mitigation is fundamentally about reactive power dynamics and supply stiffness.** Fast dynamic compensation, a stiffer connection or a dedicated transformer for the offending load, and process-side smoothing all attack the mechanism. A conventional switched capacitor bank does not — it is far too slow to follow the fluctuation, and it was never intended to.

## Transients, Unbalance and Notching

**Transients** divide into two mechanisms. *Impulsive* transients are unidirectional excursions from lightning or from switching, and they threaten insulation and electronics. *Oscillatory* transients most often come from energising a capacitance, and they are the classic cause of an overvoltage trip on a drive DC link when a bank switches somewhere upstream. A downstream capacitance can magnify the incoming transient if its own resonant frequency is near the transient's, which is why the fault appears at one specific piece of equipment rather than uniformly.

Mitigation is a coordinated arrangement: surge protective devices staged from the service entrance inward with an energy-handling capability appropriate to their position, line reactors at converter inputs, and — at the source — switching control on the equipment producing the transient. **One installation detail dominates SPD effectiveness: connecting-lead length.** The voltage actually presented to the protected equipment is the device's limiting voltage plus the inductive drop along its leads during a fast-rising surge, so short, direct, well-bonded connections are not tidiness but function.

**Unbalance** is a steady-state asymmetry between the three phases, characterised by the ratio of the negative-sequence component to the positive-sequence component. Its industrial significance is out of proportion to its apparent size: a modest voltage unbalance drives a much larger current unbalance in an induction machine, because the machine's impedance to negative-sequence voltage is low. The motor-side consequences and their protective response are covered in the companion article on motor protection; from the network side, the causes to look for are uneven distribution of single-phase load, a high-impedance or deteriorating connection in one phase, an open element or blown fuse in a capacitor bank, and supply-side asymmetry. **Unbalance is not single-phasing** — a genuine loss of one phase is a fault condition, not a quality parameter, and it is protected against rather than tolerated.

**Notching** is produced by line-commutated converters: during commutation the converter momentarily short-circuits two phases through the source impedance, producing a repeated notch in the voltage waveform. Its depth depends on the impedance between the converter and the point of observation, which is why a line reactor both reduces the notch seen upstream and is a standard part of the answer. Notching matters because it disturbs equipment that relies on zero-crossing detection or clean edges — synchronisation circuits, some timing and control electronics — and because it is poorly represented by a low-order harmonic spectrum alone.

## Matching the Remedy to the Phenomenon

| Phenomenon | What actually addresses it | What does not |
| --- | --- | --- |
| **Harmonics** | Reactors and DC chokes, multi-pulse or active front ends, designed tuned filters, active filters, appropriately rated transformers | Plain capacitor banks, general-purpose UPS, larger cables |
| **Voltage dips** | Stored energy, control-supply hold-up, contactor coil measures, drive ride-through, designed restart | Filters, reactors, capacitors |
| **Flicker** | Fast dynamic compensation, stiffer supply, process-side smoothing | Switched capacitor banks, harmonic filters |
| **Transients** | Coordinated SPDs with short leads, line reactors, switching control at source | Harmonic filters, power factor correction |
| **Unbalance** | Load redistribution, repairing the connection, correcting the bank, motor-side protection | Filters, capacitors |
| **Notching** | Line reactors, isolating sensitive circuits, converter topology | Trend-based harmonic measurement alone |

**One entry deserves emphasis because it is the field's most expensive habit: adding capacitors to a distorted network.** Reactive compensation and harmonic mitigation are different engineering problems, and an undetuned bank on a network with significant distorting load can make voltage distortion worse rather than better through resonance. That mechanism is set out in full in the capacitor-bank article; here it is enough to say that "power factor correction" is not an answer to a harmonic finding.

## Failure Modes

**Trending configured, event capture not enabled.** Weeks of data proving nothing, and a conclusion of "no problem found" while the plant keeps stopping.

**Measured only at the incomer.** The disturbance the equipment actually experiences was never recorded.

**Measured for two hours on a quiet day.** The operating condition that produces the phenomenon never occurred during the window.

**No time synchronisation between measurement points.** Upstream and downstream cannot be compared, so the source cannot be located.

**Supply recorded, victim not recorded.** Correlation between disturbance and trip is asserted rather than shown.

**High THD_I at light load treated as a problem.** The index rose because the fundamental fell; the absolute harmonic current did not.

**Harmonic limits applied from memory.** The wrong index, at the wrong point, from the wrong edition.

**Dips diagnosed as a harmonic problem.** A filter is purchased, and the trips continue unchanged.

**Ride-through engineered at the drive and not at the contactor.** The expensive equipment survives; the cheap coil does not; production stops either way.

**Flicker complaints answered with a switched capacitor bank.** Far too slow for the mechanism.

**SPD installed with long looping leads.** The protected equipment sees the limiting voltage plus a substantial inductive drop.

**Unbalance investigated only at the motor.** The blown capacitor element or the deteriorated phase connection upstream is never found.

**Capacitors added to a distorted network to "improve power quality".** Resonance, and a worse condition than before.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A packaging line stops several times a month. Each stop is brief, no equipment is damaged, and restart takes forty minutes of clearing and re-sequencing. A power quality survey is commissioned; the report identifies elevated current distortion on the feeder and recommends a harmonic filter. The filter is installed. The stoppages continue at the same rate.

```text
Symptom:
Intermittent line stoppages, no damage, unaffected by an installed
harmonic filter.

Evidence:
- the original survey used trend recording only; no dip events were captured
- the drive fault log records DC bus undervoltage at each stoppage
- several stoppage timestamps coincide with regional weather activity
- a second measurement with event capture enabled records short voltage
  dips of a few cycles at the plant incomer, several per week
- a synchronised recorder inside the line panel shows the same events with
  similar residual voltage — the dips are arriving from the supply, not
  being produced within the line
- the elevated current distortion in the original report was measured
  during a low-throughput period; the absolute harmonic current was modest
- the first device to change state at each event is a contactor in the
  infeed section, not the drive

Reasoning:
Two independent errors. The original measurement could not see the actual
phenomenon: a trend-only recording averages a few-cycle dip into a ten-minute
value and shows nothing. And the index it did report — current distortion
relative to a reduced fundamental — was an artefact of light loading rather
than evidence of a harmonic problem. The dips are supply-originated, and the
plant's susceptibility is set by a contactor that releases before the drive
reaches its own undervoltage limit. A harmonic filter cannot address any part
of this, because a dip is an absence of energy and a filter does not store any.

Next investigations:
- characterise the dip population by residual voltage and duration over a
  period covering the full operating cycle
- compare that population against the voltage-tolerance envelope of each
  critical device in the infeed section
- determine which specific elements release first, and at what depth
- evaluate control-supply hold-up and contactor drop-out measures against
  the measured dip population
- design and test a controlled restart sequence, since some dips will always
  exceed whatever tolerance is engineered
```

The remedy is unglamorous and inexpensive relative to the filter: hold up the control supply, address the identified contactors, confirm the drive's ride-through configuration, and build a restart sequence that returns the line to production in minutes rather than in forty. **The transferable lesson is that the instrument's configuration decided the diagnosis.** The phenomenon was not measured, so a phenomenon that had been measured was blamed.

## Recommended Practice

- Treat "power quality problem" as a category to be resolved into a specific phenomenon before any equipment is specified.
- Decide first whether the complaint describes a steady-state condition or an event, because that decides the instrument and its configuration.
- Enable event capture and transient capture explicitly; a trend recording is structurally blind to dips and impulses.
- Measure at the affected equipment as well as at the incoming supply, and synchronise the recorders in time.
- Record for a period that covers the full operating cycle, including shift changes and product transitions.
- Collect the victim's own evidence — drive fault logs, PLC event stamps, relay records — and correlate it with the disturbance timeline before asserting causation.
- Distinguish current distortion, which is attributable to a load, from voltage distortion, which is a shared condition at a point.
- Interpret THD against loading; a high distortion ratio at light load is not automatically a finding.
- Take harmonic limits from the applicable standard edition and the connection agreement, at the specified point, and not from memory.
- Treat voltage dips as an energy problem, and build ride-through where the energy required is smallest — the control level — before considering process-level storage.
- Establish which device releases first during a dip, rather than assuming it is the most complex one.
- Design the restart sequence, because tolerance is finite and some events will always exceed it.
- Evaluate flicker with a flickermeter, not a harmonic analyser, and remember the measurement's incandescent reference when comparing it to complaints.
- Install surge protection with short, direct, well-bonded leads, and stage the devices by position and energy-handling capability.
- Investigate unbalance across the network — single-phase distribution, connection integrity, capacitor elements — and not only at the motor that tripped.
- Never treat reactive compensation as harmonic mitigation.

## Conclusion

The discipline in power quality work is almost entirely in the first step: naming the phenomenon before buying the remedy. Every phenomenon in this family is well understood individually, and the mitigation for each is mature, available and effective. The failures are failures of identification — a steady-state instrument pointed at an event problem, an index misread because of loading, a category name treated as a diagnosis.

Configure the measurement for the phenomenon you actually suspect, measure where the affected equipment lives, synchronise the clocks, and collect the victim's evidence alongside the supply's. Do that, and the remedy usually selects itself — and it is frequently cheaper, smaller and more specific than the one that would have been bought without it.
