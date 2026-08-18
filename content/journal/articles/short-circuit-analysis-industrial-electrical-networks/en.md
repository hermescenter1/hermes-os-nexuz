# Short-Circuit Analysis in Industrial Electrical Networks

## Executive Summary

A fault study is often treated as a compliance document produced once and filed. It is better understood as the source of two different answers that the plant needs for opposite reasons.

**The maximum fault case answers: can the equipment survive and interrupt what the system can deliver?** It sizes breaking capacity, making capacity, withstand ratings and mechanical forces.

**The minimum fault case answers: will the protection actually see the fault?** It decides whether a device at the end of a long feeder operates in the required time, or sits there while a fault burns.

Designs that consider only the first are common, and the failure they produce is quiet: equipment that is correctly rated for a fault it will never be asked to clear, protecting a circuit whose far-end fault current is too low to trip it promptly.

**Safety note.** Fault studies inform work on equipment with lethal energy levels. Testing, settings changes and verification require isolation, lock-off, proof of dead and competent personnel under the site's own safe-working rules. Nothing here is guidance for working on energised equipment.

## Four Quantities That Are Routinely Conflated

This is the most important section of the article, because using one of these numbers where another is required produces a specification error that no amount of downstream care corrects.

| Quantity | What it describes | Whose property it is |
| --- | --- | --- |
| **Prospective short-circuit current** | The current that would flow at a point if a fault of negligible impedance occurred there | The **system** at that point |
| **Breaking (interrupting) capacity** | The current a device can successfully interrupt under defined test conditions | The **device** |
| **Making capacity** | The peak current a device can close onto without damage or welding | The **device** |
| **Short-time withstand current** | The current a device or assembly can *carry* for a stated short time without interrupting it | The **device or assembly** |

**Prospective current is not a rating.** It is what the network can deliver, and everything else is compared against it.

**Breaking capacity is not one number.** For low-voltage circuit breakers the device standards distinguish an ultimate breaking capacity — after which the device has performed its safety function but may not be fit for further service — from a service breaking capacity, after which it remains serviceable. The service value is the lower of the two. **Selecting on the ultimate value alone is defensible only if the plant accepts replacing the device after a fault**, and that is a maintenance decision, not a default.

**Making capacity matters because closing onto an existing fault is a different event from interrupting one.** The peak current in the first instants after a fault includes a decaying DC component, so the instantaneous peak is higher than the r.m.s. symmetrical value. A device closed onto a faulted circuit experiences that peak, and its contacts must not weld. Making capacity is therefore related to breaking capacity by a factor that depends on the fault circuit's power factor, and it is stated by the manufacturer rather than derived by the designer.

**Short-time withstand is the odd one out, because it is a rating for *not* operating.** A device that is deliberately delayed for selectivity must carry the fault current for the duration of that delay without damage. It applies to devices with an intentional short-time delay and to assemblies and busbars, and it is meaningless without its associated duration — a withstand rating always comes as a current *and* a time.

**Where these are confused, the characteristic errors are:**

- A device selected on prospective current alone, without checking that its breaking capacity covers it.
- A busbar checked for withstand current but not for the duration the upstream protection actually takes.
- A device with an adequate breaking capacity used where an upstream delay requires it to *hold* the fault, without a withstand rating for that time.
- A closing operation onto a fault not considered at all, because only the breaking case was checked.

## What a Study Computes, and at What Level of Rigour

The conceptual relationship everyone reaches for first is:

```text
I ≈ V / Z                        SIMPLIFIED CONCEPTUAL RELATIONSHIP ONLY

  I = fault current magnitude
  V = driving voltage at the fault location
  Z = total impedance of the path from the source to the fault

This is a teaching aid, not a study method. It ignores, among other things:
  - the decaying DC component and therefore the peak current
  - the difference between initial, breaking and steady-state values
  - separate positive-, negative- and zero-sequence networks, which is how
    unbalanced and earth faults are actually treated
  - the change in machine reactance over time after fault inception
  - the voltage factor applied to nominal voltage in a standardised study
Never present a result from this expression as a fault study.
```

