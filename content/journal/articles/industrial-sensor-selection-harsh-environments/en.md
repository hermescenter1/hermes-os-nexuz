# Sensor Selection for Harsh Industrial Environments

## Executive Summary

Measurement failures in industrial plants are rarely accuracy failures. Almost none of them are traceable to a device that was not precise enough.

They are traceable to four things instead. **The measuring principle was wrong for the medium** — a technology that infers a value from a property the process quietly changed. **The installation made the measurement unrepresentative** — a correct device measuring the wrong place. **The environment attacked something nobody specified** — a gasket, a cable entry, a vent, a connector, a capillary. Or **the specification optimised the wrong property** — an expensive accuracy figure bought for a loop that needed repeatability and stability instead.

That last one deserves stating up front, because it shapes every selection decision that follows. **Accuracy is the number people argue about in procurement; repeatability is usually what the application actually needs.** A control loop does not care whether the measurement is offset by a fixed amount — it cares whether the same condition gives the same reading tomorrow. A device with excellent accuracy and poor long-term stability is worse for control than the reverse.

This article covers how to specify the requirement before choosing a device, what the industrial environment actually attacks, what each measurement family is blind to, why installation frequently dominates device performance, and why duplicating a sensor is not the same as making a measurement redundant.

The wiring architecture around these devices is covered in the companion articles on instrumentation architecture and on 4–20 mA loop design; the use of sensor data in a condition-monitoring programme is covered in the companion article on predictive maintenance. This article is about choosing and installing the device itself.

## Specify the Requirement Before the Device

Four properties are routinely conflated, and the distinctions decide the purchase.

| Property | What it means | What needs it |
| --- | --- | --- |
| **Accuracy** | Closeness to the true value | Custody transfer, emissions reporting, quality release |
| **Repeatability** | Same input gives the same reading | Control loops, sequences, comparisons |
| **Resolution** | The smallest change the device reports | Fine positioning, small-signal work |
| **Stability / drift** | How much it changes over time and temperature | Trending, condition monitoring, long calibration intervals |

**A control loop needs repeatability and stability far more than it needs absolute accuracy**, because it acts on change and it re-references itself against a setpoint that was itself established from the same measurement. A measurement used for reporting or trade needs accuracy and traceable calibration. **Specifying the wrong one buys the wrong device**, and the resulting complaint — "the reading is wrong" — sends everyone in the wrong direction.

**Response time is a system property, not a device property.** The number on the datasheet describes the sensing element. The installed response is set by everything between the process and that element: a fast thermocouple inside a heavy thermowell has the thermowell's response time; a pressure transmitter behind a long impulse line has the impulse line's; a remote-diaphragm seal system has the capillary's. **When a control loop is too slow and the sensor is "fast", the thermowell is usually the answer.**

**Specify the whole operating envelope, not the normal condition.** The states that destroy instruments are rarely normal operation:

- Startup and shutdown transients, including vacuum on cooling.
- Cleaning and sterilisation cycles, whose temperature and chemistry can exceed the process.
- Steam-out, which has ended more instrument lives than any process fluid.
- Upset conditions and the maximum credible overpressure or overtemperature.
- Turndown: a device sized for maximum flow may be operating below its usable range at minimum flow, where its uncertainty is largest in percentage terms.

**And state the measurement's purpose**, because it changes the requirements: control, indication, protection, custody or condition monitoring. A protection measurement has availability, fail-direction and testability requirements that an indication does not.

## What the Environment Actually Attacks

**Temperature attacks the electronics, not the sensing element.** The sensing element is usually specified for the process; the transmitter housing is specified for ambient, and ambient is frequently underestimated. Radiant heat from adjacent equipment, solar gain on an unshaded housing, and installation inside an unventilated enclosure all raise the electronics temperature well above the air temperature somebody quoted. **Remote-mounting the electronics away from the hot zone is the standard answer**, and it costs far less than the failures it prevents.

