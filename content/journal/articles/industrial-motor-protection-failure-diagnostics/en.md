# Industrial Motor Protection and Failure Diagnostics

## Executive Summary

Motor protection is a set of models. The overload function models winding temperature from current. The unbalance function models rotor heating from the difference between phase currents. The stall function models acceleration from elapsed time. None of them measures the thing it is protecting, and each therefore has a defined blind spot.

That is not a criticism — the models are good and inexpensive — but it is the key to diagnosis. **When a motor trips and nothing appears wrong, the useful question is not "why did the relay misbehave" but "which quantity did the model have to assume, and was the assumption true?"**

**Safety note.** This article covers protection engineering and diagnosis. Testing, insulation measurement and any work on motors or their circuits require isolation, proof of dead, discharge of stored energy where relevant, and awareness that rotating equipment may start on remote command. The hazard particular to protection work is the current transformer secondary: opening it while primary current flows develops a dangerous voltage across the break, so CT circuits are shorted before any relay is removed from service.

## What Each Function Detects — and What It Cannot See

| Function | Detects | Blind to |
| --- | --- | --- |
| Thermal overload | Sustained current above the thermal capability, integrated over time | Ambient temperature, loss of cooling, thermal history it did not observe, low-speed operation |
| Short circuit (instantaneous) | Very high fault current, immediately | Anything below its threshold; must be set above starting inrush |
| Earth fault | Current returning through earth, indicating insulation breakdown | Turn-to-turn faults that have not yet reached earth |
| Phase loss / unbalance | Difference between phase currents, and the resulting negative-sequence component | The cause of the unbalance — motor, supply or connection |
| Locked rotor / stall | High current persisting beyond expected acceleration time | Whether the cause is mechanical, electrical or a supply problem |
| Excessive starts | Count and spacing of starts against a permitted regime | The actual rotor temperature |
| Winding temperature (direct sensing) | Actual temperature at the sensor position | Hot spots away from the sensor; bearing condition |
| Undervoltage | Supply below a threshold | Whether the motor or the supply caused it |

**The pattern is worth stating explicitly: current-based protection infers heat, and inference fails when the relationship between current and heat changes.** That relationship changes with ambient temperature, with cooling airflow, with speed on a drive-fed motor, and with the fraction of current that is negative-sequence.

## The Thermal Model and Its Assumptions

The overload function maintains a thermal state — a running estimate of how hot the winding is, built from current history and a time constant chosen to represent the motor.

Three assumptions inside it are frequently untrue in service:

**Ambient temperature is as designed.** The model is calibrated around a reference. In a hot electrical room, on a hot machine platform, or beside a furnace, the winding starts warmer than the model assumes and reaches its limit at a lower current. Some relays accept an ambient input; most do not, and where they do it is often unconnected.

**Cooling is intact.** A blocked filter, a broken shaft fan, a fouled cooling jacket or a motor running at reduced speed on a drive all lower the cooling while the current stays the same. The model sees an unchanged current and infers an unchanged temperature — which is exactly wrong.

**The thermal state is continuous.** A relay that has been replaced, powered down or reset starts from an assumed state. A motor that has just made two heavy starts and then trips on the third is being protected correctly; a relay that lost its memory in between is not.

**Where these assumptions cannot be guaranteed, direct temperature measurement in the winding is the answer**, because it measures the quantity the model was trying to estimate. It is inexpensive on new machines, retrofittable on many, and it converts a class of unexplained failures into a measured value.

## Unbalance: A Rotor Problem That Looks Like a Stator Problem

Voltage unbalance is one of the most consequential and least visible influences on motor life.

**The mechanism.** An unbalanced three-phase supply can be decomposed into a positive-sequence set, which produces useful torque, and a negative-sequence set, which produces a field rotating against the rotor. That counter-rotating field appears to the rotor at close to double supply frequency, where the rotor's impedance is low — so a small negative-sequence voltage drives a disproportionately large negative-sequence current, and that current heats the rotor.

Two consequences follow that are worth internalising:

- **A small voltage unbalance produces a substantially larger current unbalance.** Measuring only the voltage and concluding "it is only a small percentage" understates the effect at the motor.
- **The heating is concentrated in the rotor**, which most protection cannot see directly and which no winding temperature sensor is measuring.

**Diagnostically, unbalance is a strong candidate whenever similar motors on the same duty behave differently**, because the supply is one of the few things that can differ between them. It is also a candidate whenever a motor's trips correlate with the operation of large single-phase loads elsewhere on the same supply.

**Phase loss is the extreme case.** With one phase open, a loaded motor may continue to turn while the remaining phases carry much higher current. Whether the thermal model catches it in time depends on loading and settings, which is why a dedicated unbalance and phase-loss function exists rather than relying on the overload alone.

## Starting, Stalling and the Cost of Repetition

Starting is the most thermally demanding thing a motor does. Current is high, and because slip is high, most of that energy goes into the rotor.

