# UPS and Critical Power Architecture for Automation Systems

## Executive Summary

Critical power for an automation system fails in a characteristic way, and it is almost never the way people prepare for. The battery is the component everyone watches, budgets for and replaces on a schedule. The architecture is the component that decides whether any of that mattered.

Three failures dominate industrial experience. **The critical load was defined by cabinet rather than by signal path**, so the PLC survived the outage and the network switch between it and the control room did not. **The system had no way to be maintained**, so battery replacement required a plant shutdown that was deferred until the batteries were beyond use. And **the system spent months in a state where it offered no protection at all** — sitting on bypass, front panel amber, alarm contact terminated in a marshalling box and never mapped into anything that a human being reads.

This article treats critical power as an architecture: what the topology classes actually promise, why "bypass" names three different things, how to classify load by consequence rather than by convenience, how to derive autonomy from a requirement instead of from a catalogue, what battery ageing evidence is worth collecting, how a UPS and a generator interact, and what redundancy does and does not buy. The general earthing rules referenced throughout are set out in the companion article on industrial earthing; this article covers only the parts specific to a critical supply.

**Safety boundary.** UPS systems retain stored energy after the input is isolated: the battery is a live source that no upstream breaker disconnects, and DC fault energy at a battery string is substantial. Battery replacement, bypass switching and discharge testing are each governed by the manufacturer's instructions and by the plant's permit and isolation regime, and none of them is undertaken outside those. Nothing here is a procedure for working on a live system.

## Topology: What the Classification Actually Promises

IEC 62040 classifies UPS by how far the output is decoupled from the input, and the classification is a statement about dependency rather than about quality.

| Class | Output relationship to input | Behaviour on a supply disturbance |
| --- | --- | --- |
| **VFI** (voltage and frequency independent) | Output independent of input voltage *and* frequency | The inverter already feeds the load; a mains failure changes only where the inverter's energy comes from |
| **VI** (voltage independent) | Output voltage conditioned, frequency follows input | Regulates voltage variation; the load follows input frequency |
| **VFD** (voltage and frequency dependent) | Output follows the input within limits | Passes disturbances through until it transfers |

**For automation loads, the relevant class is normally VFI**, and the reason is worth stating precisely: because the inverter is already supplying the load continuously, there is no transfer event when the mains fails. The load never sees a break, a phase discontinuity or a frequency step. A system that must *transfer* on loss of supply has a transfer time, and whether that time matters depends on the hold-up capability of every power supply behind it — which is a specification nobody has for the whole population of devices in a plant.

**The distinction that follows from this is the one that governs the rest of the design: a VFI system has no transfer when the mains fails, but it does have a transfer when the inverter itself cannot support the load.** That transfer is the static bypass, and everything about it is a design decision.

## Three Things Called "Bypass"

Conflating these is the single most common architectural misunderstanding in critical power.

**The static bypass** is an automatic, fast electronic transfer that moves the load from the inverter to the raw bypass supply when the inverter cannot support it — an overload beyond the inverter's capability, an inverter fault, an over-temperature condition. It is a protective feature: it keeps the load energised at the cost of the conditioning.

Two properties of the static bypass are routinely missed. **It requires the inverter to be synchronised to the bypass source**, because transferring between two unsynchronised sources would impose a phase step on the load. If the bypass source is outside the synchronisation window — wrong frequency, wrong voltage, absent — the transfer is unavailable, and the UPS will drop the load rather than transfer to a source it cannot join. **And it requires the bypass source to exist**, which brings the second point: if the bypass feed and the rectifier feed come from the same upstream breaker, an upstream trip removes both, and the "bypass" is not an independent path at all.

**The maintenance bypass** — also called a wrap-around bypass — is a manual, mechanically interlocked arrangement that allows the entire UPS, including its static switch and its internal busbars, to be isolated for service while the load continues to be fed from the mains. It is not a protective feature; it is a *maintainability* feature, and its absence has a very specific consequence: **a UPS without a maintenance bypass cannot have its batteries replaced, its fans changed or its capacitors serviced without dropping the load it exists to protect.**

That consequence compounds over time. Maintenance requiring a plant shutdown gets deferred. Deferred long enough, the batteries reach a state where the system would not carry the load anyway — and the first proof of that is an outage.

**The external bypass supply** is the question of *where the bypass power comes from*, and it deserves its own decision. A separate feed from a different board, ideally from a different upstream device, converts the bypass from a shared-fate path into a genuinely alternative one.

