# Common Causes of Industrial Motor Failure

## Executive Summary

An induction motor is a simple, robust machine that fails for a small number of well-understood reasons. The reasons are thermal, mechanical, electrical and environmental, and they share one property that dominates every maintenance discussion: **the cause almost always originates outside the motor.**

A motor that overheats is usually being asked to do more than its cooling allows. A bearing that fails early is usually reacting to alignment, lubrication practice, belt tension or an electrical path that should not exist. A winding that fails is usually recording, in its own burn pattern, an event in the supply or the process.

> The companion article on motor protection and failure diagnostics addresses the other half of this subject: what each protection function measures, what it must assume, and how to read a trip as evidence. This article is about the physical mechanisms and the lifecycle decisions behind them.

**Safety note.** Failure investigation involves isolation, proof of dead, and equipment that may be hot, energised from a drive's stored energy, or able to start on remote command. Insulation testing requires the motor disconnected and discharged. All such work is for competent personnel under the site's procedures.

## Temperature Is the Master Variable

Insulation does not fail suddenly; it ages, and its ageing rate is governed by temperature.

**The engineering rule of thumb used across the industry is that insulation life is roughly halved for each sustained temperature rise of about 10 K above the rating.** It is an approximation derived from chemical ageing behaviour, and its value is not the precise number but the shape: **overheating does not cost a proportional amount of life, it costs an exponential amount.** A motor running continuously a little above its thermal class does not fail next week; it fails in a fraction of the years it should have lasted, and the connection to the cause is lost by then.

Everything in the following two sections is, ultimately, a mechanism for raising winding temperature.

## Electrical Mechanisms

**Sustained overload.** The obvious case, and less common than expected as a primary cause, because protection usually catches it. Its more damaging form is *marginal* overload: a machine running a few percent above rating for years, within the protection's tolerance, ageing steadily.

**Voltage unbalance.** An unbalanced supply produces a negative-sequence component whose field rotates against the rotor, appearing to the rotor at close to double supply frequency where its impedance is low. A small voltage unbalance therefore produces a much larger current unbalance and disproportionate rotor heating. What matters at the lifecycle level is where the unbalance comes from:

- Single-phase loads distributed unevenly across the three phases.
- A failed element or blown fuse in one phase of a capacitor bank.
- A high-resistance connection — a corroded lug, a loose terminal, a partially failed contactor pole.
- Unequal transformer tap settings on parallel sources.
- Supply unbalance arriving from the network itself.

**These are all findable and correctable.** Unbalance is one of the few motor-life factors that a survey of the switchboard can resolve permanently.

**Single-phasing.** The lifecycle question here is not whether protection catches it, but what it does to the machine while it lasts: the winding that carries the redistributed current heats far faster than the others, so the damage is concentrated rather than general. That asymmetry is why the burn pattern identifies this cause afterwards, as described in the evidence section below — and why a machine that survived a brief event may still have lost insulation life in one phase only.

**Over- and under-voltage.** Sustained overvoltage increases core losses and heating; undervoltage increases current for the same load torque. Both age insulation, and both are supply-side findings rather than motor faults.

**Repeated starting.** Starting is thermally expensive and the heat goes predominantly into the rotor. Repeated starts accumulate rotor temperature faster than it dissipates, and in larger machines the resulting thermal cycling stresses the rotor bars and their joints. A process that responds to a trip by restarting immediately, several times, is applying a duty the machine was probably never specified for.

**Drive-related electrical stress.** A motor fed from a variable-speed drive acquires three additional ageing mechanisms: steep-fronted voltage concentrating stress on the first turns, common-mode current finding a path through the bearings, and self-cooling that falls with speed while the load torque may not. Each is examined in its own right elsewhere in this series. What belongs here is the lifecycle observation: all three are consequences of decisions made when the drive was specified, and all three surface years later looking like poor motor quality.

## Thermal and Environmental Mechanisms

**Cooling obstruction is the quiet killer.** A totally enclosed fan-cooled motor depends on air moving across its finned housing. Process dust packed between the fins, a fouled or partly blocked cooling path, a damaged or missing fan cowl, or a fan blade broken away all reduce heat removal while the electrical loading is unchanged. Current-based protection sees nothing, because the current has not changed.

**Recirculation is a subtler version.** A motor placed close to a wall, in a corner, or inside an enclosure added later may be drawing in the warm air it has just expelled. The motor is clean, the fan is intact, and it still runs hot.

**High ambient temperature.** Motors on hot machine platforms, near furnaces, in unventilated pits or in electrical rooms whose cooling has degraded start each thermal cycle from a higher baseline.

**Altitude** reduces cooling air density and requires derating; where a design is transferred between sites at different elevations, this is easily missed.

**Moisture and condensation.** A motor that is stopped for long periods in a humid environment breathes as it cools, drawing in moist air that condenses inside. Anti-condensation heaters exist for this reason, and are frequently found disconnected. The damage appears as reduced insulation resistance and, eventually, a failure shortly after a restart.

