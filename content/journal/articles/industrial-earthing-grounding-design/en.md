# Industrial Earthing and Grounding Design

## Executive Summary

"Earth" is a single word covering at least five distinct engineering functions. They have different purposes, different design rules, different verification methods and different consequences when they fail. In many installations they share conductors and they always share terminology, and that shared terminology is the origin of most of the field's serious mistakes.

The five are: **protective earthing**, which provides a fault-current path so that protective devices operate; **equipotential bonding**, which limits the voltage difference between things a person can touch at the same time; **system earthing**, which defines the relationship between the supply's live conductors and earth and therefore determines what happens during an earth fault; **functional earthing**, which provides a reference for measurement and signalling; and **lightning and surge dispersion**, which gives high-energy transients a controlled route.

A sixth item belongs in this list only to be excluded from it. **The neutral is a live conductor.** It is not an earth, it is not a bonding conductor, and it is not a signal reference — and treating it as any of those is the single most consequential error in this subject.

This article separates the functions, works through the system arrangements that decide how earth faults behave, explains what an earth electrode actually does, and addresses the reference and shielding questions that make control engineers and electrical engineers argue. The high-frequency earthing of drive installations and the shield practice of instrument loops are covered in the companion articles on drive EMC and on 4–20 mA loops; this is the installation-wide view.

**Safety boundary.** Everything here is design and verification guidance. Earthing verification includes tests that must be performed de-energised, tests that require specific instruments and procedures, and tests whose incorrect execution is dangerous. All of it is work for competent persons under the site's safe system of work and the applicable national standard. Nothing in this article is an instruction for working on or near live parts.

## Five Jobs, One Word

| Function | What it is for | What failure looks like |
| --- | --- | --- |
| **Protective earthing (PE)** | A low-impedance fault path so protection disconnects | Fault persists, exposed metal stays live |
| **Equipotential bonding** | Everything touchable at the same potential | Dangerous voltage between two touched surfaces |
| **System earthing** | Defines the live-conductor-to-earth relationship | Wrong protective measure chosen for the arrangement |
| **Functional earthing** | A stable reference for measurement and signals | Noise, drift, unrepeatable readings |
| **Lightning and surge dispersion** | A controlled route for high-energy transients | Flashover, equipment destruction, side flashes |

**The critical property of this table is that a conductor can serve more than one function while satisfying the requirements of only one.** A protective conductor that is entirely adequate as a fault path may be a poor signal reference, because it carries fault current and noise and because its impedance at high frequency bears no relation to its impedance at power frequency. Conversely, a conductor chosen for a clean reference has no protective duty and must never be relied upon for one.

## The Neutral Is Not an Earth

**In normal operation the neutral carries current.** In a balanced three-phase system it carries little; in an unbalanced system it carries the imbalance; in a system with single-phase electronic loads it can carry substantial triplen-harmonic current. Because it carries current, it develops a voltage along its length — which means the neutral at a distribution board is not at the same potential as the neutral at the source.

Three consequences follow, and they explain a great deal of field behaviour:

**Anything referenced to the neutral moves.** Instrumentation, control-circuit references and measurement systems tied to a neutral inherit every voltage the neutral develops.

**A combined neutral-and-protective conductor puts that current on the protective system.** Where the two functions share one conductor (a PEN, the TN-C arrangement), load current flows in the same conductor that bonds exposed metalwork, and the potential differences that current creates appear across the plant's metalwork.

**A broken PEN is a severe hazard.** If the combined conductor opens, exposed conductive parts connected to it can rise toward line potential, and there is no protective device whose normal function detects this.

**The engineering rule that follows is unambiguous: once the neutral and the protective conductor are separated, they are never reconnected downstream of the separation point.** A single re-connection — an added distribution board with the link fitted, a machine wired with N and PE bridged, a replaced socket wired for a different arrangement — puts load current into the protective and bonding system permanently. It usually announces itself not as a safety alarm but as an unexplained noise problem or as measurable current in a bonding conductor, which is why the electrical fault is frequently found by the control engineer.

## System Earthing Arrangements and What They Decide

The system earthing arrangement determines how much current flows during a line-to-earth fault, and therefore which protective measure can detect it. **This is a design decision that precedes the choice of protective devices, not one that follows it.**

| Arrangement | Return path for an earth fault | What must clear the first fault | Characteristic consequence |
| --- | --- | --- | --- |
| **TN-S** | Metallic PE conductor back to the source | Overcurrent protection or residual current protection | High fault current, fast disconnection, clean reference |
| **TN-C** | Combined PEN conductor | Overcurrent protection | Load current on the protective system; no residual protection possible upstream of separation |
| **TN-C-S** | PEN to the separation point, then separate PE | As TN-S downstream of separation | Correct only if separation happens once and is never undone |
| **TT** | Through the installation electrode, the soil and the source electrode | Residual current protection | Loop impedance is normally far too high for overcurrent devices |
| **IT** | No deliberate low-impedance path; first fault current is small | Nothing disconnects — the fault is detected and alarmed | Continuity of supply preserved; the second fault is the dangerous one |