**Design rule:** specify the static bypass, the maintenance bypass and the bypass source as three separate items, and confirm each one is present on the single-line diagram before the order is placed. Retrofitting a wrap-around panel into a live installation is an expensive and disruptive project.

## Load Classification: By Signal Path, Not by Cabinet

This is the section that prevents the failure in the scenario at the end of this article.

**Classify by the consequence of losing the load, not by the equipment's category:**

| Class | Consequence of loss | Typical provision |
| --- | --- | --- |
| **Critical** | Uncontrolled process behaviour, loss of view or loss of control | UPS with autonomy covering the required action |
| **Essential** | Production loss with a long or costly restart | Generator-backed, sometimes UPS for the transfer gap |
| **Normal** | Inconvenience, restart is cheap | Ordinary supply |

**The classification must follow the function, and functions run across cabinets.** A control system's availability is set by the least-backed element in its path. Working through that path produces a list that surprises people every time it is done honestly:

- PLC CPUs, racks and I/O power supplies
- Control-circuit supplies and the DC power supplies feeding them
- **Network switches, media converters and fibre transceivers on every hop between controller and server** — routinely fed from whatever socket was nearest
- SCADA servers, historians and the domain or authentication services they depend on
- Operator workstations and the displays that make "loss of view" a real category
- Field instrument power, where transmitters are loop-powered from an I/O card or from a separate field supply
- Solenoid supplies, where the process safety position depends on a valve moving rather than staying put
- Telemetry and remote-site links, whose remote end is on somebody else's power

**Two exclusions matter as much as the inclusions.** Safety-related systems are not made adequate by being put on a UPS: their power supply arrangement follows from their own functional safety design, and their behaviour on loss of supply is specified as part of the safety function, not inherited from the general electrical design. And **loads with large inrush or large steady demand do not belong on a critical supply at all** — motors, heaters, welding sockets, and the general-purpose socket circuit into which somebody will eventually plug a vacuum cleaner. Inrush on a UPS output does not trip a breaker gracefully; it drives the UPS to static bypass, which is exactly the state in which the protection you paid for is absent.

**The deliverable is a load classification schedule** — a document that lists every circuit, its class, its supply source and the function it serves. A plant with a cable schedule and no load classification schedule will, over years of small changes, migrate circuits between supplies for reasons of convenience, and nobody will notice until an outage audits the result.

## Autonomy Is a Requirement, Not a Battery Size

**Autonomy should be derived from what has to happen during the outage.** The candidate requirements are genuinely different from one another:

- **Ride through short interruptions** — sized from the measured outage profile of the site, not a round number.
- **Bridge to the generator** — sized from the generator's worst-case start-and-stabilise time, plus the transfer, plus a margin for a failed first start attempt.
- **Perform an orderly shutdown** — sized from the actual time the process needs to reach a safe state, measured rather than estimated.
- **Sustain a manual intervention** — sized from how long it takes a human being to arrive and act, which at night on a remote site is a different number from the one assumed in the office.

Three corrections apply to almost every sizing calculation seen in the field:

**Size at the actual load, but design for the future load.** Autonomy scales inversely with load; a UPS at a fraction of its rated load has far more autonomy than the datasheet figure, and everyone is delighted until the load grows.

**Size at end-of-life capacity, not new capacity.** A battery's usable capacity declines throughout its life, and manufacturers define an end-of-life criterion below which the battery is considered expended. A design that only meets its autonomy requirement with new batteries meets it for a fraction of the replacement interval.

**Size at the actual ambient.** Battery capacity and battery life both depend on temperature, and a battery room that runs warm delivers both less capacity now and a shorter life overall.

## Battery Ageing: What the Evidence Is Worth

**Float voltage tells you almost nothing about capacity.** A string sitting at the correct float voltage can be substantially degraded, because float voltage is a statement about the charger, not about stored energy. Systems that report "battery OK" on this basis are reporting on the charger.

**Internal impedance or conductance trending is a screening indicator.** Measured consistently on the same blocks with the same instrument, a rising trend identifies degrading blocks before they fail, and identifies outliers within a string. It is a comparative measurement — its value is in the trend and in the spread across the string, not in an absolute number.

**A discharge test is the only direct measure of capacity**, and it is also the test that is avoided, because performing it means the system is not protecting anything while it runs. That is precisely why it should be planned rather than improvised: performed on the maintenance bypass, at a chosen time, with the discharge recorded so the result becomes a trend rather than a pass/fail.