**Contamination.** Conductive dust, carbon, metallic particles, oil mist and process chemicals all attack insulation or provide tracking paths. Washdown environments introduce the additional problem of water forced past seals under pressure.

## Mechanical Mechanisms

Bearings account for a large share of failures by count, and their causes are almost entirely maintenance and installation practice.

**Lubrication is the leading contributor, and over-greasing is at least as common as under-greasing.** Excess grease in a bearing cavity churns rather than lubricating; churning generates heat; heat degrades the grease; degraded grease stops lubricating. The failure looks like a lubrication failure, and it was caused by more lubrication.

Related lubrication faults:

- **Mixing incompatible greases**, which can produce a mixture that separates or hardens.
- **Wrong grease specification** for the temperature, speed or load.
- **Contaminated grease** introduced by dirty equipment or an unclean fitting.
- **Blocked relief paths**, so grease is forced along the shaft into the winding instead of out of the drain.

**Misalignment** loads the bearings continuously in a direction they were not selected for, and it also loads the driven machine's bearings. Its signature is directional and it is detectable by vibration long before failure.

**Belt tension.** Over-tensioning to stop slip is a standard field response and a standard cause of premature bearing failure on the drive end.

**Axial thrust** transmitted from the driven machine — from a pump's hydraulic thrust, a fan's pressure, or a coupling installed without allowance for thermal growth.

**Vibration from the driven equipment**, which the motor's bearings experience as a load they were not sized for.

**False brinelling** in machines that stand idle while adjacent equipment vibrates: the rolling elements fret against the raceway at a fixed position without a lubricating film being formed. It is a specific hazard for standby and stored motors.

**Electrical erosion of bearings** on drive-fed machines, producing the characteristic fluted raceway pattern discussed in the companion article on VFD harmonics, EMC and motor cables.

## Process-Driven and Lifecycle Causes

Some failures are correctly attributed to the motor only in the sense that the motor is where the consequence appeared.

- **A process change** — a denser material, a higher throughput, a different product — raises the load torque, and the motor that was correctly specified is now marginal.
- **Worn driven equipment** increases torque demand gradually: a pump with increased internal clearances, a conveyor with dragging idlers, a fan with fouled blades, a gearbox with degraded bearings.
- **A partially blocked system** raises load or, for a centrifugal machine, moves the operating point in a way that changes both load and cooling.
- **A control philosophy that starts and stops frequently** where the original design assumed continuous running.
- **Replacement with a nominally equivalent motor** of a different frame, efficiency class or cooling arrangement, which changes the thermal behaviour of a machine everyone believes is unchanged.

**The maintenance implication: whenever a motor fails a second time in the same position, the investigation should be about the position, not the motor.**

## Reading the Failed Machine

The failed motor carries evidence of what happened, and most of it is destroyed by the removal and rebuild if nobody records it first.

| Observation | What it suggests |
| --- | --- |
| Symmetrical darkening or burning across all three phases | General thermal ageing or overload; check cooling, ambient, loading |
| One phase burned, other two comparatively clean | Single-phasing while running |
| Damage concentrated at the coil ends and first turns | Voltage-surge or drive-related steep-front stress |
| Localised burn within one coil, rest of winding sound | Turn-to-turn insulation failure, often mechanical or contamination-initiated |
| Damage at the slot exit or where the winding leaves the core | Mechanical movement, vibration, or loose wedging |
| Rotor bar discoloration, cracked joints, end-ring damage | Repeated or prolonged starting; high-inertia acceleration |
| Grease darkened, hardened or carbonised in the bearing cavity | Over-greasing and churning, or wrong specification |
| Fluted or washboard pattern on the raceway | Electrical bearing current erosion |
| Raceway marks at fixed spacing without rotation | False brinelling from vibration while stationary |
| Directional bearing wear, one side loaded | Misalignment or belt over-tension |
| Water, product or dust ingress inside the frame | Sealing, washdown practice or environmental protection |
| Fins packed, cowl missing, fan damaged | Cooling obstruction — check the current record; it will look normal |

**What to record before the machine is dismantled:**

- Which bearing failed — drive end or non-drive end. This alone separates several mechanisms.
- Photographs of the winding and both bearing cavities before cleaning.
- The protection's trip record and the currents at trip, if the machine tripped.
- Run hours, start count, and any recent change to process, control or maintenance.
- Ambient conditions and the state of the cooling path *as found*.
- Insulation resistance before any cleaning or drying, with temperature noted.

**A rebuilt motor with no record is a failure that will repeat**, because nothing was learned and the upstream cause is still present.

## Maintenance That Actually Extends Life

The interventions with the strongest effect are unglamorous and cheap.

