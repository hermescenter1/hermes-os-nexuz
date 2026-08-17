# Industrial Instrumentation Architecture and Signal Integrity

## Executive Summary

Most instrumentation problems presented as "noise" are architecture problems wearing a disguise. The cable is rarely the cause; the cable is where the consequence becomes visible.

The root of it is terminological. Five distinct engineering concepts share overlapping vocabulary, appear on the same drawings and often land on adjacent terminals: **protective earthing**, **shield bonding**, **functional reference**, **signal return** and **common-mode rejection**. They are not interchangeable, they are not degrees of the same thing, and a plant that collapses them into one idea called "earth" produces measurement systems that cannot be diagnosed — because the vocabulary needed to state the fault does not exist on site.

This article treats instrumentation as an architecture: what the five concepts are and why each needs its own decision, how signal categories differ and why that governs routing, the real trade-offs between central marshalling and remote I/O, why junction boxes determine long-term reliability more than any cable specification, how to set a shield policy rather than a shield habit, where isolation belongs, and why common-mode is a failure mode rather than a grade of noise.

The general protective earthing rules are set out in the companion article on industrial earthing, the electrical behaviour of an individual measurement chain in the companion articles on 4–20 mA loops, and the aggressor side of drive installations in the companion article on drive harmonics and EMC. This article is the layer above all three: how the instrumentation system is laid out, and what that layout makes possible or impossible.

## Five Concepts That Must Stay Separate

| Concept | What it is | What it is not |
| --- | --- | --- |
| **Protective earthing (PE)** | A fault-current path so protective devices operate; a safety function | A signal reference, a shield, or a return conductor |
| **Shield bonding** | Connecting a cable screen to a defined potential to control coupling | A protective conductor, and never a signal return |
| **Functional reference** | The potential a measurement is defined against — the "zero" of the measuring system | A safety earth, and not automatically at earth potential |
| **Signal return** | The conductor that actually carries the return current of the signal | The reference, and not the shield |
| **Common-mode rejection** | The receiver's ability to ignore a voltage present equally on both inputs | A property of the wiring — it belongs to the input circuit |

**The consequences of collapsing them are specific, not vague.** Using a shield as a signal return puts every induced current in the screen directly into the measurement. Using the protective conductor as a reference imports every fault current and every high-frequency return path from converter equipment into the "zero" of the measuring system. Treating common-mode rejection as a wiring property leads people to re-route cables when the actual problem is that the field device sits outside the input's allowable common-mode range.

**A plant can have exemplary protective earthing and terrible signal integrity, and the reverse is also possible.** They are separate designs that share hardware.

## Signal Categories and Why They Segregate

Instrumentation cabling is segregated because different signal categories differ by orders of magnitude in level, in bandwidth and in what they do to their neighbours.

| Category | Typical character | Dominant vulnerability |
| --- | --- | --- |
| **Low-level analogue** (thermocouple, bridge, pH) | Millivolts, high source impedance | Both capacitive and magnetic coupling; thermoelectric effects at joints |
| **RTD** | Small resistance changes measured as voltage | Lead resistance, joint resistance, self-heating |
| **4–20 mA loops** | Current-driven, low impedance | Comparatively immune, but not immune to common-mode |
| **Pulse and frequency** (flow, encoders) | Edge-defined | A single induced spike is counted as data |
| **Discrete 24 V DC** | Robust, but a source of switching transients | Contact bounce, inductive kick from relays and solenoids |
| **Digital fieldbus** | Defined electrical layer with its own rules | Termination, topology and segment-length constraints |
| **Intrinsically safe circuits** | Energy-limited by certification | Segregated for a *safety* reason, not an EMC reason |
| **Power and drive output cables** | The aggressors | They are not victims; they are the source |

**Two of these deserve emphasis because they are routinely mis-handled.**

**Pulse and frequency signals fail differently from analogue signals.** An analogue signal degraded by interference reads slightly wrong; a pulse input degraded by interference reads *extra counts*, and the resulting error is not a small offset but a fabricated quantity. A flow totaliser that gains volume when a nearby drive starts is not a calibration problem.

**Intrinsically safe circuits are segregated for a different reason from everything else in this list.** Their separation and identification is a requirement of the hazardous-area design, not an EMC measure, and it is not negotiable against convenience. The interaction between the two disciplines is covered later in this article.