**A standardised calculation such as the method of IEC 60909 is more structured**, and it is worth knowing its shape even if the arithmetic is done by software.

- It replaces the network with an **equivalent voltage source at the fault location**, which removes the need to model pre-fault load flow.
- It applies a **voltage factor** to nominal voltage, with different values used for maximum and minimum current calculations, to account for voltage variation, transformer tap position and load conditions.
- It represents unbalanced conditions using **symmetrical components** — positive-, negative- and zero-sequence networks — which is why earth-fault current depends heavily on the zero-sequence path and therefore on the earthing arrangement.
- It distinguishes **several currents rather than one**: an initial symmetrical current at the instant of fault, a peak current including the DC offset, a symmetrical breaking current at the instant of contact separation, and a steady-state current. Each is used for a different rating check.

**The engineering consequence of that last point: asking "what is the fault current at this board" is an incomplete question.** The useful question names which current, at what instant, for which purpose.

## Maximum and Minimum Fault Conditions

The two cases use deliberately opposite assumptions, and both must be computed.

| | Maximum fault case | Minimum fault case |
| --- | --- | --- |
| **Used to verify** | Equipment breaking, making and withstand ratings; mechanical forces | Protection sensitivity and operating time |
| Source strength | Strongest credible: highest utility fault level | Weakest credible: lowest utility level, or generator supply |
| Network configuration | Most sources connected — transformers in parallel, coupler closed | Fewest sources — one transformer, coupler open |
| Motor contribution | Included | Conservatively excluded |
| Conductor resistance | At the lower temperature, giving lower impedance | At the maximum operating temperature, giving higher resistance |
| Circuit length | Shortest credible | Longest credible, fault at the far end |
| Fault impedance | Negligible | Arc and contact impedance may be considered |
| Voltage factor | The higher value | The lower value |

**Both cases must include the plant's real operating modes.** An industrial network usually has more than one: normal with the coupler open, maintenance with one transformer carrying everything, standby generator supply, and any temporary configuration used during outages. The maximum case is often the parallel configuration; the minimum case is often the generator configuration, where fault current may be very much lower than on mains.

**Minimum fault current is the case that gets skipped**, and its consequences are the more dangerous of the two. If the current at the end of a circuit is below what the protective device needs to operate in the required time, the fault is not cleared promptly. The cable heats, the fault may escalate, and the touch-voltage duration on an earth fault may exceed what the earthing design assumed.

## Sources of Fault Current

**The utility supply** is characterised by a fault level or an equivalent impedance that the network operator provides. Two engineering points follow: it is a figure with an assumed configuration behind it, and **it changes** as the upstream network is reinforced. A study performed against a ten-year-old figure may understate today's maximum.

**Transformers** dominate LV fault levels, and their impedance is the main limiting element. Two cautions: nameplate impedance carries a manufacturing tolerance, and using the lower end of that tolerance is the conservative choice for the maximum case. Where actual test-certificate values exist, they are better data.

**Synchronous generators** contribute in a way that changes with time after fault inception, because their effective reactance rises from a sub-transient value through a transient value to a steady-state value. The practical consequences: initial current is high, and the *sustained* current a generator can deliver may be only a modest multiple of its rated current — which is precisely why protection that discriminates on mains may fail to discriminate on generator supply.

**Induction motors** contribute to the initial current and to the peak, because a spinning motor briefly behaves as a generator driven by its own inertia and residual flux. **That contribution decays rapidly and is not sustained**, since nothing maintains the field. Therefore:

- It **must** be included in the maximum case for making capacity, peak withstand and initial current.
- It has diminishing relevance for breaking current at longer delays and none for the steady-state value.
- It is **excluded from the minimum case**, because assuming help that may not be there is not conservative.

On a motor-heavy industrial board the aggregate motor contribution is significant, and omitting it is one of the more common study defects.