- **Locked rotor and stall protection** distinguishes "high current during a normal acceleration" from "high current that has not ended". The discriminator is time: an acceleration that exceeds its expected duration is a stall, whether the cause is a jammed load, a weak supply that cannot deliver torque, or a mechanical fault.
- **The instantaneous short-circuit setting must sit above starting inrush.** Set below it, the motor trips on every start and the setting is then usually raised until the trips stop — which may leave it above where it should be. The correct sequence is to set it from the fault study and the motor's inrush, not from trial.
- **Start counting and inhibit exist because rotor heat accumulates.** A motor that starts, trips on a process fault, is restarted immediately and trips again is being subjected to a duty the manufacturer's start regime probably does not permit. Where a process encourages repeated restarts, that regime has to be enforced in protection rather than in hope.

**A useful diagnostic distinction: trips during acceleration point at the load, the supply or the acceleration setting; trips during steady running point at loading, cooling, ambient or unbalance.** Which side of the start the trip falls on eliminates half the candidates.

## Insulation and Earth Faults

**Earth fault protection is the function most likely to catch a developing failure early**, because insulation degradation usually reaches earth before it becomes a phase-to-phase fault. Sensitivity matters: a core-balance measurement that encircles all conductors detects a small residual current directly, where deriving the residual from three separate phase measurements is limited by their accuracy.

**Insulation testing is a trend, not a verdict.** A single insulation resistance reading is a weak statement, because the value depends strongly on temperature and on moisture. What is genuinely informative:

- **The same test, at the same points, corrected for temperature, compared with the machine's own history.** A value that has halved over two years says more than any absolute figure.
- **Polarisation behaviour over time**, which distinguishes a clean-but-damp winding from a degraded one.
- **The pattern across phases**, since asymmetry points at a localised problem.

Insulation testing requires the motor isolated and the circuit discharged, and is performed under the site's procedures by qualified personnel.

## Mechanical Evidence and Where Protection Arrives Late

Electrical protection sees mechanical problems only through their electrical consequences, and usually late.

- **Bearing degradation** is detectable by vibration monitoring long before it is visible in current. By the time a failing bearing raises the motor's current measurably, the remaining life is short.
- **Misalignment and coupling problems** load the motor and can cause trips, while the motor itself is healthy.
- **Driven-equipment problems** — a partially blocked pump, a conveyor with a dragging idler, a fan with fouled blades — present as an overload trip on a motor that is behaving perfectly.
- **Rotor faults and air-gap eccentricity** have characteristic signatures in vibration and in the motor current spectrum, and are effectively invisible to protection until they become severe.

**The practical consequence: an overload trip is evidence that the motor is drawing more current than the model permits. It says nothing at all about whether the motor is the problem.** The most common expensive mistake in this field is replacing a motor whose only fault was doing what its load demanded.

**Where drive-fed motors are involved**, the low-speed cooling problem and the bearing-current mechanism belong to the companion articles on VFD selection and on VFD harmonics, EMC and motor cables. Both produce failures that look like motor quality problems and are not.

## Reading a Trip as Evidence

A trip is a data point, and modern protection relays record enough to make it a strong one. What to gather, before anything is reset:

| Evidence | What it distinguishes |
| --- | --- |
| Relay's stated trip cause | Which model reached its limit |
| Measured currents per phase at trip | Overload versus unbalance versus stall |
| Thermal state at trip, and before it | Whether the model was already accumulated from earlier events |
| Time from start to trip | A start problem versus a running problem |
| Voltage and unbalance at trip | Supply-side cause versus load-side |
| Trend of running current over weeks | A gradual mechanical change versus a sudden one |
| Number and timing of recent starts | Duty exceeding the permitted start regime |
| Ambient and cooling condition | Whether the thermal model's assumptions held |
| Process conditions at the time | Material, blockage, temperature, product change |
| Behaviour of similar motors on the same duty | Whether the cause is common or local |

**The last row is the highest-value comparison available.** Two identical motors on identical duty that behave differently differ in something — supply, cooling, mechanical condition, or setting — and enumerating what differs is usually faster than any measurement.

## Nuisance Trip or Real Trip?

The distinction matters because the responses are opposite: a real trip means something changed in the plant, and a nuisance trip means something is wrong with the protection's assumptions or settings.

| Observation | Interpretation |
| --- | --- |
| Trip on overload, recorded current within the normal band | The thermal model's assumptions failed — ambient, cooling, accumulated state — or the setting does not match the duty |
| Trip on overload, recorded current clearly elevated | A real load change: mechanical, process or supply |
| Trip on every start, normal running current | Acceleration time exceeds the setting, or the instantaneous setting is below inrush |
| Trips clustered in hot weather or one shift | Ambient or cooling |
| Trips on several motors simultaneously | Supply event, not the motors |
| Trips on one of several identical motors | Local: supply connection, cooling, mechanical condition, or that relay's settings |
| Trip immediately after a relay replacement | Settings not transferred, or thermal state reset |
| Trips increasing gradually over months | Progressive mechanical or insulation degradation |

**The rule underneath: never adjust a protection setting to stop a trip until the evidence shows the setting was wrong.** Raising a threshold that was correctly reporting a real condition removes the protection and leaves the condition.