**In a TN system the fault current returns metallically**, so a line-to-earth fault behaves electrically like a short circuit and the overcurrent device sees it. This is why TN systems are the industrial norm: the protection that already exists does the job, provided the loop impedance is low enough for the device to operate within the required time. **That proviso is a measurement, not an assumption** — earth fault loop impedance is verified at commissioning and after modification, because a lengthened circuit or an added junction can push a previously compliant circuit out of compliance without any visible change.

**In a TT system the fault loop passes through the soil**, and soil is not a conductor in any useful sense at these impedances. The loop impedance is normally far too high for an overcurrent device to operate, which is why **residual current protection is the essential protective measure in TT installations** rather than an optional refinement.

**In an IT system the supply is not solidly earthed** — it is either isolated from earth or connected through a high impedance. A first earth fault therefore drives only a small current and does not itself create a dangerous situation, so the system continues to operate. That property is the entire reason the arrangement exists: it is used where an unplanned disconnection is less acceptable than a controlled shutdown at a chosen moment, such as in continuous processes and certain critical installations.

**The obligations that come with an IT system are frequently forgotten.** The first fault must be *detected*, which requires a permanent insulation monitoring device and a response procedure — an IT system with a defeated or unmonitored insulation monitor has quietly become an unearthed system with no fault indication. The first fault must then be *found and cleared*, because while it persists the system has effectively become an earthed system, and a second fault on a different phase produces a fault between phases through the protective conductors. **An IT system whose first fault is treated as an alarm to be acknowledged rather than a defect to be repaired is running on its last remaining layer of protection.**

## The Earth Electrode: What It Does, and What It Does Not Do

This section corrects the most persistent misconception in the subject.

**In a TN installation, the earth electrode does not clear line-to-earth faults.** The protective conductor does. The electrode's roles are to establish the system's potential relationship with earth, to provide a route for lightning and surge energy, and to act as a reference — all of which matter, and none of which is "conducting fault current into the ground". An installation with an excellent electrode and a defective protective conductor is dangerous; an installation with a modest electrode and a sound, verified protective system is not.

**In a TT installation the electrode is genuinely part of the fault loop**, which is why its condition matters in a way it does not elsewhere — and why residual current protection, which does not depend on a low loop impedance, is what actually provides the protection.

**There is no universal target resistance.** The required electrode resistance depends on what the electrode is for — a lightning protection function, a TT disconnection requirement, a functional reference, a specific standard's requirement for a particular installation type — and on soil resistivity, electrode geometry and the applicable national rules. A remembered figure from a previous project is not a design input. **The correct value is the one derived from the applicable requirement for the actual function, and it must be stated in the design rather than inherited from habit.**

**Electrode resistance is not a constant.** It varies with soil moisture and temperature, so a commissioning measurement taken in wet conditions can be substantially better than the same electrode in a dry season. A design that only just satisfies its requirement on the day of the test does not satisfy it all year.

**Measuring an electrode requires isolating what is being measured.** An electrode connected to the installation, to structural steel, to cable armour and to metallic services is measured in parallel with all of them, and the reading obtained is the resistance of that whole network — often a comfortingly low number that says nothing about the electrode. Meaningful measurement requires either a proper disconnection under a controlled procedure or a measurement method designed for connected electrodes. **A low reading on a connected electrode is not evidence that the electrode is good; it is evidence that something else is also earthed.**

## Bonding: The Function That Actually Protects People

**Protection against electric shock does not work by sending current into the earth.** It works by ensuring that during a fault, the conductive parts a person can touch simultaneously do not differ appreciably in potential, and that the fault is disconnected quickly.

**Main bonding** connects the installation's main earthing terminal to the metallic services entering the building and to the structure. **Supplementary bonding** does the same locally where the risk warrants it. In an industrial plant, structural steel, pipework, cable tray, machine frames, handrails and vessel shells all participate, and the design intent is that they form one continuous, low-impedance mesh rather than a set of independently earthed islands.

**Two properties of a healthy bonding system are worth stating because they are also its best diagnostics:**

**A bonding conductor carries no current in normal operation.** It exists for fault and transient conditions. **Measurable steady current in a bonding conductor is evidence of a defect** — most commonly a neutral and protective conductor reconnected somewhere downstream, sometimes a parallel path through equipment, occasionally a genuine insulation fault. It is a finding to be investigated, not a curiosity.

**Isolated earthed structures are the hazard, not the solution.** Two metallic structures each connected to earth but not to each other can differ substantially in potential during a fault or a lightning event, and the difference appears across whatever bridges them — including a person, a signal cable or an instrument. This is the reason the general principle in industrial installations is *bond everything together*, and it is the reason the next section exists.

