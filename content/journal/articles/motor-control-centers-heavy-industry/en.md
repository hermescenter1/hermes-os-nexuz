# Engineering Motor Control Centers for Heavy Industry

## Executive Summary

An MCC is usually procured as a product and should be engineered as a system interface. Almost every parameter that matters is set by something outside the cubicle: the fault level is set by the upstream transformer and network, the withstand duration is set by the upstream protection, the continuous rating is set by the process, and the effective device ratings are set by the temperature of the room it stands in.

That is why MCC problems so often appear years after commissioning without anything inside the assembly having changed. The assembly stayed the same; the system around it did not.

**Safety note.** This article discusses design and commissioning. Work on or near energised assemblies is for qualified personnel under the site's own safe-working rules; nothing here should be read as guidance for live working.

## Architecture and the Ratings That Follow From It

The structure is simple — incomer, busbar, outgoing units — and each part carries a rating that has to be justified against the installation rather than selected from a catalogue.

```text
      Upstream transformer / supply
                 |
        Incomer  |  protection, metering, isolation
                 |
   ==============|==============   main busbar
     |      |      |      |     |
    unit   unit   unit   unit  unit     withdrawable or fixed
     |      |      |      |     |
   motor  motor  feeder  VFD  heater
```

**Incomer.** Rated for the present maximum demand with defensible headroom, and protected such that its clearing time is compatible with everything downstream. Where two incomers and a bus coupler exist, the interlocking scheme is part of the design: an arrangement that permits two sources to be paralleled when the system was never designed for it is a fault waiting for a switching error.

**Busbar.** Two distinct short-circuit ratings apply and they are frequently conflated:

| Rating | What it represents | What it must be checked against |
| --- | --- | --- |
| Short-time withstand current | The r.m.s. current the busbar can carry for a stated duration without unacceptable damage | The prospective fault current at the MCC's terminals **and** the upstream protection's clearing time |
| Peak withstand current | The instantaneous peak the structure can survive mechanically | The peak associated with that prospective fault, which depends on the circuit's X/R |

**The point that gets missed: a withstand rating is meaningless without its duration.** An assembly rated for a given current for one second is not adequate on a system where upstream protection takes longer to clear. Both halves of the statement have to be verified together, and both are properties of the network rather than of the panel.

**Continuous rating and temperature.** The busbar's current rating is stated at a reference ambient. In a steel plant substation or a mining electrical room where the ambient sits well above that reference, the usable rating is lower — and so are the ratings of every device inside. Derating is not a refinement; it is the difference between a design that works and one that ages quickly and trips unpredictably.

## Internal Separation and the Availability Decision

The assembly standard defines forms of internal separation — degrees to which busbars, functional units and terminals are separated from one another by barriers. Higher forms cost more and buy two things: the ability to work on one unit while adjacent parts remain energised, and containment if something fails inside a compartment.

**The engineering question is not "which form is best" but "what do we intend to do while the MCC is live?"**

- If every maintenance action will be performed with the section isolated, a lower form may be entirely appropriate and the money is better spent elsewhere.
- If the process cannot tolerate isolating a whole section to change one starter, the higher form is buying availability, and that is a process decision rather than an electrical preference.

**Withdrawable versus fixed units follows the same logic.** Withdrawable units allow a functional unit to be removed and replaced without de-energising the busbar, which reduces both downtime and the time anyone spends working inside an assembly. Fixed units are less expensive and mechanically simpler, and they require the section to be isolated for most work.

Two practical points that decide whether withdrawable technology delivers its promise:

- **Interchangeability must be real.** A spare unit that has to be re-configured, re-wired or re-parameterised before it can go in has lost most of the availability benefit. Standardising unit types across the line-up is what makes a spares strategy work.
- **Racking discipline and interlocking.** The mechanism must prevent racking in or out under load and prevent access to live parts, and those interlocks are a commissioning check, not an assumption.

## Feeders, Starters and Coordination

Each outgoing unit is a small protection scheme: a short-circuit protective device, a switching device and an overload protection function.

**Coordination type is an explicit choice with consequences after a fault.** The device standards distinguish, at concept level, between:

- **Type 1 coordination** — after a short circuit the starter may be damaged; the requirement is that the fault is contained safely. The unit is repaired or replaced before returning to service.
- **Type 2 coordination** — after a short circuit the starter must remain suitable for further service, with only limited contact welding permitted.

The choice is not aesthetic. **Type 2 costs more and buys restart time**, which matters where a feeder outage stops production and the spare-unit strategy does not cover it. Type 1 is entirely defensible where a unit can be swapped quickly. What is not defensible is discovering after a fault which one was specified.

**Selectivity with the upstream device** determines whether a fault on one feeder takes out one motor or the whole MCC. It has to be verified against the actual devices and settings rather than assumed from device sizes.