**Cables and busbars** add impedance and therefore reduce fault current with distance from the source. This is why the highest fault current is at the board and the lowest is at the far end of the longest circuit — and why both ends need checking for different reasons.

## Fault Types and the Earthing Arrangement

**The three-phase fault** is normally the highest-current case in an industrial LV network and is the basis for most equipment ratings.

**The line-to-line fault** is lower. Where the fault is electrically remote from generation, so that the positive- and negative-sequence impedances can be taken as equal, the line-to-line current is approximately √3/2 — about 87 % — of the three-phase value. That approximation weakens close to generation, where the sequence impedances differ.

**The earth fault is the case that cannot be generalised**, because its magnitude is set by the zero-sequence path, and that path is a design choice:

- In a **solidly earthed** system, the earth-fault current can approach the same order as a phase fault, and protection generally relies on that magnitude to detect it.
- In a **resistance-earthed** system, the neutral earthing resistor deliberately limits earth-fault current to a chosen value. The current is then far too small for overcurrent protection to see, so dedicated earth-fault protection is required by design rather than as an addition.
- In an **unearthed or impedance-earthed (IT) arrangement**, the first earth fault produces very little current, and the system is designed to keep operating while it is located — which changes the protection philosophy entirely and introduces the second-fault case as the hazardous one.

**The design consequence: earth-fault current is not an output of the study so much as an input decision made when the earthing philosophy was chosen.** The relationship between that choice, protection strategy and touch voltage is treated in the companion article on earthing and grounding design.

## Study Assumptions and Data Quality

A fault study is a model, and its output cannot be better than its inputs. The items that most often degrade a study:

- **Utility fault level** taken from an old letter, or stated without the configuration it assumes.
- **Transformer impedance** taken from a catalogue rather than the test certificate, and without applying the tolerance in the conservative direction.
- **Cable data** — lengths estimated, routes changed during construction, conductor material or cross-section substituted.
- **Motor inventory** incomplete, or not updated after plant changes.
- **Operating modes** modelled for the design intent only, omitting the maintenance and standby configurations that actually occur.
- **As-built divergence** — the single largest source of error in older plants, where the network on paper and the network in the building have drifted apart.

**Every study should state its assumptions explicitly and be re-run when they change.** A network expansion, a transformer replacement, a utility reinforcement or a change in operating philosophy each invalidate part of the previous result.

## What the Study Feeds

- **Equipment selection** — breaking capacity against maximum prospective current, making capacity against peak, withstand current *and time* for anything intended to delay.
- **Assembly ratings** — switchboard and busbar short-time and peak withstand, checked against both the current and the upstream clearing time.
- **Cable sizing** — the fault-withstand criterion, which depends on the protective device's let-through energy and therefore on its settings.
- **Protection settings and coordination** — the subject of the companion article on selective coordination, which consumes both the maximum and minimum results.
- **Arc-flash assessment** where it is performed, which is a specialist study using the fault study as an input.

**Where the prospective current exceeds a device's own rating, a manufacturer-verified backup (cascading) combination may be permissible.** That is not a calculation the designer can perform from first principles: it depends on the specific pairing of devices and is only valid where the manufacturer has tested and published that combination.

## Commissioning and Maintenance Implications

- **Verify the as-built network against the study model** — transformer nameplate and test data, cable types and actual lengths, the real motor list, and the configurations the plant can be operated in.
- **Record the utility fault level with its date and the configuration it assumes**, and request it again periodically.
- **Apply and record protection settings from the study**, and treat the settings record as part of the study's output rather than as a commissioning artefact.
- **Re-run the study after any change** to sources, transformers, network configuration or significant motor population.
- **Keep the model.** A study delivered only as a PDF report cannot be re-run cheaply; the model behind it is the asset.

## Failure Modes

**Only the maximum case computed.** Equipment is correctly rated and far-end protection may not operate.

**Motor contribution omitted.** Making and peak duties are understated on a motor-heavy board.

**Withstand rating quoted without its time.** The number is meaningless and the check was not performed.