## Functional Earthing, Signal References and Shields

Here the electrical and control disciplines meet, and this is where the argument usually happens.

**A functional earth is not a protective earth.** It exists so that a measurement or a communication has a stable reference. It carries no protective duty, it does not substitute for a protective conductor, and equipment requiring a functional earth still requires a protective conductor sized and verified for its protective role.

**A protective conductor is not a good signal reference.** It is bonded to everything, it carries fault current when there is a fault, it carries the return path for high-frequency currents from converter equipment, and its impedance rises with frequency. Referencing a sensitive measurement directly to it means inheriting all of that.

**A cable shield is a third thing again.** It is terminated to control coupling, and the correct termination depends on the coupling mechanism being addressed and on the frequency — a shield handling low-frequency electrostatic coupling and a shield handling high-frequency coupling are not terminated in the same way, and terminating for one can create a circulating-current problem for the other. The instrument-loop and drive-cable specifics are set out in the companion articles; the point here is only that **"earth the shield" is not a specification.**

**The single-point rule and its limit.** Referencing a system at a single point avoids circulating current at power frequency, which is why it is the traditional advice for low-frequency signalling. It stops working as frequency rises, because a conductor's inductance dominates its behaviour and a "single point" connected by a long conductor is not a single point at high frequency at all. High-frequency practice therefore requires short, wide, multiple bonds — the opposite arrangement. **Neither rule is universally correct; the frequency content of the disturbance decides which applies**, and an installation containing both slow instrumentation and fast converters contains both problems.

**The separate "clean earth" electrode is the mistake this section exists to prevent.** The reasoning behind it is intuitive: if the plant earth is noisy, give the sensitive equipment its own quiet electrode, isolated from the dirty one. The result is two earthed systems that are not bonded to each other. During an earth fault or a lightning event, a substantial potential difference appears between them — and it appears across the signal cables running between the sensitive equipment and the rest of the plant. **This is simultaneously a safety hazard and the most effective noise-injection mechanism available**, and it reliably makes the original problem worse.

The correct approach is one bonded earthing system, with the reference topology *inside* it engineered deliberately: separate reference conductors routed with their signals, controlled bonding points, segregation of cable routes, and attention to where converter return current actually flows. Quiet references are achieved by controlling current paths, not by isolating structures from each other.

## Lightning and Surge: The Interface

A lightning protection system is a separate design discipline with its own standard, its own risk assessment and its own competencies — air terminations, down conductors, separation distances and electrode arrangement are not general electrical design.

**What matters at the interface is simple to state and often not done.** All incoming services and all significant metalwork are bonded at the point of entry, so that a transient raising the potential of the structure raises everything together rather than driving a difference across the equipment inside. Surge protective devices are then coordinated by position, staged from the service entrance inward, with energy-handling capability appropriate to where each one sits.

**Two installation realities decide whether this works.** The first is bonding at entry: a service brought into a building at one point and bonded at another has a difference across it during an event. The second is connecting-lead length on surge protective devices, whose effectiveness is dominated by the inductive voltage developed along their leads during a fast transient — a point developed further in the companion article on power quality.

## Failure Modes

**Neutral and protective conductor reconnected downstream of the separation point.** Load current in the protective and bonding system, permanently.

**A separate isolated electrode for "instrument earth" or "clean earth".** A potential difference across signal cables during faults and lightning; a hazard and a noise source.

**Earth fault loop impedance never verified, or not re-verified after modification.** Protection that is assumed to operate and has never been shown to.

**Electrode measured while connected to everything.** A low reading that describes the network, not the electrode.

**A single remembered resistance figure applied as a universal target.** The wrong requirement for the actual function.

**Electrode accepted on a wet-season measurement.** Compliant on the test day, non-compliant for part of the year.

**IT system with a defeated or ignored insulation monitor.** An unearthed system with no fault indication.

**IT system running with a first fault acknowledged rather than repaired.** Operating on the last layer of protection.

**TT installation relying on overcurrent protection for earth faults.** A loop impedance that cannot produce the required current.

**Protective conductor used as a return path for a control circuit.** Current in the protective system by design.

**Functional earth substituted for a protective conductor.** No verified protective path.

**Shield terminated by habit rather than by mechanism.** Either no benefit or a circulating current that creates a new fault.

**Single-point referencing applied to a high-frequency problem.** A "single point" that is an inductor at the frequency that matters.

**Steady current measured in a bonding conductor and treated as normal.** A defect running unrepaired.

**Machine relocated, protective conductor extended, nothing remeasured.** A previously compliant circuit quietly outside its limits.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