**A string is a series circuit**, which has a blunt consequence: the weakest block determines the string. One block that has lost capacity limits the autonomy of the whole string regardless of the condition of the others, and one block that has failed open removes the string entirely. This is why block-level monitoring, where it exists, is worth more than string-level monitoring, and why the spread across a string is a more useful number than its average.

**Chemistry sets the maintenance regime, not the design intent.** Valve-regulated lead-acid batteries are compact and low-maintenance but sensitive to temperature and capable of thermal runaway; vented lead-acid batteries last longer but require a ventilated room and electrolyte attention; lithium-based systems offer higher density and better temperature tolerance but bring a battery management system that is part of the safety case and different fire, storage and transport considerations. **Each of these is a different maintenance and facilities commitment**, and the choice should be made with the people who will actually maintain it.

## DC Systems Where They Apply

In substations and in parts of many process plants the critical supply is not an AC UPS at all but a DC system — a battery, a charger and a DC distribution board feeding switchgear trip and close coils, protection relays, and some control and emergency lighting.

Three characteristics distinguish it from an AC UPS and are worth stating explicitly:

**The DC system is normally unearthed**, with continuous insulation monitoring. A first earth fault is alarmed rather than tripped, exactly as in an unearthed AC system, and for the same reason: continuity of the protection supply matters more than clearing a single fault.

**A second earth fault on a DC system can operate a trip coil.** If one earth fault exists on one pole and a second appears on the other side of a trip circuit, the fault path can energise the coil — an unwanted operation with no command behind it. **This makes an unrepaired first earth fault on a station DC system a materially different situation from an inconvenience**, and it is the reason insulation monitoring on these systems is a protection function rather than a housekeeping aid.

**The charger is sized for the standing load plus the battery recharge**, not for the load alone. A charger sized only for the load will recover the battery slowly or not at all after a discharge, leaving the system without autonomy for a period nobody has calculated.

## Generator Interaction and Transfer Behaviour

The UPS and the standby generator form one system, and the interface between them is where a great deal goes wrong.

**The intended sequence:** mains fails; the UPS carries the load from battery without a break; the generator starts and stabilises; the transfer switch changes the supply over; the UPS rectifier restarts on generator power and begins recharging.

**The mechanisms that break it:**

- **The rectifier is a step load and a non-linear load to the generator.** A generator sized on steady kilowatts may be unable to accept the UPS rectifier's demand as a step, or may suffer voltage regulation problems from its harmonic current. **Rectifier walk-in** — a controlled ramp of the input demand — exists for exactly this reason and should be enabled and its ramp time coordinated with the generator's capability.
- **Generator frequency wanders more than mains frequency.** If it wanders outside the UPS's bypass synchronisation window, **the static bypass becomes unavailable while the plant is on generator** — which means that during the period of highest risk, an overload or an inverter fault drops the load instead of transferring it. Widening the sync window where the connected equipment tolerates it, and specifying the generator's frequency stability against the UPS's window, are both design actions.
- **The transfer switch operation is itself a break** that the UPS must ride, and a retransfer to mains is a second one.
- **The battery may not be recharged** before the next event if the outage profile is a series of interruptions rather than one long one.

**None of this is verifiable from datasheets.** It is verified by running the plant on generator, at load, with the UPS in circuit, and observing what the UPS does — which is a commissioning test that takes an afternoon and is skipped more often than any other.

## Redundancy, and the Property It Is Not

| Arrangement | Protects against | Does not protect against |
| --- | --- | --- |
| **Module redundancy (N+1)** | Failure of one power module | Common battery string, common static switch, common output stage, common bypass, common upstream supply |
| **System redundancy (parallel units)** | Failure of one complete UPS | A common output board or a common downstream distribution point |
| **Dual path (A and B supplies)** | Failure of a whole distribution path | Single-corded loads, which see only one path |

**N+1 is a statement about modules, and the interesting failures are usually not in the modules.** A frame with redundant modules but one battery string, one static bypass and one input breaker has one of each of those, and the redundancy addresses none of them.

**Dual-path architectures are limited by the loads.** A dual-corded server benefits; a single-corded switch, controller or instrument power supply does not, unless a static transfer switch is provided at the load to select between the two paths. An audit of single-corded equipment on a dual-path system is a short, cheap and frequently alarming exercise.