**Ingress ratings are test results, not promises.** An ingress protection classification describes performance against defined solid and water tests under specified conditions. It does not describe resistance to steam, to high-pressure or high-temperature washdown (which have their own designations), to chemicals, or to prolonged submersion. **A device that passes its ingress test can still be destroyed by a washdown regime the test did not represent.**

**And most water inside a sealed device does not enter as water.** Daily temperature cycling makes the housing breathe; moist air enters through the smallest path and condenses inside. Two device-level details follow, and both are frequently missed:

- **Gauge-referenced pressure transmitters need a path to atmosphere.** That vent is a designed opening, it usually contains a filter or membrane, and if it becomes blocked, wetted or fouled the device measures against a trapped reference that moves with temperature. **The result is a slow drift with no fault indication** — the instrument is healthy and its reference is not.
- **Cable entries are the other route.** A gland tightened onto the wrong cable diameter, a cable entering from above with no drip loop, or an unused entry left with a plastic transport plug all produce a wet device with a perfectly adequate ingress rating.

**Chemical attack usually finds the softest component.** The wetted materials of the sensing element are normally chosen carefully; the **gasket, the O-ring and the seal material** are chosen from what was in the drawer. Elastomer compatibility with the process, with the cleaning chemistry and at the operating temperature is a separate check from the metallurgy. **"Stainless steel" is a family, not a material** — the grade matters, chloride environments in particular discriminate sharply between grades, and specifying the family rather than the grade is a decision deferred to whoever quotes.

**Vibration attacks the mounting, the cable and the connector before it attacks the sensor.** Fatigue at the cable entry, work-hardening of small-bore impulse tubing, loosening of a mounting bracket, and connector fretting are the common outcomes. **Resonance is the mechanism that turns tolerable vibration into failure**, and a long, unsupported impulse line or capillary is an excellent resonator.

**Electrical environment** — immunity, coupling, common-mode — is treated in the instrumentation architecture and drive EMC articles. The selection-level point is only that a device carries an immunity specification, that the installation must not exceed it, and that an area dense with converters and switching loads is a specification input rather than a surprise.

**Hazardous areas** impose requirements that are not negotiable against any of the above: the equipment must be suitable for the zone and for the gas or dust group, the temperature classification relates the equipment's maximum surface temperature to the ignition characteristics of the substance present, and the certificate's ambient temperature range applies to the actual installed location. These belong to the site's hazardous-area documentation and the equipment certificates, which govern over anything written here.

## What Each Measurement Family Is Blind To

**Temperature.** Thermocouples are rugged, wide-range and self-powered but produce a small signal referenced to a cold junction and drift as their junction degrades. Resistance thermometers are more stable and more repeatable over industrial ranges but are affected by lead resistance and by self-heating. **The thermowell is both a thermal component and a mechanical one**: it dominates the installed response time, and it is exposed to the flow as a bluff body — vortex shedding can excite it, and a thermowell that fatigues can fail into the process. Its design against the actual flow conditions is an engineering calculation, not a catalogue selection. **Insufficient immersion depth causes a stem conduction error**, in which the well conducts heat away and the reading sits between the process and the ambient — stable, plausible and wrong. Non-contact infrared measurement reads a surface, depends on emissivity, and sees everything between the sensor and that surface, including steam, dust and a dirty window.

**Pressure.** The reference decides the measurement: gauge (relative to atmosphere, and therefore dependent on that vent), absolute, or differential. Diaphragm material and seal compatibility govern life. **Remote diaphragm seals solve a mounting problem and create two others**: the fill fluid's expansion makes the reading temperature-sensitive, and the capillary adds response lag. **Impulse lines are where pressure measurements actually fail** — plugged with solids, frozen, holding gas in a liquid leg or condensate in a gas leg. Every one of those produces a stable, plausible, wrong reading rather than an obvious fault, which is why "the transmitter has been replaced twice" is such a common history. Overpressure ratings distinguish the pressure the device survives without damage from the pressure at which it fails structurally, and the operating envelope must respect the first.