**RTD wiring deserves one precise statement**, because it is a frequent source of a stable but wrong reading. A two-wire connection includes the lead resistance in the measurement. A three-wire connection compensates for it *on the assumption that the leads are identical*, which a repaired or extended cable may violate. A four-wire connection removes lead resistance from the measurement entirely. **The difference does not appear as noise; it appears as an offset, which is much harder to notice and much easier to calibrate out incorrectly.**

## Where the I/O Lives: Three Architectures

| | **Central I/O with marshalling** | **Remote I/O in the field** | **Digital field devices / fieldbus** |
| --- | --- | --- | --- |
| **Field cabling** | Highest volume — every signal runs to the room | Reduced to a network and power run | Lowest — multidrop or segment wiring |
| **Electronics environment** | Controlled room | Field: temperature, vibration, corrosion, condensation | Distributed to the devices themselves |
| **Failure domain** | Per channel or per card | Per node — one failure affects many signals | Per segment or per device |
| **Change cost** | Low if marshalling exists; high if terminated direct to card | Moderate — nodes have finite capacity | Depends on segment loading and topology rules |
| **Diagnostic reach** | Card-level channel diagnostics | Node diagnostics plus network state | Device-level diagnostics, richest of the three |
| **Added dependency** | None beyond the rack | Network availability and field power | Network availability, configuration management, tooling |

**The trade-off nobody states out loud is where the failure domain sits.** Central I/O concentrates cost in cable and keeps failures small: a failed channel is one measurement. Remote I/O trades cable for a network and moves electronics into the environment, which is a genuine reliability decision — and it changes the failure domain from one signal to one node's worth of signals, which matters enormously if the node happens to carry several measurements from the same process unit.

**Distributing signals across nodes should therefore follow process logic, not cable convenience.** Putting all three measurements of a critical control loop on the same remote node is a design decision that nobody made deliberately, but that many plants have made.

**Marshalling exists for change, not for tidiness.** A system terminated directly from field cable to I/O card is cheaper to build and substantially more expensive to modify: every change touches the card. A marshalling rack decouples the field termination from the I/O assignment, which is what makes a plant modifiable over twenty years. Plants that omitted marshalling to save capital cost pay it back, with interest, in every subsequent modification.

## Junction Boxes: The Reliability Determinant Nobody Specifies

Field enclosures decide long-term instrumentation reliability more reliably than any cable specification, and they are the least engineered part of most designs.

**Ingress is usually not a rating problem; it is a detail problem.** An enclosure with an entirely adequate protection rating fills with water because cable glands were fitted on the top face, because the gland was not tightened onto the correct cable diameter, or because the cable itself carried water down its interstices from a higher point. **The mechanism that actually dominates in the field is condensation**, driven by daily temperature cycling: the enclosure breathes, moist air enters, and the moisture stays. Breather-drains, gland position on the lower faces, and a downward cable drip loop are all cheap and all frequently absent.

**Shield continuity is most often broken — or accidentally created — inside a junction box.** A shield landed on a terminal that is also bonded to the enclosure, in a box whose enclosure is bonded to the structure, has just been earthed at a point nobody documented. Multiply that by a dozen boxes and the plant's shield policy is whatever happened during installation.

**Segregation that stops at the gland plate is not segregation.** Signal categories carefully separated across a site are routinely recombined inside a small enclosure where every wire shares one terminal rail.

**Terminal type matters under vibration**, and spare capacity matters for the next ten years. A junction box installed with no spare terminals guarantees that the next instrument gets a second box, an additional cable and an undocumented topology.

## Routing, Segregation and Loop Area

The physics compresses into two sentences. **Magnetic coupling is governed by the area of the loop formed by a signal and its return** — which is why a twisted pair is the default and why a signal whose return travels by a different route is exposed regardless of its shield. **Capacitive coupling is governed by proximity and by the impedance of the victim circuit** — which is why high-impedance, low-level signals are the vulnerable ones and why a low-impedance current loop is comparatively robust.

The practical rules follow directly:

- **Route signal and return together**, always. A cable tray arrangement that separates them creates a loop the size of the building.
- **Assign cables to categories and define minimum separations and permitted parallel-run lengths**, then check them on the as-built rather than on the design.
- **Cross at right angles** where routes must intersect.
- **Use separate trays, or physically divided trays, between aggressor and victim categories**, and remember that a metallic divider only helps if it is continuous and bonded.
- **"Routed separately" must mean separately over the whole run.** A cable that is separated at both ends and shares a tray for forty metres in between is not separated; the parallel run is where the coupling happens.
- **Drive output cables are a category of their own** and belong with the treatment in the drive EMC article, not in the general power category.