**Concurrent maintainability is a different property from fault tolerance.** Fault tolerance asks: can the system survive a component failing? Concurrent maintainability asks: can any component be taken out of service deliberately, for maintenance, without dropping the load? A system can be fault-tolerant and not concurrently maintainable, and such a system quietly accumulates deferred maintenance.

## Earthing at the Boundary

The general rules belong to the earthing article; two points are specific to a UPS and are frequently wrong.

**Whether the UPS output is a separately derived system determines where the neutral-to-earth relationship is established.** Some configurations pass the source neutral through; others establish the output as a separately derived system with its own bond. Getting this wrong produces either an output with no defined earth reference or a second neutral-earth bond with circulating current in the protective system — which appears, as it always does, as an unexplained noise problem rather than as an electrical alarm.

**The earthing arrangement of the load must not change when the UPS transfers.** A load that is earthed one way on inverter and another way on bypass has a fault-protection arrangement that depends on the UPS's internal state, which is not a design anyone would write down deliberately.

## Monitoring: The State That Matters Most Is the One Least Alarmed

Acquire, at minimum, into a system a human being actually watches: operating mode (inverter, battery, static bypass, maintenance bypass), battery voltage and current, battery temperature, block impedance where available, per-phase load, remaining autonomy estimate, and the alarm history.

**"On bypass" is the most important state and the most commonly unmonitored.** A UPS on static bypass is passing raw mains to the critical load. It is not protecting anything. It has no autonomy. And from outside the room it looks exactly like a healthy installation. A site that cannot detect this state from the control room does not know whether it currently has a UPS.

**An alarm contact that terminates in a marshalling box is not monitoring.** The evidence path has to end at a person or at a system that escalates to one.

## Commissioning

- **Measure the actual load** and compare it with the design assumption, per phase.
- **Execute the maintenance bypass procedure**, at a time when doing so is safe, and confirm it works as written — the procedure is not proven until somebody has followed it.
- **Perform a discharge test at the design load** and record the autonomy achieved; this becomes the baseline every future test is compared against.
- **Force a transfer to static bypass and back**, and observe the load.
- **Run the site on generator, at load, with the UPS in circuit**, and confirm the rectifier restarts, the walk-in behaves, and the bypass remains synchronised.
- **Prove the alarm path end to end**, from the UPS contact or protocol interface to the control room display.
- **Record the battery installation date and the baseline impedance readings** — a trend that starts three years after installation has lost its most useful reference point.

## Failure Modes

**Critical load defined by cabinet, not by signal path.** The controller survives; the network switch does not; the plant loses view anyway.

**No maintenance bypass.** Battery replacement requires a shutdown, so it is deferred, so the batteries fail.

**Bypass supply from the same upstream breaker as the rectifier.** The "alternative" path shares its fate with the primary one.

**UPS left on static bypass for months.** No protection, no autonomy, and no indication anywhere a person looks.

**Alarm contact terminated but never mapped.** The evidence exists and reaches nobody.

**Autonomy sized on new-battery capacity at rated ambient.** The requirement is met for a fraction of the battery's life.

**Autonomy sized on today's load.** The margin evaporates as the plant grows, and nobody recalculates.

**Battery health assessed from float voltage.** A statement about the charger, mistaken for a statement about capacity.

**Discharge test never performed because it is disruptive.** Capacity is unknown until an outage measures it.

**One weak block in a string treated as one bad battery.** It limits the whole string's autonomy.

**Generator not tested with the UPS in circuit at load.** Rectifier step load, harmonic interaction and bypass synchronisation all unverified.

**Bypass sync window incompatible with generator frequency stability.** Static bypass unavailable exactly when the plant is most exposed.

**N+1 modules with a single battery string, static switch and input breaker.** Redundancy for the component least likely to be the problem.

**Dual-path distribution feeding single-corded equipment.** Two paths, one inlet, no benefit.

**Motor, heater or socket circuits placed on the critical supply.** Inrush drives the UPS to bypass.

**Neutral-earth arrangement different on inverter and on bypass.** Fault protection that depends on the UPS's internal state.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A water treatment site has ridden out mains interruptions without incident for years. During a routine outage, the control system is lost: operators lose all visibility, an automatic sequence halts part-way, and recovery takes several hours. The UPS is examined and found to be in perfect health — its log shows a clean transfer to battery and a full carry through the outage with capacity to spare.