**Ultimate breaking capacity used as if it were the service value.** After a fault, devices need replacing and nobody planned for it.

**Generator configuration not studied.** The minimum-fault case was never computed, so nobody knows whether the protection is sensitive enough on standby supply.

**Utility fault level out of date.** The network was reinforced upstream and nobody told the plant.

**Study not re-run after expansion.** Every downstream rating rests on a superseded result.

**Backup combination assumed rather than manufacturer-verified.** A device is applied above its own rating on the basis of an argument rather than a test.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A cement plant extends a distribution board to feed a new packing area at the far end of the site. The feeder is sized on load current and voltage drop, and the protective device is selected with a breaking capacity comfortably above the board's prospective fault current. Everything about the design is defensible against the maximum fault case.

Some months later, a fault at a distribution box in the new area is cleared — but slowly, with visible damage along part of the circuit and a much longer disturbance than the plant expected.

```text
Symptom:
Fault at the far end of a long feeder cleared far more slowly than intended.

Evidence:
- device breaking capacity is well above the prospective current at the board
- the fault occurred at the far end of the longest circuit on that board
- the circuit is long, and the fault was not a bolted three-phase fault
- the protective device's instantaneous element did not operate; clearing
  came from a much slower part of its characteristic
- upstream devices did not operate at all
- the study on file contains a maximum-fault case only

Reasoning:
This is a protection sensitivity problem, not an equipment rating problem.
Breaking capacity describes what the device can interrupt, and it was never
in question. What was never established is the MINIMUM fault current at the
far end of this circuit — reduced by the cable impedance over its length,
by conductor resistance at operating temperature, and by any arc impedance
at the fault. If that current falls below the threshold of the fast element,
clearing is left to a slower part of the curve.

Next investigations:
- compute minimum fault current at the far end, conductors at operating
  temperature, weakest credible source configuration, motor contribution excluded
- compare that current against the device's instantaneous threshold
- check the disconnection time actually achieved against the requirement
- verify the cable's fault-withstand check was performed for that clearing time,
  not for the fast-clearing assumption
```

The remediation options are ordinary and they trade against each other: lower the fast-element threshold, if selectivity with upstream devices still holds; increase the conductor cross-section to raise the far-end current; or add a protective device closer to the load so the protected length is shorter. Which is correct depends on the coordination study, not on this circuit alone.

**The transferable point is the one the study omitted: the maximum case protects the equipment, and the minimum case protects the circuit. A design that computes only the first is complete on paper and untested where it matters most.**

## Recommended Practice

- Compute maximum *and* minimum fault cases, and state which operating modes each represents.
- Keep the four quantities distinct in every specification: prospective current, breaking capacity, making capacity, and withstand current with its time.
- Decide explicitly whether service or ultimate breaking capacity is being specified, and record the maintenance consequence.
- Include motor contribution in the maximum case; exclude it from the minimum case.
- Model the generator configuration separately for both starting and protection sensitivity.
- Use transformer test data where available and apply impedance tolerance in the conservative direction.
- Treat the earthing arrangement as the determinant of earth-fault current, and select earth-fault protection accordingly.
- State the study's assumptions, its date, and the utility fault level it used.
- Never present a simple V/Z result as a fault study.
- Use manufacturer-verified combinations for any backup arrangement; do not derive one.
- Keep the study model, not only the report, and re-run it after any source, transformer, configuration or motor-population change.
- Verify the as-built network against the model at commissioning, and record the applied protection settings as part of the study output.

## Conclusion

The value of a short-circuit study is not the largest number in it. It is the discipline of asking, for each point in the network, both whether the equipment can survive the worst the system can deliver and whether the protection can detect the least it will deliver.

Those two questions are answered with opposite assumptions, and they protect different things — one the switchgear, the other the cable and the people near it. Add to that the discipline of keeping prospective current, breaking capacity, making capacity and withstand ratings as four separate ideas, and most of the specification errors in this field disappear before any equipment is ordered.