## Shield Policy Rather Than Shield Habit

**A shield addresses a mechanism, and different mechanisms need different terminations.**

- **Capacitive (electrostatic) coupling** is controlled by holding the screen at a defined potential. At low frequency, a connection at one end achieves this and avoids a circulating current through the screen.
- **Magnetic coupling** is not addressed by an electrostatic screen at all; it is addressed by reducing loop area — twisting — and, where a screen is to help, by a screen that can carry current, which a foil-and-drain-wire construction does poorly.
- **High-frequency coupling** requires the screen to carry return current, which requires a low-inductance 360-degree termination and, generally, a connection at both ends. At high frequency a "single point" connected by a pigtail is not a point at all; the pigtail is an inductor.

**The architectural decision is to define a shield policy per signal category and to write it into the specification**, then to enforce it in the marshalling cabinet and in every junction box. The failure state is not a wrong policy but a *mixed* policy: two devices on the same cable applying different assumptions produce a circulating current that nobody designed.

**Two absolutes are worth stating plainly.** A shield is never a signal return. And a shield connected at both ends into two separate earthing systems is not a shield — it is a bond between two systems, carrying whatever current their potential difference drives, straight along the signal cable.

## Isolation as an Architectural Choice

Galvanic isolation does three things and only three: it breaks a conductive loop between two reference potentials, it defines which reference the measurement belongs to, and it bounds the common-mode voltage the input circuit is exposed to.

**It does not reject differential noise.** Interference that appears between the two signal conductors passes through an isolator as faithfully as the signal does. This is why "we fitted an isolator and it did not help" is such a common report: the isolator was correct and the problem was differential.

**The architectural question is the granularity.** Channel-to-channel isolation, group isolation and single-bank isolation are three different products with three different consequences:

- **Channel-to-channel** matters when field devices sit at genuinely different potentials — different structures, long runs, separately earthed process connections.
- **Group isolation** protects the system from the field but allows channels within a group to interact through their shared reference.
- **A single isolated bank** is essentially one isolation boundary for everything, which is adequate only if every field device shares a reference.

**The failure mode is choosing group isolation and then populating the group with devices that are individually earthed at their process connections.** Each of those devices imposes its local potential on the shared group reference, and the channels interfere with one another through a path the drawing does not show.

## Common-Mode Is a Failure Mode, Not a Grade of Noise

This distinction resolves a large share of "unexplained" instrumentation behaviour.

**Common-mode voltage is a voltage present equally on both signal conductors relative to the receiver's reference.** It arises from potential differences between where the field device is referenced and where the input card is referenced, from capacitive coupling that lifts both conductors together, and from floating sources that have no defined relationship to the receiver at all.

**Two separate specifications govern the outcome, and confusing them is the trap:**

- **Common-mode rejection ratio** describes how much of a common-mode voltage appears as an apparent differential signal. A high ratio means good rejection.
- **Common-mode range** describes the voltage window within which the input circuit works at all. **Outside that range, rejection is irrelevant** — the input is no longer operating linearly, and the reading is not noisy but meaningless.

**The diagnostic takes two minutes and is almost never performed: measure the voltage between the field device's reference and the input card's reference**, with the plant in the condition where the fault appears. If that voltage moves when a drive starts, the problem is a common-mode problem and rerouting the signal cable will not fix it. The general mechanism behind those potential differences — current flowing in the earthing system, and structures at different potentials — belongs to the earthing article; the point here is that the instrumentation architecture decides how exposed the measurement is to it.

## Intrinsic Safety: The Interface, Not the Design

Hazardous-area design is a separate discipline with its own certification framework, and this section describes only where it touches instrumentation architecture.

**The certified entity is a system, not a device.** An intrinsically safe loop is certified as a combination of field apparatus, associated apparatus (the barrier or isolator) and the interconnecting cable, whose capacitance and inductance are part of the certification. **This means cable type and cable length are safety parameters**, not installation conveniences, and a cable substituted for availability reasons can invalidate the certification without any visible change.

**The barrier type changes the earthing architecture.** A zener-type barrier depends on a connection to a defined intrinsic-safety earth in order to function, which makes that earth a safety-critical element with its own requirements. A galvanically isolating interface does not, which removes that dependency entirely and is one of the reasons it is frequently preferred in new designs.

**Segregation and identification are requirements, not practices.** Intrinsically safe circuits are kept separate and identifiable throughout — cabling, glands, terminals, marshalling — and the discipline must survive every subsequent modification, which is precisely where it usually fails.

