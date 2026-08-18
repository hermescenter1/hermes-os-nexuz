# IT/OT Convergence Architecture for Modern Factories

## Executive Summary

Convergence programmes usually begin with a list of things the business would like to see and end with a network diagram. The engineering step in between — accounting for what each new connection costs in dependency — is the one most often skipped, and it is the one that decides whether the result is a well-instrumented plant or a plant that stops when a server in a data centre reboots.

This article treats convergence as that accounting. The organising question is not "how do we connect these systems" but **"what does the plant now depend on that it did not depend on before, and is that acceptable?"**

## Purdue as a Reasoning Tool, Not a Compliance Diagram

The layered reference model that most plants inherited is often treated as either gospel or as obsolete. Both readings waste it.

**What remains genuinely useful** is not the number of levels; it is the principle underneath: *dependency should point downward, and consequence should be bounded by the layer it occurs in.* A failure at the business layer should not stop production. A failure at the supervisory layer should cost visibility, not control. A failure at the control layer is the only one permitted to stop a machine.

**What has genuinely changed** is that modern data flows do not queue politely through every level. A condition-monitoring sensor may publish directly to an analytics service; an edge device may sit physically in a cell and logically in the enterprise. Forcing those onto a ladder diagram produces either a fiction on paper or an architecture that adds hops for their own sake.

**The workable synthesis is to keep the dependency rule and drop the topology dogma.** Any flow, however direct, is acceptable if it can answer three questions: what happens to production if it fails, what can it influence, and who owns it. A flow that skips levels while remaining northbound-only, read-only and non-blocking is often safer than one that respects the diagram while carrying commands.

## Northbound and Southbound Are Not Symmetric

The single most useful distinction in convergence architecture is direction, because the two directions have entirely different risk profiles.

| | Northbound (plant → enterprise) | Southbound (enterprise → plant) |
| --- | --- | --- |
| Typical payload | Process values, events, production counts, quality data | Orders, recipes, schedules, setpoints, commands |
| Consequence of corruption | Wrong report, wrong analysis | Wrong plant behaviour |
| Consequence of unavailability | Loss of visibility | Potential loss of production |
| Can be made read-only | Yes | No, by definition |
| Can be buffered and replayed | Yes | Only with defined local fallback |
| Review effort justified | Proportionate | Substantial, per flow |

**The architectural rule that follows: northbound data may flow relatively freely under a broker pattern; southbound flows are exceptions, each individually justified, reviewed and given defined behaviour on loss.**

Most of the business value attributed to convergence — visibility, analytics, reporting, condition monitoring, energy management — is northbound only. Recognising that early keeps the risky category small enough to engineer properly.

## The Industrial DMZ and the Broker Pattern

The DMZ exists to make one sentence true: **no enterprise system establishes a connection into the control environment.**

```text
Enterprise LAN
      |
   Firewall
      |
 Industrial DMZ   ──  data broker / replica historian / remote-access gateway
      |                        ^  (pull or push from OT side)
   OT Firewall                 |
      |                        |
 Supervisory zone  ── SCADA, authoritative historian
      |
 Control zone      ── controllers, I/O
```

Two properties make it work, and both are frequently compromised in practice:

**The copy lives in the DMZ; the original stays in OT.** The authoritative historian is inside; a replica serves enterprise consumers. Replication is one-way and initiated from the OT side. An enterprise reporting tool that queries the plant historian directly has bypassed the entire structure, and the fact that it is read-only does not restore it — the path exists now for whatever else finds it.

**The DMZ is a boundary, not a room to put things in.** Every additional application hosted there enlarges the surface that both sides must trust. A DMZ containing a broker, a replica and a controlled remote-access gateway is defensible; one that has accumulated a dozen integration servers over five years is a third production environment nobody owns.

**A useful discipline: each DMZ component should be describable in one sentence stating what it holds, who writes to it and who reads from it.** Anything that cannot be described that way is not understood well enough to be exposed.

## MES Integration: The Legitimate Southbound Case

Order and recipe download is the exception that justifies serious engineering rather than avoidance. It is genuinely southbound, genuinely valuable, and it introduces the dependency that matters most.

The design questions that determine whether it is safe:

- **What does the plant do when the MES is unavailable?** The answer must be explicit and tested. Continuing on the last known order, holding at a defined point, or running a locally stored recipe set are all defensible; discovering the answer during an outage is not.
- **Is the data buffered on the plant side?** Production records that cannot be sent should accumulate locally and transmit when the link returns, exactly as a historian collector does. Losing a shift's production records because a link was down is an avoidable design outcome.
- **Is a downloaded recipe validated locally before use?** The controller should not accept a value outside its own engineering limits merely because an upstream system sent it. Range checking at the receiving end is the last defence against an upstream data error becoming a plant event.
- **Who confirms the transfer completed?** A partially applied recipe is worse than a rejected one.

**The general principle for every southbound flow: the plant retains the authority to refuse.** A control layer that executes whatever arrives has transferred its safety and quality boundaries to a system with a different availability regime and a different change process.

## The Dependency Test

Convergence quietly converts a plant from independent to dependent, and the conversion is rarely on anyone's drawing.

**The test is simple and should be run against the design, then against the installation:** *disconnect the enterprise link — does production continue?*

Run the same question for each service:

| Service | If it is unavailable, production… |
| --- | --- |
| Enterprise network | should continue |
| MES | should continue in a defined degraded mode |
| Central identity service | should continue — see below |
| Time source | should continue, with logged degradation |
| Cloud analytics | should continue |
| DMZ data broker | should continue; only visibility is lost |
| Site historian | should continue; collection buffers locally |

**Any row where the honest answer is "stops" describes a dependency that the process did not previously have, and it needs either removal or the same availability engineering the process itself receives.**

**Identity deserves particular attention** because it is the dependency most often created without noticing. Joining operator stations, SCADA servers or engineering workstations to a central enterprise directory is administratively attractive and creates a path where a directory outage — or a network problem between sites — becomes an inability to log into a control room. Where central identity is used, OT-critical systems need a local authentication capability that works when the directory does not, and it needs to be tested rather than assumed.

## Patching and Ownership Boundaries

Most IT/OT friction is not technical. It is two teams with incompatible correct behaviours meeting at an undefined boundary.

- **IT's correct behaviour** is to patch promptly, standardise, and treat an unpatched system as a liability.
- **OT's correct behaviour** is to preserve a validated configuration, change only in a window, and treat an unvalidated change as a liability.

Neither is wrong. The failure is the **asset that both teams believe the other is handling**, which reliably turns out to be a Windows-based supervisory server in a rack that IT can reach.

What resolves it:

- **An asset register with a named owner per system**, including who patches it, in what window, and who validates it afterwards.
- **An explicit patch regime per zone**, not per organisation. Enterprise-cadence patching stops at the DMZ; OT systems are patched on a validated schedule.
- **A shared understanding that "unmanaged" is not a state**, only an unrecorded decision. Every system in the plant either has an owner or is a finding.

> The plant-wide security programme — asset inventory, monitoring, backup and recovery, credential lifecycle — is treated in the companion article on industrial cybersecurity. This section covers only the boundary where two operating models meet.

## Edge and Cloud Placement

Placement decisions become straightforward once the question is framed as consequence rather than capability.

**Put a computation at the edge when** the decision it drives must survive a link failure, when the data volume is large relative to the value extracted, or when latency matters to the outcome. Local condition monitoring, local aggregation and local buffering are natural fits.

**Put a computation centrally or in the cloud when** it aggregates across sites, needs elasticity, or informs decisions on a timescale where a link outage is irrelevant. Fleet comparison, long-horizon reliability analysis and enterprise reporting fit here.

**Two caveats that are frequently under-weighted:**

**An edge device is a new asset class inside the OT zone.** It has firmware, credentials, a patch requirement and a lifecycle, and it is frequently procured by whoever wanted the analytics rather than by the team that owns the zone. Ownership, patching and network placement must be settled before deployment, not after.

**Cloud placement has to consider what should not leave the site at all.** Recipes, throughput figures, quality data and process parameters may be commercially sensitive; where the data goes and under what terms is a governance question that engineers should raise even when it is not theirs to decide.

## Governance That Survives the First Urgent Request

Architecture erodes one exception at a time, and the erosion is always justified when it happens.

Three artefacts do most of the work:

- **A flow register.** Every crossing of the enterprise/OT boundary: source, destination, direction, protocol, purpose, owner, and behaviour on loss. A boundary whose flows cannot be listed is not controlled, whatever the firewall contains.
- **An approval path with a technical reviewer**, so that "we need this by Friday" produces a reviewed exception rather than an unreviewed rule.
- **A review cycle with removal authority.** Rules accumulate; nothing removes them unless someone is responsible for doing so. A flow whose owner has left and whose purpose nobody remembers should be closed, and the only safe way to find those is to look periodically.

**Safety functions are outside all of this.** Nothing in a convergence architecture should place a safety function's operation, or its ability to reach a safe state, on the far side of a converged link. That boundary is not a governance matter; it is a design constraint.

## Failure Modes

**Enterprise systems reaching into OT directly.** Read-only today, a path forever.

**A DMZ that accumulated applications.** A third production environment with no owner.

**MES dependency with no defined degraded mode.** An enterprise outage becomes a production stop.

**No local buffering of production records.** A link outage loses a shift's data permanently.

**Downloaded values applied without local range checking.** An upstream data error becomes a plant event.

**Central identity with no local fallback.** A directory problem locks operators out of a control room.

**An asset both teams assume the other patches.** It is patched by nobody, or patched during production.

**Edge devices deployed without ownership.** Firmware and credentials age in the OT zone with no responsible party.

**Exceptions without expiry.** The boundary permits more each year and less is understood about why.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A petrochemical site implements order and recipe download from a corporate MES to its blending units, replacing a manual entry process. The integration is thorough: validated, tested and documented. Production benefits are real — fewer entry errors, better traceability, faster changeovers.

Nine months later a corporate network change causes an extended interruption between the site and the central data centre. The MES is unreachable for several hours.

The blending units stop. Not because of a fault, and not because anyone intended it: the integration was designed on the assumption that the MES is available, and the "no order received" path leads to a hold state. No local recipe cache was implemented, because the MES was considered the authoritative source and duplicating it locally seemed like a data-integrity risk. Both decisions were defensible in isolation.

The evidence, reviewed afterwards, is uncomfortable: the plant's ability to produce had been transferred to a corporate WAN link, and nobody had written that down. The original risk assessment covered data integrity and cybersecurity thoroughly and did not include an availability line for "MES unreachable".

The remediation is not to abandon the integration. It is to define and implement a degraded mode: a locally held set of validated recipes for current products, an explicit operator-authorised path to run on the last known order, and local buffering of production records for later transmission. The dependency is then bounded — visibility and traceability degrade during an outage, production does not stop.

**The transferable point is the one the dependency test exists to catch: an integration that improves normal operation can silently create a new way for the plant to stop, and that possibility belongs in the design review rather than in the incident report.**

## Recommended Practice

- Keep the dependency principle from the layered model; discard the topology dogma.
- Classify every flow as northbound or southbound and treat southbound as an exception requiring individual justification.
- Ensure no enterprise system initiates a connection into the control environment; use a DMZ broker with one-way replication from the OT side.
- Keep the authoritative historian in OT and serve enterprise consumers from a replica.
- Limit what is hosted in the DMZ; describe each component in one sentence naming what it holds and who reads and writes it.
- Define and test the plant's behaviour when MES, identity, time source and cloud services are unavailable.
- Buffer production records locally and transmit when the link returns.
- Range-check downloaded values at the receiving controller; the plant retains authority to refuse.
- Provide local authentication fallback for OT-critical systems using central identity.
- Maintain an asset register with a named owner and patch regime per system; treat "unmanaged" as a finding.
- Settle ownership, patching and placement of edge devices before deployment.
- Maintain a flow register with behaviour-on-loss recorded, and review it with authority to remove.
- Keep safety functions entirely off converged dependencies.

## Conclusion

Convergence is not a question of whether to connect the plant to the business; that argument is settled and the benefits are real. It is a question of accounting — knowing, for each connection, what has been gained in visibility and what has been acquired in dependency.

The architecture that holds up is unglamorous: data flows north through a broker, control flows south only where it is justified and bounded, the plant keeps a defined way to operate when everything above it is unavailable, and every flow has an owner who could explain why it exists. The alternative is not a failed project. It is a plant that works beautifully until something in a data centre does not, at which point everyone discovers a dependency that was never on a drawing.