```text
Symptom:
Total loss of control-room visibility and a halted sequence during a mains
outage, despite a UPS that carried its load correctly throughout.

Evidence:
- the UPS event log records a clean transition to battery, no alarms, and
  substantial remaining autonomy at the end of the outage
- the PLC and the SCADA servers both remained powered and running; neither
  logged a power event
- the two network switches linking the field PLC panel to the server room
  are fed from a small distribution board that is not on the UPS
- those switches were originally fed from a UPS-backed socket in the server
  room and were moved during a cabinet rationalisation two years ago
- the change is recorded as a revision to a cabling drawing; there is no
  load classification schedule against which it could have been checked
- the UPS per-phase load reading fell after the move and was never queried
- separately: the UPS "on static bypass" signal is a volt-free contact
  terminated in a marshalling box, and it is not mapped to any input
- the site has no record of the UPS ever having been on bypass, and also no
  means of knowing whether it has

Reasoning:
Two independent findings, one active and one latent. The active one is an
architecture error rather than an equipment failure: the availability of a
control system is set by the least-backed element in its signal path, and a
network switch is part of that path. Because the site classifies loads by
cabinet rather than by function, the switches were moved as a cabling
decision, and nothing in the site's documentation was capable of flagging
that a critical path had been broken. The falling UPS load was the visible
symptom of the change and was read as good news.

The latent finding is more serious in the long run. The site cannot detect
the one state in which the UPS provides no protection at all. A UPS sitting
on static bypass looks healthy from every angle except its own front panel,
and this site has no path from that panel to a human being.

Next investigations:
- trace the full signal path from each critical controller to the control
  room and to any remote link, and list every powered element on it
- build a load classification schedule from that trace, and audit every
  UPS-fed and non-UPS-fed circuit against it
- measure the present per-phase load and recompute autonomy at end-of-life
  battery capacity and at the actual room ambient
- map the bypass and battery alarms into the control system and prove the
  path end to end
- plan a discharge test on the maintenance bypass and establish a baseline
```

**The transferable lesson is that a UPS protects circuits, and a plant depends on functions.** Nothing failed here except the assumption that those were the same thing. The remedy is not a larger UPS; it is a document — a load classification schedule derived from signal paths — plus an alarm path that makes the system's own state visible to the people who depend on it.

## Recommended Practice

- Specify a VFI system for automation loads, and state explicitly that the requirement is continuous inverter supply rather than a fast transfer.
- Treat the static bypass, the maintenance bypass and the bypass source as three separate specification items, and confirm all three on the single-line diagram before ordering.
- Feed the bypass from a genuinely different upstream path, or record explicitly that it is not independent.
- Build a load classification schedule from signal paths, not from cabinets, and include every network hop, server dependency and field power supply on the path.
- Keep motors, heaters and general-purpose socket circuits off the critical supply.
- Derive autonomy from the action the outage requires — ride-through, generator bridge, orderly shutdown or human intervention — and state which one.
- Size autonomy at end-of-life battery capacity, at the actual room ambient, and against a load figure that anticipates growth.
- Choose battery chemistry with the people who will maintain it, and provide the room conditions the chemistry requires.
- Trend block impedance consistently, and read the spread across the string rather than the average.
- Plan and perform periodic discharge tests on the maintenance bypass, and keep the results as a trend.
- On DC systems, treat insulation monitoring as a protection function and a first earth fault as a defect to be located and cleared.
- Size DC chargers for the standing load plus battery recharge.
- Test the generator with the UPS in circuit at load; enable and coordinate rectifier walk-in; verify the bypass remains synchronised on generator supply.
- Distinguish fault tolerance from concurrent maintainability and state which one the design provides.
- Audit single-corded loads on any dual-path system.
- Confirm that the load's earthing arrangement is identical on inverter and on bypass.
- Alarm the "on bypass" state into a system a person watches, and prove the path end to end at commissioning.

## Conclusion

A UPS is a component. Critical power is an architecture, and the architecture is defined by three documents that most sites do not have: a load classification schedule derived from signal paths, an autonomy calculation tied to a stated requirement and to end-of-life capacity, and a maintenance path that allows the equipment to be serviced without stopping the plant.

Everything else follows from those. Batteries age predictably and can be trended; generators and rectifiers interact in ways that are entirely knowable from one afternoon of testing; redundancy buys exactly what it says and nothing more. The failures are not mysterious. They are the accumulated result of small decisions — a switch moved to a nearer socket, a test deferred because it was disruptive, an alarm contact left in a marshalling box — none of which looked like a decision about critical power at the time it was made.