**Anything in this area is governed by the applicable standards, the equipment certificates and the site's hazardous-area documentation.** Nothing in this article substitutes for them.

## Designing a Plant That Can Be Diagnosed

Diagnosability is an architectural property, decided at design time and almost impossible to retrofit cheaply.

- **Disconnect links or test terminals** at the marshalling rack, so a loop can be partitioned without cutting anything.
- **Defined injection points**, so a known signal can be applied at a known place and the rest of the chain verified.
- **Channel-level diagnostics** from the I/O — open circuit, short circuit, out-of-range, under-range — configured and mapped rather than left at defaults.
- **Field device diagnostics surfaced somewhere a person sees them**, rather than remaining inside a device that has no display.
- **Powered/unpowered indication** at field enclosures, so the first question of any investigation can be answered without a meter.
- **An as-built that matches reality**, because a diagnosis derived from a wrong drawing is a wasted day.

## Commissioning

**A loop check is not a channel check.** Confirming that an I/O card reads a current is a wiring test. A loop check confirms that a defined physical input at the transmitter produces the right value, in the right units, with the right scaling and the right sign, on the display an operator actually uses — and that alarms and interlocks driven by it behave correctly.

The pre-energisation and commissioning list that pays for itself:

- Continuity and insulation on every core, recorded.
- **Shield continuity *and* shield isolation** — a shield should be continuous along its route and isolated from earth except at its defined bonding point. Both must be tested; testing only continuity misses the accidental bond.
- Segregation verified on the as-built route, not on the design drawing.
- Loop resistance measured and compared against the design budget, where the signal type has one.
- Scaling and engineering units verified end to end, including sign and range.
- Common-mode voltage measured between field and system references on a representative sample, with plant running.
- Diagnostics verified by inducing the condition — open the loop and confirm the card reports it.
- Every measured value recorded so it becomes a baseline rather than a memory.

## Documentation as a Deliverable

An undocumented instrumentation system is diagnosable only by the person who installed it, and that person moves on.

The set that determines maintainability is small: **loop diagrams**, a **cable and termination schedule**, an **I/O list with scaling and alarm settings**, the **shield policy and segregation categories** as written rules, and an **as-built revision discipline** that captures modifications when they happen rather than in a documentation project three years later. The distinguishing mark of a well-run plant is not the quality of its original documentation but whether the last five modifications appear in it.

## Failure Modes

**Shield used as a signal return.** Every induced current in the screen enters the measurement directly.

**Protective conductor used as a functional reference.** Fault current and converter return current arrive at the measuring system's zero.

**Shield bonded at both ends into two different earthing systems.** A bond between systems, running along the signal cable.

**Mixed shield policy across a plant.** Circulating currents wherever two assumptions meet.

**Segregation that stops at the gland plate.** Categories carefully separated across the site, recombined inside a small box.

**"Separately routed" cables sharing a long parallel run.** Separated at the ends, coupled in the middle.

**Two-wire or repaired three-wire RTD connections.** A stable offset, easy to calibrate out and hard to notice.

**Pulse inputs treated as robust because they are digital.** Induced spikes counted as data; a totaliser that gains volume.

**All measurements of one control loop on one remote I/O node.** A single node failure removes the whole loop.

**Direct field-to-card termination with no marshalling.** Cheap to build; every future change touches the I/O card.

**Junction box with glands on the top face and no breather-drain.** Water inside an enclosure with an adequate rating.

**No spare terminals in field enclosures.** The next instrument creates an undocumented parallel topology.

**Group isolation populated with individually earthed field devices.** Channels interfering through a shared reference that appears on no drawing.

**Isolator fitted to solve a differential noise problem.** Correct device, wrong failure mode.

**Common-mode range exceeded and treated as noise.** Rerouting cables to fix a reading that is not noisy but invalid.

**IS cable substituted for availability.** Certification invalidated with no visible change.

**Loop check performed at the I/O card rather than end to end.** Wiring proven, measurement not.

**Shield continuity tested, shield isolation not.** Accidental bonds pass commissioning.

**As-built not updated after modifications.** Every subsequent diagnosis starts from a false map.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A process area reports erratic readings on several analogue inputs from one remote I/O node. The behaviour is intermittent, affects some channels on the node but not others, and coincides with the operation of a large converter-fed drive elsewhere in the area. Instrument technicians replace two transmitters and one cable without improvement.