**Starter technology** — direct-on-line, star-delta, soft starter, drive — is selected from the load and the supply, and each imposes different requirements on the MCC: physical space, heat dissipation, cable type and length, and control interfaces.

> Drive selection itself, and the harmonic and EMC consequences of installing drives in an MCC line-up, are treated in the companion articles on VFD selection and on VFD harmonics, EMC and motor cables.

## Control Supply and Behaviour on Restoration

The control supply is a small part of the bill of materials and a large part of the plant's behaviour.

**What must be decided explicitly:**

- **Source and protection.** A dedicated, protected supply, with the failure of one unit's control circuit not affecting others.
- **What happens when the control supply is lost.** Contactors drop out; the plant stops. That is usually correct and should be intentional.
- **What happens when it returns.** This is the safety-relevant one. **Motors must not restart automatically on restoration of supply unless the process has been specifically designed and assessed for it.** Unexpected restart of rotating equipment is a classic mechanism of harm, particularly where maintenance staff may be near equipment that stopped for reasons they did not investigate. The undervoltage or anti-restart function that prevents it is a design requirement, not an option, and its behaviour must be verified at commissioning.
- **Local control and lock-out.** Local stations must be able to take control and prevent remote starting. A local/remote selector that only advises the control system is not an isolation measure and must not be relied on as one.
- **Emergency stop architecture.** Its category, wiring and reset behaviour belong to the machine safety design and must be consistent across the line-up.

## Communicating Starters: Information Without Dependency

Modern starter units and protection relays communicate, and the benefits are real: reduced control cabling, remote reading of thermal state and trip cause, run hours, start counts and current profiles that feed condition monitoring.

**The design rule that keeps this an asset rather than a liability: the MCC must operate correctly with the communication network absent.** Protection, tripping and local control are hard-wired functions; the network carries information and non-critical commands. An architecture where a motor cannot be started because a network is down has converted an information system into a production dependency.

Two further points:

- **Trip cause and thermal state are genuinely valuable diagnostic data** — they distinguish an overload from a short circuit from an earth fault without anyone opening a compartment, and they turn "it tripped again" into evidence.
- **The communication path is an OT network with the same requirements as any other**, including segmentation and access control. An MCC network reachable from anywhere is an unnecessary exposure.

## Thermal Design and Environment

Heat is the parameter most often under-engineered and the one that produces the most confusing symptoms.

**Everything inside dissipates.** Busbars, breakers, contactors, drives, control transformers and — significantly in modern line-ups — variable speed drives, which dissipate a meaningful fraction of their throughput as heat. The enclosure has to remove that heat at the worst-case ambient, not the average one.

**Ambient is a site property, and it changes.** A room designed with ventilation that later has equipment added, or a cooling unit that degrades, raises the internal temperature of every device. The consequences appear as:

- Overload relays operating earlier than expected, because their characteristic is influenced by temperature.
- Reduced service life of contactors, electronics and insulation, appearing years later as an unexplained increase in failures.
- Nuisance trips clustering by time of day or season rather than by machine.

**Environment beyond temperature** shapes the specification: conductive dust in mining, corrosive atmospheres in petrochemical plants, humidity and condensation in unheated buildings, and vibration in material-handling structures. Enclosure protection ratings, filters, internal anti-condensation heating and gasket maintenance are all part of the design, and all of them degrade if nobody owns them.

## Arc Risk, at the Level This Article Can Usefully Address

The hazard of an internal arcing fault is a serious one and its mitigation is a specialist design activity. At the level of MCC engineering decisions, three principles matter and none of them involve working live:

- **Reduce exposure.** Withdrawable units, remote racking where available, and a design that allows most maintenance to happen with the section isolated all reduce the time anyone spends in front of an energised assembly.
- **Reduce clearing time.** The energy released depends on how long the fault persists. Protection settings and, where used, arc-detection systems that shorten clearing time reduce the consequence.
- **Design for containment.** Assemblies can be classified for their behaviour under an internal arcing fault; where that classification is required, it is a procurement specification, not something that can be added later.

Everything else belongs to the site's electrical safety rules, its risk assessments and its qualified personnel.

## Commissioning

Commissioning is where a documented design becomes a verified installation, and the checks that matter most are the ones that cannot be done later.