**Flow.** More than any other family, the flow selection question is *what the meter needs from the fluid and the pipe*: a full pipe, a minimum conductivity, a clean or dirty stream, a single phase, a defined flow regime, and a specified length of undisturbed straight pipe upstream and downstream. **Differential-pressure elements measure a pressure difference and infer flow**, which means the inference depends on density and degrades away from the design condition. And the decisive practical point: **a meter's quoted accuracy applies under reference installation conditions, and the installed uncertainty is a different number** — an upstream bend, a partially open valve or an insufficient straight run can contribute more error than the device's own specification, so a high-accuracy meter in a poor installation is an expensive average meter.

**Level.** The selection is dominated by the medium's behaviour: foam, coating and build-up, agitation, vapour, temperature-dependent density, and interfaces between phases. **Most level technologies do not measure level; they measure something else and infer it.** Hydrostatic measurement infers level from pressure and assumes a density. Time-of-flight methods infer from a reflection and assume a detectable surface. Capacitive methods infer from a dielectric property. **A change in the medium therefore changes the reading while the level stays where it was**, and no device fault occurs. That single sentence explains a large fraction of level measurement disputes.

**Proximity and position.** The technology follows the target and the contamination: inductive devices see metal, capacitive devices see almost anything including the coolant and the ice, magnetic devices need a magnet, and mechanical devices wear. The **mounting is part of the sensor** — the sensing distance is specified against a defined target of defined material and size, and drift in the mounting is indistinguishable from drift in the device. Where the device participates in an interlock, its de-energised state and its failure direction are design decisions rather than wiring conveniences.

**Vibration.** The mounting *is* the measurement. A stud-mounted accelerometer, a magnet-mounted one and a hand-held probe have progressively lower usable frequency ranges, so **readings taken by different methods are not comparable** and a trend that switches method is not a trend. Cable and connector failure dominate accelerometer reliability in industrial service, particularly where the cable is not strain-relieved at the sensor. The interpretation of vibration data belongs to the condition-monitoring article; the selection point is that the mounting method must be fixed and recorded as part of the measurement definition.

## Installation Frequently Dominates Selection

- **Representativeness first.** A measurement taken where the pipe was accessible rather than where the process condition exists is wrong by an amount nobody can calculate. Stratified temperature, incompletely mixed streams and dead legs all produce faithful measurements of the wrong thing.
- **Orientation and immersion.** Immersion depth for temperature, orientation for level and for meters that depend on a full pipe, and the direction of any drainage or venting path.
- **Impulse lines that self-drain or self-vent.** A liquid line sloping the wrong way traps gas; a gas line sloping the wrong way traps condensate. This is a routing decision made once, and it determines whether the measurement can be trusted for the next twenty years.
- **Maintainability by design.** Can the device be isolated, calibrated and replaced without shutting the process down? Block-and-bleed arrangements, isolation valves and accessible mounting are cheap at construction and impossible to retrofit conveniently.
- **The mounting as a structure.** It carries the device through vibration and thermal expansion, and it must be checked as a mechanical item rather than assumed.
- **The cable entry.** Gland matched to the cable, drip loop below the entry, strain relief at the device, unused entries properly sealed.

## Diagnostics, Failure Behaviour and Real Redundancy

**The most valuable reliability property of a measurement is whether it fails detectably.**

| Failure style | Example | Consequence |
| --- | --- | --- |
| **Fails obviously** | An open thermocouple, a broken loop, an out-of-range signal | The system knows immediately; the operator knows immediately |
| **Fails plausibly** | Plugged impulse line, stem conduction error, medium density change, drifting reference | A stable, believable, wrong number that everybody acts on |

**Where the consequence of a wrong measurement is high, prefer a principle that fails detectably**, or add a means of detecting the plausible failure. This is a selection criterion that rarely appears on a datasheet comparison and matters more than most that do.

**Device self-diagnostics help only if they reach somebody.** Modern transmitters detect sensor faults, out-of-range conditions and internal failures, and signal them by driving the output outside the measuring range — a convention covered in the loop article. That information is lost if the input clamps, if the fail direction is not configured, or if the alarm is mapped to the same tag as a process alarm.

**Duplication is not redundancy.** Two identical devices, of the same principle, on the same process connection, in the same environment, share their failure causes:

- Both impulse lines plug together, because the same process fouls them.
- Both sensors coat together, because they see the same medium.
- Both readings shift together, because the assumption both rely on has changed.
- Both fail together in an upset, because the upset is the common cause.

**Diverse redundancy addresses this**: different measuring principles, different process connections, or both. A hydrostatic level measurement and a time-of-flight measurement fail for entirely different reasons, so a disagreement between them is informative in a way that a disagreement between two identical devices is not.

**The practical mechanism is deviation checking**: comparing redundant measurements continuously and alarming on disagreement. **A pair of measurements that agree perfectly and are both wrong is exactly what identical redundancy produces**, which is why diversity is the property that matters and duplication is the property that gets purchased.

Voting arrangements, proof-test intervals and the architecture of safety measurements belong to functional safety design and to the companion article on interlocks and trip logic; the selection-level obligation is to know which category a measurement is in before choosing the device.

## Maintainability and Lifecycle

- **The configuration is part of the device.** A modern transmitter holds range, damping, units, fail direction, linearisation and diagnostics settings. A replacement fitted with factory defaults is not a replacement, and a plant without a record of each device's configuration cannot replace one correctly under pressure.
- **Calibration in place or on the bench?** The answer determines whether calibration happens at all.
- **Spares strategy.** A device with a long lead time and no spare is an availability decision, whether or not anyone made it deliberately.
- **Obsolescence.** Sensors outlive their product families. A standard interface — an analogue current signal, a common digital protocol — preserves the ability to replace a device without changing the system.
- **Record what was installed, where, why and with what settings**, because the next person to touch it will have none of the context that made the selection correct.

## Failure Modes

**Accuracy specified where repeatability was needed.** An expensive device that does not solve the problem.

**Response time taken from the datasheet.** The thermowell, impulse line or capillary sets the real value.

**Ambient temperature underestimated at the electronics.** Radiant heat and solar gain kill transmitters that the process never touched.

**Ingress rating treated as a promise.** Steam, washdown and chemicals are not what the test represented.

**Blocked or wetted reference vent on a gauge transmitter.** A slow drift with no fault indication.

**Gasket or seal material chosen from stock.** The metallurgy was specified and the softest component was not.

**Stainless steel specified without a grade.** The choice deferred to whoever quotes.

**Long unsupported impulse line or capillary.** A resonator in a vibrating plant.

**Insufficient thermowell immersion.** A stem conduction error: stable, plausible and wrong.

**Thermowell not assessed against the actual flow.** A mechanical component treated as a catalogue item.

**Flow meter installed without the required straight run.** Installed uncertainty larger than the device specification it was bought for.

**Level inferred from a property that changed.** No device failed and the reading is wrong.

**Impulse line plugged, frozen, or holding the wrong phase.** A believable number and a transmitter replaced twice.

**Vibration trend built from mixed mounting methods.** Not a trend.

**Two identical devices on one process connection called redundancy.** One failure cause, two failed measurements, perfect agreement.

**Deviation checking not implemented between redundant devices.** The one mechanism that would have detected the disagreement.

**Fail direction unconfigured, or the input clamping at range limits.** Device diagnostics discarded before they reach anyone.

**Replacement device fitted with default configuration.** The physical part matched and the measurement did not.

**No block-and-bleed or isolation.** Calibration requires a shutdown, so calibration does not happen.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A critical vessel has two independent level transmitters, both reporting to the control system with a deviation alarm configured between them. During a batch, the actual liquid level rises above the intended maximum without any alarm. Both transmitters read within a few percent of one another throughout, and both read below the true level. Both devices are subsequently bench-tested and found to be within specification.