```text
Symptom:
Erratic analogue readings on some — not all — channels of one remote I/O
node, correlating with the operation of a nearby converter-fed drive.

Evidence:
- the affected channels all come from transmitters whose housings are in
  metallic contact with earthed process pipework at the measurement point
- the unaffected channels on the same node come from devices with isolated
  field connections
- the node uses group isolation: all channels in the affected group share a
  single reference
- measured between the node's reference and the control-room system
  reference, a varying voltage is present, largest while the drive runs
- the instrument multicore shares a cable tray with the drive's output cable
  for a long parallel run, although both are separated at each end
- the multicore screen is landed on a shield bar in the field enclosure and
  also lands on a shield bar in the marshalling cabinet
- the field enclosure is bonded to local structural steel; the marshalling
  cabinet is bonded to the control building earthing
- replacing transmitters and one cable changed nothing

Reasoning:
This is a common-mode problem, not a differential noise problem, which is why
component replacement had no effect. The earthed transmitters impose their
local potential on the shared group reference; the drive's high-frequency
return current circulating in the earthing network makes that local potential
move relative to the control-room reference; and because the channels are
group-isolated rather than channel-isolated, every device in the group sees
the excursion. The isolated devices on the same node do not, which is the
discriminating observation.

Two installation conditions amplify it. The screen bonded at both ends into
two different earthing systems provides a low-impedance path for that
potential difference to drive current directly along the signal cable. And the
long parallel run beside the drive output cable provides capacitive coupling
along its whole length — the separation at the ends is irrelevant to what
happens in between.

Next investigations:
- measure the reference-to-reference voltage under controlled drive operation
  and correlate it with the reading disturbance
- establish the drive's actual high-frequency return path
- review the shield policy for this cable category and confirm which end is
  the defined bonding point
- verify the segregation of the route along its whole length, not at its ends
- evaluate channel-to-channel isolation, or isolated field connections, for
  the transmitters that are earthed at the process
- confirm the input circuits' common-mode range against the measured
  excursion, since exceeding it invalidates the reading rather than
  degrading it
```

**The transferable lesson is that the discriminating evidence was already on the node.** Some channels were affected and some were not, and the difference between them — earthed field connection versus isolated field connection — named the mechanism before any measurement was taken. A plant whose vocabulary distinguishes common-mode from noise asks that question in the first ten minutes. A plant whose vocabulary has one word for all of it replaces transmitters.

## Recommended Practice

- Write the five concepts into the design as five separate decisions: protective earthing, shield bonding, functional reference, signal return and the common-mode requirement of the input circuits.
- Never use a shield as a signal return, and never use a protective conductor as a functional reference.
- Assign every cable to a signal category, and define separations and permitted parallel-run lengths per category.
- Route signal and return together; cross aggressor routes at right angles; verify segregation along the whole route on the as-built.
- Choose the I/O architecture on failure domain and change cost, not on cable cost alone, and distribute signals across remote nodes by process logic rather than by convenience.
- Provide marshalling unless the plant will never be modified.
- Specify field enclosures properly: gland position, breather-drains, drip loops, terminal type for the vibration environment, and spare capacity.
- Preserve segregation inside enclosures, not only along the route.
- Define a shield policy per signal category, write it into the specification, and enforce it at every junction box.
- Choose isolation granularity against the actual reference conditions of the field devices, and use channel-to-channel isolation where devices are individually earthed.
- Do not expect isolation to solve differential interference.
- Treat common-mode range and common-mode rejection as two different specifications, and measure the reference-to-reference voltage before rerouting anything.
- Use four-wire RTD connections where the offset matters, and re-verify three-wire installations after any cable repair or extension.
- Treat intrinsically safe circuits' cable parameters as safety parameters and their segregation as a requirement that must survive every modification.
- Design diagnosability in: disconnect links, injection points, configured channel diagnostics, powered indication at field enclosures.
- Commission end to end in engineering units, test shield isolation as well as continuity, and record every measured value as a baseline.
- Keep the as-built current, and judge documentation quality by whether the last five modifications appear in it.

## Conclusion

Instrumentation signal integrity is decided long before anyone pulls a cable. It is decided when someone chooses whether marshalling exists, whether isolation is per channel or per group, whether the shield policy is written down or improvised, whether junction boxes are engineered or bought, and whether the plant's vocabulary can distinguish a common-mode problem from a noisy one.

Plants that get this right are not the ones with the most expensive cable. They are the ones where five different concepts have five different names, where a shield policy exists as a document, where the as-built is true, and where an engineer facing an erratic reading can state — in the first ten minutes, with evidence — which of the five is actually at fault.