- **Keep the cooling path clear.** Cleaning fins and checking the fan and cowl is the highest-value routine task on a dusty site, and it addresses a mechanism protection cannot see.
- **Lubricate to specification — quantity and interval — and treat over-greasing as a fault.** Where automatic lubricators are used, verify their delivery rate rather than assuming it.
- **Align properly and re-check after thermal growth**, and control belt tension to specification rather than by feel.
- **Trend vibration** where the consequence justifies it; bearing degradation is detectable long before it is electrically visible.
- **Trend insulation resistance with temperature correction**, comparing the machine against its own history rather than an absolute value.
- **Keep anti-condensation heaters working**, and verify them — they are commonly found disconnected after maintenance.
- **Survey the switchboard for unbalance** periodically; it is a supply-side fix with a plant-wide benefit.
- **Record the start count** where the process encourages restarts, and enforce the permitted regime in protection.
- **Store spare motors properly** — dry, with shafts periodically rotated, away from vibrating equipment.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A steel rolling mill experiences a rise in motor bearing failures across one line. Over eighteen months, five motors of similar size fail with non-drive-end bearing damage. The motors are rebuilt, the bearings replaced with the same specification, and the failures continue.

```text
Symptom:
Repeated non-drive-end bearing failures on multiple motors of one line.

Evidence:
- failures began roughly a year after a revised lubrication programme
  increased greasing frequency on this line
- motors on an adjacent line, not included in the revised programme,
  show no change in failure rate
- recovered grease is darkened and hardened, and the bearing cavities
  are full rather than partially filled
- bearing temperatures, where recorded, ran above their previous values
  before each failure
- alignment records are within tolerance and unchanged
- vibration spectra show bearing deterioration developing over weeks,
  not a sudden mechanical event
- motor currents are normal throughout, and no protection operated
  until the bearing seized

Reasoning:
The failures correlate with a maintenance change rather than with a
process or electrical change, and the adjacent line acts as a control
group. Excess grease in the cavity churns instead of lubricating, which
raises temperature, which degrades the grease, which removes the
lubricating film. The evidence — full cavities, degraded grease, rising
temperature, gradual vibration development — matches that mechanism and
does not match misalignment, electrical erosion or contamination.

Next investigations:
- manufacturer's grease quantity and interval for these bearing sizes
- actual delivered quantity per event, including automatic lubricators
- whether grease relief paths are clear
- whether the grease specification was also changed
- bearing temperature trending as a routine measurement on this line
```

The correction is to return to the manufacturer's quantity and interval, verify relief paths, and treat bearing temperature as a monitored value. The wider lesson is uncomfortable and worth stating: **the failures were caused by a maintenance improvement, and the improvement was made in good faith by people trying to prevent exactly this failure mode.** Only the comparison with the untouched line made the cause visible.

## Failure Modes of the Investigation Itself

**Motor replaced, cause not sought.** The second failure arrives on schedule.

**Machine cleaned before it was photographed.** The burn pattern — the single most informative artefact — is gone.

**Insulation tested after drying.** The reading describes the workshop, not the failure.

**Only the motor examined.** The driven machine, the supply and the cooling path are where the cause usually is.

**Bearing failure attributed to bearing quality.** Multiple failures in the same position are a design or practice finding, not a supplier finding.

**Trip data reset before recording.** The electrical history of the failure is unavailable.

**No comparison group considered.** Similar machines on similar duty are the cheapest experiment available.

## Recommended Practice

- Treat temperature as the primary life variable, and remember that overheating costs life exponentially rather than proportionally.
- Survey and correct supply unbalance at the switchboard; it is a permanent, plant-wide improvement.
- Inspect and clear cooling paths routinely; current-based protection cannot detect their obstruction.
- Check for recirculation where motors sit in corners, pits or added enclosures.
- Lubricate to the manufacturer's quantity and interval, verify automatic lubricator delivery, and keep relief paths clear.
- Align to specification, re-check after thermal growth, and tension belts to specification rather than by judgement.
- Keep anti-condensation heaters functional and verify them after maintenance.
- Trend vibration and temperature-corrected insulation resistance against each machine's own history.
- Count starts as a monitored quantity, and treat a machine whose restart history exceeds the manufacturer's regime as an operating problem rather than a motor one.
- Record the position's history, not just the motor's; a second failure in the same position is an investigation of the position.
- Photograph and record the failed machine before cleaning or dismantling, including which bearing failed.
- Store and rotate spare motors properly, away from sources of vibration.

## Conclusion

Motors fail for a short list of reasons, and nearly every one of them is a consequence of a decision made somewhere else: how the machine is cooled, how the supply is balanced, how it is lubricated and aligned, how often the process restarts it, and whether the equipment it drives has quietly become harder to turn.

That is why the most useful diagnostic habit in this field is refusing to treat a motor failure as a motor problem until the evidence says so. The failed machine will tell you a great deal — the burn pattern, the bearing, the grease, the state of the fins — provided somebody looks before it is cleaned, and provided the investigation extends to the position rather than stopping at the part number.