```text
Symptom:
A high-level condition reached without alarm on a vessel with two independent
level transmitters that agreed with each other throughout and were both
subsequently proven healthy on the bench.

Evidence:
- both transmitters are hydrostatic: they measure pressure at the bottom of
  the vessel and the system computes level from an assumed liquid density
- both are connected to the vessel through the same lower tapping, via a
  common manifold
- the density value used in the level calculation is a fixed configured
  constant, entered at commissioning
- the batch in question used a product grade of noticeably lower density than
  the grade in use when the constant was set
- the measured pressures were correct for the actual liquid column present
- the deviation alarm between the two transmitters never activated, because
  both were reading the same correct pressure and applying the same wrong
  density
- an independent sight indication, when eventually checked, showed the true
  level
- neither device logged a diagnostic event; neither had drifted

Reasoning:
Nothing failed. Both instruments measured pressure faithfully and both
calculations converted that pressure into level using a density that was no
longer true. The measurement was an inference, and the assumption underneath
the inference had changed.

The redundancy was ineffective for a specific and instructive reason: the two
measurements were duplicated rather than diverse. They shared the measuring
principle, the process connection and the density assumption, so every failure
mechanism available to one was available to both in exactly the same
proportion. Deviation checking between them could never detect this class of
error, because the error is common to both by construction — and the perfect
agreement between them was read as confirmation rather than as an absence of
information.

Next investigations:
- establish the range of product densities the vessel actually sees and how
  often the grade changes
- determine whether density can be measured or inferred online, or whether the
  constant must be set per product grade by the batch system
- review every other inferred measurement on the plant for a configured
  constant that a process change can invalidate
- evaluate adding a diverse level measurement on a separate connection, using
  a principle that does not depend on density
- re-specify the deviation check so that it compares measurements capable of
  disagreeing
```

**Two transferable lessons.** First, **an inferred measurement is only as valid as its assumption**, and configured constants — density, dielectric, emissivity, composition, temperature compensation — are silent dependencies that no device diagnostic monitors. Second, **agreement between identical redundant measurements is not evidence**; it is the expected outcome whether they are right or wrong. Redundancy detects failures only where the two measurements can fail differently, which is the whole argument for diversity.

## Recommended Practice

- Decide whether the application needs accuracy, repeatability, resolution or long-term stability, and specify that property — not all four.
- Specify the installed response time, including thermowell, impulse line or capillary, rather than the sensing element's figure.
- State the full operating envelope: startup, shutdown, cleaning, sterilisation, steam-out, upset and minimum turndown.
- Declare the measurement's purpose — control, indication, protection, custody or condition monitoring — because the requirements differ.
- Specify ambient at the electronics, including radiant and solar gain, and remote-mount electronics away from hot zones.
- Treat ingress ratings as test results and specify separately for steam, washdown chemistry and submersion where they apply.
- Check reference vents, cable entries, drip loops and unused entries as explicit items.
- Specify seal and elastomer materials against process, cleaning chemistry and temperature, and specify the alloy grade rather than the family.
- Assess thermowells against the actual flow conditions and specify immersion depth to avoid stem conduction error.
- Specify the straight-run and installation requirements of flow meters and evaluate installed uncertainty, not just device accuracy.
- Identify every measurement that infers a value from an assumption, and record the assumption as a maintained parameter.
- Prefer principles that fail detectably where the consequence of a wrong reading is high.
- Configure fail direction and preserve out-of-range signalling end to end.
- Make redundancy diverse — different principle, different connection, or both — and implement deviation checking that is capable of detecting disagreement.
- Design for maintainability: isolation, block-and-bleed, accessible mounting, in-place calibration.
- Record each device's configuration alongside its tag, and treat a replacement's configuration as part of the replacement.
- Support cables and impulse tubing against vibration, and strain-relieve every cable at the device.

## Conclusion

Sensor selection looks like a comparison of specifications and is in practice a series of judgements about the environment, the medium and the consequence of being wrong. The datasheet describes a device under reference conditions; the plant provides conditions that are not reference, an installation that modifies the measurement, a medium that changes, and a maintenance regime that will or will not be able to reach the device.

Three habits separate installations that measure reliably for twenty years from those that generate work orders. Specify the property the application actually needs rather than the one that is easiest to compare. Write down what each measurement assumes, because inferred measurements fail when their assumptions change and nothing alarms. And make redundancy diverse, because two identical devices sharing a connection and an assumption will agree with each other right up to the moment it matters.