An analyser cabinet in a process area produces unstable readings. The instability is intermittent, correlates loosely with plant activity, and does not appear during quiet periods. On the advice that the plant earth is "dirty", a dedicated earth rod is installed outside the building and a dedicated conductor is run to the cabinet's reference bar, deliberately kept clear of the plant earthing system. The instability becomes worse, and now includes occasional communication faults on the link back to the control system.

```text
Symptom:
Unstable analyser readings and intermittent communication faults, worse
after a dedicated isolated earth rod was installed for the cabinet.

Evidence:
- the instability correlates with the operation of a large converter-fed
  drive in an adjacent area, not with the analyser's own process
- the analyser cabinet is bonded to the new rod and, through its cable
  gland plate and the signal cable screen, is also in contact with the
  plant earthing system
- a measurement between the cabinet reference bar and the local plant
  earthing shows a varying potential difference, largest when the drive runs
- the signal cable screen between the cabinet and the control system is
  terminated at both ends
- the communication faults began only after the dedicated rod was installed
- no other analyser cabinet in the plant has a dedicated electrode, and
  none of them shows the fault

Reasoning:
The dedicated rod created a second earthed system that is not bonded to the
first. The two systems sit at different potentials whenever significant
current flows in the plant earthing — which, in this area, is whenever the
converter-fed drive operates and its high-frequency return current circulates
through the earthing network. The cabinet is nevertheless connected to both
systems through the cable entries and the screen, so the potential difference
between them appears across the cabinet's own reference and across the signal
cable that bridges them. The isolation intended to keep the reference quiet
instead placed the reference across the difference. The communication faults
appeared at the same time because the same difference is impressed on the
link. This arrangement is also a shock hazard during an earth fault or a
lightning event, independent of the measurement problem.

Next investigations:
- confirm the potential difference between the two earthing systems under
  controlled drive operation
- establish the drive's actual high-frequency return path and whether it is
  routed through the earthing network or through a dedicated route
- review the screen termination against the coupling mechanism being addressed
- plan the bonding of the dedicated rod into the plant earthing system, and
  the reference topology that replaces the intended isolation
```

The remedy is the opposite of the intervention: **bond the rod into the plant earthing system rather than keeping it separate**, and achieve the quiet reference by controlling where current flows — routing the converter's return path deliberately, reviewing the screen termination against the actual coupling mechanism, and segregating cable routes — rather than by isolating structures from one another.

**The transferable lesson is that isolation between earthed structures does not produce quiet; it produces a voltage difference and then puts your signal cable across it.** Every earthed thing in a plant is going to be connected to every other earthed thing by something. The engineering choice is whether that connection is a designed bonding conductor or an instrument's input circuit.

## Recommended Practice

- Name the function before designing the conductor: protective earthing, bonding, system earthing, functional reference or surge dispersion. They are not interchangeable.
- Treat the neutral as a live conductor in every design decision, and never as a reference or a protective path.
- Choose the system earthing arrangement first, because it determines which protective measure can work.
- Separate neutral and protective conductor once, at a defined point, and enforce the prohibition on reconnecting them downstream through design, labelling and inspection.
- Use residual current protection where the arrangement requires it, rather than assuming overcurrent devices will see an earth fault.
- With an IT system, treat insulation monitoring as part of the protection and the first fault as a defect to be located and repaired, not an alarm to be acknowledged.
- Verify earth fault loop impedance by measurement at commissioning, and re-verify after any modification that changes circuit length or terminations.
- Derive the required electrode resistance from the applicable function and standard; never adopt a figure from memory or from another site.
- Measure electrodes with a method that measures the electrode, and account for seasonal variation before accepting a value.
- Bond all metallic structures and services into one continuous system; treat isolated earthed islands as defects.
- Investigate any steady current found in a bonding conductor rather than accepting it.
- Never install a separate isolated electrode for sensitive equipment; achieve quiet references by controlling current paths inside one bonded system.
- Specify shield termination against the coupling mechanism and the frequency, not by habit.
- Apply single-point referencing only where the frequency content justifies it, and use short, wide, multiple bonds where high-frequency behaviour dominates.
- Bond all incoming services at the point of entry and stage surge protective devices by position, keeping their connecting leads short.
- Record the earthing design, the measured values and the date, and re-verify after modification — an earthing system is altered by every plant change and reviewed by almost none of them.

## Conclusion

Earthing rewards precision of language more than almost any other subject in industrial electrical engineering. Most of the failures are not failures of calculation or of installation quality; they are failures of definition — a conductor asked to do a job it was not designed for, a rod expected to clear a fault it cannot see, a reference isolated in a way that guarantees a difference across it.

Separate the five functions in the design and keep them separate in the language. Establish the system arrangement before selecting protection. Verify by measurement rather than by drawing, and re-verify after change. And resist the intuition that isolation produces quiet: in an industrial plant, everything conductive is connected to everything else eventually, and the only real choice is whether that connection was engineered or discovered.