## A Systematic Method

1. **Preserve the evidence.** Record the trip data before resetting. Once reset, the thermal state and often the recorded values are gone.
2. **Establish which side of the start the trip occurred on.** This halves the candidate list immediately.
3. **Compare with similar motors on the same duty.** Anything affecting several points at the supply; anything affecting one points locally.
4. **Check the thermal model's assumptions** — ambient, cooling, recent starts, whether the relay was reset — before questioning the motor.
5. **Separate electrical from mechanical** using the trend: a sudden change points at supply or process, a gradual one at mechanical degradation or insulation.
6. **Look at the driven equipment before the motor.** It is the more common cause and the cheaper thing to inspect.
7. **Change one thing and observe.** Two simultaneous changes make the result uninterpretable.
8. **Record the resolution** with the evidence, because the same motor will trip again in two years and someone else will be looking.

## Failure Modes

**Thermal setting made from nameplate current without checking service factor and duty.** Protection that is either too slow or nuisance-tripping.

**Ambient input available and not connected.** The model runs on a default that does not match the room.

**Cooling degradation unnoticed.** Filters, fan, cooling jacket — protection sees no change in current.

**Instantaneous setting raised until trips stopped.** Short-circuit protection now less sensitive than the study intended.

**Unbalance protection disabled to stop nuisance trips.** The rotor heating continues unmonitored.

**Insulation resistance judged on a single reading.** Both false alarm and false confidence are possible.

**Relay replaced without transferring settings.** Discovered at the first abnormal event.

**Trip data reset before it was recorded.** Every subsequent diagnosis starts blind.

**Motor replaced for a load fault.** The new motor trips on the same duty.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A power station has two identical cooling water pumps on identical duty, alternating weekly. Over several months, one of them trips on thermal overload with increasing frequency; the other never trips. The motor is replaced. The trips continue on the replacement.

The evidence collection is where the case turns.

The trip records show currents that are elevated but not dramatically so — and, decisively, **the phase currents are noticeably unequal.** The healthy pump's records show balanced currents at the same load. Both motors are mechanically sound and the pump duty is identical, so the difference lies neither in the motor nor in the load.

Measurement at the switchboard shows a voltage unbalance that is small in percentage terms, and it is larger when a nearby single-phase load is in service. The affected pump is supplied from a section of the board where that unbalance is more pronounced.

The mechanism completes the picture: the negative-sequence component drives a disproportionately large current in the rotor and heats it, while the stator current — the quantity the thermal model watches — rises only modestly. The relay is not misbehaving; it is protecting a motor that is genuinely running hotter than its stator current alone suggests, and the model's margin is being consumed by heating it cannot attribute.

**Replacing the motor could never have helped, because the motor was never the fault.**

The remediation is at the supply: rebalance the single-phase loading across phases, and where residual unbalance remains, ensure the unbalance protection is set to the motor's tolerance rather than disabled to stop the trips.

**The transferable lesson is the one the identical-pump comparison delivered for free: when two machines on the same duty behave differently, the difference is not in the machine that is failing — it is in whatever is not identical between them.**

## Recommended Practice

- Set thermal protection from the motor's actual thermal capability and its real duty, not from nameplate current alone.
- Connect an ambient temperature input where the relay supports it, or use direct winding temperature sensing where ambient and cooling cannot be guaranteed.
- Treat loss of cooling as a protection gap: current-based models cannot see it.
- Set instantaneous protection from the fault study and the motor's inrush, and never raise it merely to stop nuisance trips.
- Keep unbalance and phase-loss protection enabled and set to the motor's tolerance; do not disable it to suppress symptoms.
- Investigate voltage unbalance at the supply whenever similar motors on the same duty differ in behaviour.
- Enforce the permitted start regime in protection where the process encourages repeated restarts.
- Use sensitive earth-fault protection to catch insulation degradation before it becomes a phase fault.
- Trend insulation measurements with temperature correction; never judge on a single absolute value.
- Add vibration monitoring where bearing failure has real consequence; electrical protection arrives late for mechanical faults.
- Record trip data — cause, currents, thermal state, timing — before resetting anything.
- Compare against similar motors on the same duty as the first diagnostic step.
- Inspect the driven equipment before condemning the motor.
- Transfer and verify settings whenever a relay is replaced, and record them.
- Change one setting at a time and re-record the trip data afterwards, so the relay itself carries the evidence of what the change did.

## Conclusion

Motor protection works well and fails in predictable ways, and both facts come from the same source: it protects by modelling rather than by measuring. The overload function is a good estimate of winding temperature as long as ambient, cooling and thermal history behave as assumed, and it is quietly wrong when they do not. The unbalance function watches a stator quantity to infer rotor heating. The stall function watches a clock.

Diagnosis, therefore, is largely the discipline of asking which assumption failed — and the cheapest way to ask it is to compare the machine that trips with the one beside it that does not. Applied consistently, that habit prevents the most expensive outcome in this field, which is not a motor failure but a replaced motor that was never at fault, followed by the same trip on the new one.