- **Protection settings against the study.** Every setting recorded, and compared against the coordination study that justified it. A study performed and never applied is a document, not a protection scheme.
- **Injection testing of protection functions** to confirm they operate as set, performed by qualified personnel under the site's procedures.
- **Interlock proving** — door interlocks, racking interlocks, incomer/coupler interlocks, local/remote. Each proved by attempting the prohibited action under safe conditions, not by reading the drawing.
- **Anti-restart behaviour verified** by removing and restoring the control supply, with the plant in a safe state.
- **Phase rotation and direction of rotation** confirmed for every drive before mechanical coupling where practicable.
- **Thermal survey under load**, after sufficient running time, to find loose connections and hot spots while they are still findable.
- **As-built documentation**: single-line diagram, unit schedule, protection setting record, cable schedule, and the interlock philosophy in a form a maintenance engineer can use at night.

## Failure Modes

**Withstand rating checked without its duration.** The assembly is nominally adequate and actually under-protected.

**Fault level changed upstream.** A transformer replacement or network reconfiguration raises the prospective fault above the assembly's rating; nothing inside the MCC changed.

**Ambient above the design reference.** Every device is derated in practice and nowhere on paper.

**Coordination type unspecified.** After a fault, nobody knows whether the starter is fit to return to service.

**Selectivity assumed from device size.** A feeder fault trips the incomer and stops the whole line-up.

**Automatic restart on supply restoration.** Rotating equipment starts while people are near it.

**Local/remote selector that only informs the control system.** Treated as an isolation measure; it is not one.

**Control on the communication network.** A network fault becomes an inability to start motors.

**Non-interchangeable spare units.** Withdrawable technology bought, availability benefit not realised.

**Filters and heaters unmaintained.** Dust and condensation do their work slowly and are diagnosed as component quality.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A mining site's conveyor MCC begins producing overload trips on several drives. The trips cluster in the afternoon and affect different conveyors on different days. Maintenance replaces two overload relays and inspects the motors, which show normal insulation resistance and no mechanical distress.

The evidence that reframes it comes from three observations taken together:

- The trips affect **multiple unrelated feeders**, which points at something they share rather than at the motors.
- The **measured motor currents at the moment of trip are within the normal running band** recorded when the plant was commissioned — the relays are operating on a load the motors have always carried.
- The trips **correlate with time of day**, peaking in the hottest part of the afternoon, and are absent at night.

Taken separately, each of these could be dismissed. Taken together, they identify a common-mode influence with a daily cycle, which in an electrical room means temperature.

Measurement in the room confirms it: the MCC's internal temperature is well above the ambient the assembly and its devices were specified for. One ventilation unit has failed, and two variable speed drives were added to the line-up eighteen months earlier without recalculating the heat load. The overload relays are not faulty; they are protecting according to a characteristic that is influenced by the temperature they sit in, and the motors are running at a load that is now closer to the trip threshold than it was.

The corrective actions are ordinary: restore and maintain the ventilation, recalculate the heat load including the added drives, and verify the derated ratings of the assembly and its devices against the actual worst-case ambient.

**The transferable engineering point is the one the evidence made unavoidable: nothing inside the MCC had changed, and the fault was not in any of the components that were replaced. The parameter that had changed — room temperature — was a design input that nobody re-checked when equipment was added.**

## Recommended Practice

- Verify short-circuit withstand as a pair — current *and* duration — against the prospective fault level and the upstream clearing time.
- Re-verify the assembly's ratings whenever anything upstream changes; the MCC's rating is fixed at purchase, the system's fault level is not.
- Derate the assembly and its devices to the real worst-case ambient, including future equipment.
- Choose the form of internal separation from what maintenance intends to do while the MCC is live, and record that intent.
- Standardise unit types so spares are genuinely interchangeable, or accept that withdrawable technology will not deliver its availability benefit.
- Specify coordination type explicitly per feeder, on the basis of restart time and spares.
- Verify selectivity against actual devices and settings, not device sizes.
- Design and verify anti-restart behaviour; never allow unexpected restart of rotating equipment on supply restoration.
- Ensure local control can prevent remote starting, and do not treat a selector as isolation.
- Keep protection, tripping and local control hard-wired; use communication for information and non-critical commands only.
- Treat the MCC communication network as an OT network, segmented and access-controlled.
- Include heat load, ventilation and filter maintenance in the design and in the maintenance plan, with an owner.
- Prove interlocks and anti-restart at commissioning by attempting the prohibited action under safe conditions.
- Record settings, as-built drawings and the interlock philosophy in a form usable during a night shift.

## Conclusion

An MCC is the point where the electrical system, the process and the maintenance strategy meet, and its most consequential parameters are set by all three rather than by the assembly itself. Fault level and clearing time come from the network. Continuous ratings and derating come from the room. Separation form and withdrawability come from what the plant intends to do while the busbar is live. Coordination type comes from how quickly a feeder must return to service.

Engineered that way, an MCC is a robust and long-lived asset that fails predictably and is repaired quickly. Procured as a catalogue item against a load list, it will work perfectly on the day it is energised — and will slowly become mismatched to a system that keeps changing around it.
