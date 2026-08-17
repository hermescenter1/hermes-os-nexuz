# OT Network Redundancy: MRP, RSTP, PRP and HSR

## Executive Summary

Four redundancy mechanisms are in common industrial use, and they are not variants of one idea. Two of them recover *after* a failure by reconfiguring the topology; two of them never have to recover because nothing was lost. That difference is not a matter of degree — it determines whether an application sees a communication interruption at all.

Selecting between them is therefore not a product comparison. It starts from one number the plant already owns: **how long the application can lose communication before it acts.** Everything else — topology, cost, device support, commissioning effort — is downstream of that.

## Start From the Tolerated Loss

The redundancy requirement is not "the network should be redundant". It is a stated duration, derived from the consumers of the traffic.

- **A supervisory client** reading process values can usually lose communication for a noticeable interval and simply show stale data. Its tolerance is set by operational judgement.
- **A controller talking to remote I/O** cannot. Its tolerance is the configured watchdog — the number of missed update cycles after which it declares the station failed and the program reacts. That figure is a hard limit, and it is often much shorter than people assume.
- **Protection and interlocking functions** may tolerate nothing at all, in which case a reconfiguring scheme is disqualified regardless of how fast it is.

**The single most common redundancy design error follows directly: a network recovery time longer than the device watchdog produces a plant trip on every recovery.** The ring heals, the stations report failure, and the program executes its fault logic. From the operator's position the redundancy appears to cause outages, which — in a narrow sense — it does.

So the first engineering step is to write down, per traffic class, the tolerated loss. The mechanism is then chosen to fit it, with margin.

## Reconfiguring Versus Seamless

| Property | RSTP | MRP | PRP | HSR |
| --- | --- | --- | --- | --- |
| Principle | Blocks redundant links, reconverges | Ring manager opens/closes the ring | Duplicate frames over two independent networks | Duplicate frames both ways around one ring |
| Loss on a single failure | Yes, until convergence | Yes, until reconfiguration | None | None |
| Recovery time character | Topology-dependent, not deterministic | Bounded and specified per implementation | Not applicable — nothing to recover | Not applicable |
| Topology | Meshed or arbitrary | Ring only | Two complete parallel networks | Ring |
| Device requirement | Any switch supporting it | Ring-capable switches; one manager | Doubly attached nodes, or a redundancy box per device | Every node participates in forwarding |
| Infrastructure cost | Lowest | Low — one extra closing link | Highest — two full networks | Moderate — one ring, more capable nodes |
| Typical fit | Supervisory and IT-like traffic | Cell and plant control rings | Zero-loss requirements with existing star wiring | Zero-loss requirements suited to a ring |

**The line that matters in that table is "loss on a single failure".** Everything above it is a question of how quickly service returns; everything below it is a question of whether it was ever interrupted.

## RSTP in an Industrial Context

Rapid Spanning Tree is the universal option: standardised, available on essentially every managed switch, and tolerant of arbitrary topology. It blocks redundant paths to prevent loops and reconverges when a link fails.

Its limitation in OT is not speed but **determinism**. Convergence depends on where the failure occurred, the shape of the topology and the number of switches between the fault and the root. A design cannot state a single guaranteed figure the way a ring protocol can, and a topology that grows over time gets slower without anyone changing a setting.

Where it fits well:

- Supervisory and DMZ layers, where the traffic tolerates a pause.
- Meshed topologies that cannot be expressed as a ring.
- Multi-vendor environments where interoperability outweighs determinism.

Where it fits badly: any segment carrying cyclic control traffic with a short watchdog.

**One configuration point deserves emphasis because it causes real outages: spanning tree and a ring protocol must not both be active on the same ports.** MRP manages the ring by deliberately keeping one port blocked; a spanning tree instance running on the same ring will make its own decisions about which port to block, and the two mechanisms will interfere. Ring ports must have spanning tree disabled, and the boundary between the ring and any spanning-tree domain has to be explicit.

## MRP: Bounded Ring Recovery

Media Redundancy Protocol is the workhorse of industrial ring redundancy. One switch takes the Media Redundancy Manager role and keeps the ring logically open by blocking one of its own ring ports; the remaining switches are clients that simply forward. The manager watches the ring with test frames and, when the ring breaks, unblocks its port and the traffic path is restored.

Its advantage over spanning tree is that the recovery is **bounded and specified** rather than emergent. The number is a property of the implementation and the ring size, and it is published per device — which is exactly why it must be read rather than assumed.

The engineering rules that make MRP behave:

- **Exactly one manager.** Two managers, or none, is a misconfiguration that may not show up until the first fault.
- **The recovery figure must be compared with the shortest watchdog on the ring**, with margin, before the design is accepted. Both numbers are configurable; they must be reconciled once, by one person.
- **Spurs are not in the ring.** A device connected as a drop off a ring switch has line-topology behaviour regardless of what the ring does. This is frequently forgotten when a device is added after commissioning.
- **A device that fails while still forwarding on both ports** is not the failure mode MRP addresses. Ring redundancy covers path loss; it does not cover every device fault.

## PRP: No Recovery Because Nothing Was Lost

Parallel Redundancy Protocol takes a different approach entirely. A node sends every frame twice, over two completely independent networks. The receiver accepts whichever copy arrives first and discards the duplicate. If one network fails, the other copy still arrives — **there is no switchover, no reconfiguration and no interruption.**

The costs are honest and substantial:

- **Two complete networks.** Separate switches, separate cabling, separate power where the consequence justifies it. Halving that — sharing a switch, or running both paths through one duct — reintroduces a common failure and turns two networks into an expensive one.
- **Node support.** Devices must be doubly attached and PRP-aware. Singly attached devices need a redundancy box, and every redundancy box is itself a single point of failure for the device behind it.

**The property that makes PRP attractive in retrofit situations** is that it imposes no topology constraint: each of the two networks can be any shape. Where an existing star-wired plant needs zero-loss redundancy, duplicating the network is often more practical than converting everything to a ring.

## HSR: Seamless Without a Second Network

High-availability Seamless Redundancy achieves the same zero-loss behaviour on a ring. Each node sends a frame in both directions around the ring and forwards frames on behalf of its neighbours; the destination takes the first copy and discards the second.

The trade against PRP is clear:

- **One ring instead of two networks** — significantly less cabling and fewer switches.
- **But every node must participate.** An HSR ring is made of HSR-capable nodes, each acting as a forwarding element. A device that does not support HSR needs a redundancy box to join.
- **The ring carries duplicated traffic**, so its capacity must be considered against the actual load rather than assumed.
- **A node that loses power stops forwarding** for the nodes behind it unless the implementation provides a bypass. This is a real availability consideration and differs from PRP, where a failed node affects only itself.

## Choosing: An Explicit Method

The technologies are not interchangeable, and a defensible selection follows a fixed order.

1. **State the tolerated loss per traffic class**, from watchdogs and application requirements — not from a preference for "fast".
2. **If the tolerance is zero, only PRP and HSR qualify.** No amount of tuning makes a reconfiguring protocol seamless.
3. **If zero-loss is required, choose between PRP and HSR on topology and devices**: existing star wiring and mixed devices favour PRP with redundancy boxes; a natural ring of capable nodes favours HSR.
4. **If a bounded interruption is acceptable, use MRP on rings** and verify the published recovery figure against the shortest watchdog.
5. **Use RSTP where topology is arbitrary and the traffic tolerates non-deterministic convergence** — typically supervisory and above.
6. **Do not mix mechanisms on the same ports.** Where domains meet, define the boundary explicitly.
7. **Check interoperability before committing to multi-vendor rings.** A standardised mechanism still requires matching roles, compatible timing parameters and, where relevant, the same supported recovery class.

**A design that cannot state which of these steps produced its answer has usually inherited the answer from a previous project.**

## The Failure Nobody Sees: Silent Expiry

Every redundancy scheme here shares one characteristic that makes monitoring non-optional.

**A redundant system that has already lost one path still works perfectly.** That is the entire point — and it is also why the loss is invisible. A ring with one break is a line: fully functional, and one fault away from an outage. A PRP installation with a failed LAN B delivers every frame on LAN A: fully functional, and no longer redundant.

The consequence is stark: **without explicit monitoring, redundancy degrades silently and is discovered only by the second failure, which is the one it was bought to survive.**

What monitoring has to cover:

- **Ring integrity and manager state** for MRP — an open ring must raise an alarm that reaches operations, not merely a status bit in a switch nobody reads.
- **Per-LAN supervision for PRP** — the mechanism provides supervision frames and per-path counters precisely because the application layer cannot tell. If nothing consumes them, the redundancy is unverified.
- **Per-node HSR counters** — a node that has stopped forwarding in one direction is a partial ring failure.
- **Alarms that are actionable.** A redundancy fault that appears only in a network-management tool nobody watches during production is not monitored; it is recorded.

## Commissioning and Fault Testing

Redundancy is the one design property that is entirely unproven until it is deliberately broken.

A meaningful test at handover:

- **Break each path individually, under load**, not on a quiet network. Confirm recovery and, critically, confirm that **no station reported a communication failure** during the event — a recovered network that tripped the plant has failed the test.
- **Measure, do not assume.** The published recovery figure applies to a specified configuration; the installed ring may be larger.
- **Test in both directions and at several points.** A break next to the manager and a break at the far side of the ring are different events.
- **Verify the redundancy is actually restored** after the fault is cleared. A ring that healed but left the manager in a fault state is not ready for the next event.
- **Confirm the monitoring fired.** If breaking a link did not produce an operator-visible alarm, the silent-expiry problem is already present on day one.
- **For PRP, remove one LAN entirely** and confirm production continues with no application-visible effect — and that the supervision reports it.

**Record the measured figures in the handover documentation.** Every future change to ring size or watchdog needs that baseline to be re-checked against.

## Maintenance Under Redundancy

One legitimate benefit rarely realised: a redundant network can be maintained one path at a time.

- With PRP, one entire network can be taken down for switch replacement or firmware update while production continues on the other. This is the strongest operational argument for its cost.
- With MRP, opening the ring deliberately for maintenance is a controlled version of the fault, and it should be scheduled and announced rather than discovered.
- In both cases, **the plant is running without redundancy for the duration**, and that window should be short, known and outside high-risk operations.

## Failure Modes

**Recovery time longer than the watchdog.** The network recovers and the plant trips anyway.

**Two ring managers, or none.** Configuration error invisible until the first real fault.

**Spanning tree left enabled on ring ports.** Two mechanisms decide independently which port to block.

**A break nobody noticed.** The ring has been a line for months; the next fault is an outage.

**PRP with a failed LAN and no supervision consumer.** Redundancy expired silently; the installation cost was paid and the benefit lost.

**Both PRP paths sharing a duct, a switch or a power supply.** One physical event takes both networks.

**Devices added as spurs after commissioning.** They sit outside the redundancy that the documentation claims covers them.

**Redundancy never tested under load.** The one property that cannot be inferred from configuration was never verified.

**HSR ring capacity assumed rather than calculated.** Duplicated traffic exceeds what the ring can carry at peak.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A utility's distribution substation automation network is built as an MRP ring linking bay-level devices to a station-level gateway. The design is competent and the ring is commissioned successfully.

Two years later, following an expansion, operators experience brief losses of station-level data whenever maintenance work disturbs a particular cable route. The events are short, and the system recovers each time, so they are logged as network glitches.

The evidence assembles into a different picture. First, the expansion added four devices to the ring, and the measured recovery time has grown with the ring size — the figure verified at original commissioning no longer applies. Second, and more significantly, two of the newly added devices were connected as spurs off a ring switch rather than into the ring itself; those two are not protected by the redundancy at all, and the "brief losses" for them are not brief recoveries but genuine outages for the duration of the disturbance.

Nothing was configured incorrectly in the original design. The failure was that an expansion changed both the recovery time and the redundancy coverage, and neither was re-verified because the expansion was treated as adding devices rather than as modifying a redundancy design.

The remediation is structural: bring the two spur devices into the ring or accept documented non-redundant status for them, re-measure the recovery time for the enlarged ring, and compare it against the shortest watchdog on the segment. The general rule this yields is worth stating plainly: **any change to the number of nodes in a redundant topology is a change to its recovery time, and therefore a change to the design.**

## Recommended Practice

- Derive the tolerated loss per traffic class from watchdogs and application requirements before evaluating any mechanism.
- If loss tolerance is zero, restrict the choice to PRP or HSR; do not attempt to tune a reconfiguring protocol into a seamless one.
- Choose PRP where topology is arbitrary or devices are mixed; choose HSR where a ring of capable nodes is natural.
- Use MRP for control rings, and verify its published recovery figure against the shortest watchdog with margin.
- Confine RSTP to layers whose traffic tolerates non-deterministic convergence.
- Never run spanning tree and a ring protocol on the same ports; define domain boundaries explicitly.
- Keep PRP's two networks genuinely independent — separate switches, separate routes, separate power where justified.
- Monitor ring integrity, manager state and per-path supervision, with alarms that reach operations.
- Break every path deliberately at handover, under load, and confirm no station reported a failure.
- Record measured recovery times; re-verify after any topology change.
- Treat added devices as a redundancy design change, not as a connection task.
- Schedule maintenance windows knowing the plant is unprotected for their duration.

## Conclusion

The four mechanisms answer different questions. RSTP asks how to survive an arbitrary topology; MRP asks how to make a ring recover within a stated bound; PRP and HSR ask how to avoid recovery being necessary at all. Treating them as interchangeable products with different price points produces designs that meet a specification nobody wrote.

The discipline that makes the choice defensible is unremarkable: state the tolerated loss, choose the mechanism that meets it, verify the number by breaking things, and monitor for the path that has already failed. The last of those matters most, because redundancy is the only part of a network that works perfectly right up to the moment it is needed and has not been there for months.
