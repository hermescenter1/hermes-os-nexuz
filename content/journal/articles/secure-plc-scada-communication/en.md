# Engineering Secure PLC-to-SCADA Communication

## Executive Summary

The link between a controller and its supervisory system is usually drawn as a line on a network diagram and treated as a cable. It is not a cable. It is a path along which commands can reach equipment that moves, heats, pressurises and rotates — and the engineering question is not whether the link is encrypted but who may use it, in which direction, with what authority, and what happens when that assumption fails.

This article is about designing that path defensively. It does not cover offensive technique, and it deliberately treats encryption as one control among many rather than as the answer.

## Why This Matters

Most control protocols in service today were designed on an assumption that is no longer true: that anything able to reach the controller is authorised to instruct it. On an isolated bus that assumption was reasonable. On a routed network reachable from a business system, a remote-support connection or a contractor's laptop, it is a design defect that the protocol cannot fix.

The consequence is that **security for the PLC-to-SCADA path is architectural rather than protocol-level for a large fraction of installed plant.** Where the protocol offers authentication, use it. Where it does not — and it frequently does not — the network, the firewall policy and the access procedure carry the whole load, and they have to be designed as though they do.

## Zones, Conduits and Direction

The IEC 62443 zone-and-conduit model is useful here not as a compliance exercise but because it forces two questions that otherwise go unasked: *what is inside this boundary*, and *what specifically is allowed to cross it*.

A workable zone structure for a typical plant:

```text
Enterprise zone      business systems, reporting, ERP
        |
      conduit  (initiated from the DMZ side; enterprise never reaches OT)
        |
Industrial DMZ       data broker, aggregating server, remote-access gateway
        |
      conduit  (tightly enumerated: named hosts, named ports, one direction)
        |
Supervisory zone     SCADA servers, historian collectors, engineering station
        |
      conduit  (control protocol only, from supervisory to control)
        |
Control zone         PLCs, remote I/O, safety controllers
```

**Direction of initiation is the single most valuable design decision on this list.** A rule that permits the supervisory server to open a connection *to* the controller is very different from one that permits the controller — or anything else — to open a connection *from* the control zone outward. Data can flow up while connections are only ever established downward or from the DMZ inward, and that asymmetry removes an entire class of exposure without touching a protocol.

The corollary is that **the enterprise should never reach the control zone directly, even read-only.** A reporting query that traverses from a business network into a PLC has created a path that exists for the reporting query and for anything else that finds it. The aggregating server in the DMZ exists precisely so this path does not have to.

## Protocol Selection and the Legacy Reality

Protocols fall into three practical categories, and the architecture differs for each.

| Category | Examples | Security position | Architectural response |
| --- | --- | --- | --- |
| Secure-capable | Protocols with built-in authentication and encryption | Can carry their own trust | Enable and operate the security; verify it is actually on |
| Access-controlled | Protocols with controller-side protection levels or password tiers | Partial; protects configuration more than data | Use every level offered; do not treat it as sufficient alone |
| Unauthenticated legacy | Older register-based and fieldbus-era protocols | None by design | Compensating controls only: segmentation, filtering, monitoring |

**The unauthenticated legacy row is where most real plants live**, and pretending otherwise produces worse outcomes than accepting it. A protocol with no concept of identity cannot be made to have one by policy. What can be done:

- Confine it to a segment where every participant is known and enumerated.
- Filter at the boundary so only named source hosts may speak it.
- Monitor the segment, because with no authentication the only remaining evidence is behavioural.
- Treat any requirement to carry it across a boundary as an exception with a documented compensating control, not as routine.

**Do not select a protocol on security grounds alone.** A secure protocol used badly — reachable from everywhere, with one shared identity — is weaker than an unauthenticated one confined to a segment nothing else can reach. Protocol capability and architecture multiply; they do not substitute.

## Read/Write Separation

The most under-used control in this domain is also the cheapest: **most consumers of control-system data never need to write, and the architecture rarely reflects that.**

A historian collector reads. A reporting connector reads. A dashboard reads. A production-counting integration reads. If all of them connect through the same path and the same credentials as the systems that issue setpoints, then the consequence surface of every one of them is the consequence surface of a command channel.

Separating them is mostly a matter of deciding to:

- Give read-only consumers a path that is read-only at the boundary, not merely by convention in the client.
- Where the protocol has controller-side protection levels, use the read-only level for read-only consumers rather than the highest available for everything.
- Enumerate the command paths. There should be few, they should be nameable, and someone should be able to state which systems can write to which controller without looking it up.
- Keep the aggregating server in the DMZ read-only. It is the most exposed component in the chain; it should also be the one that cannot instruct anything.

The value of this shows up in incidents rather than in normal operation, which is why it is often skipped: a compromised or misbehaving read-only consumer is a data problem, while the same event on a write-capable path is a plant problem.

## Engineering Access

Engineering access is the hardest part of this architecture, because it is the one path that must be able to change the control system, and it is used by people under time pressure.

**Jump hosts are the standard answer and are frequently defeated by how they are used.** A jump host that everyone shares, with a common local account and no session recording, has moved the exposure rather than reduced it. What makes one effective:

- Individual accounts, so an action is attributable to a person.
- The engineering tools installed on the jump host, so laptops do not need control-zone reachability.
- Session logging that survives the session.
- No general internet reachability from the host itself.

**Portable engineering equipment is a boundary crossing in its own right.** A laptop that connects to the corporate network on Monday and to the control network on Tuesday has bridged two zones with its own storage as the conduit. Dedicated, controlled engineering machines are the conventional mitigation; where that is impractical, the risk should be recorded rather than assumed away.

**Remote access for vendors and integrators** deserves explicit treatment because the pressure to grant it arrives during an outage, when nobody wants to discuss architecture. Properties worth deciding in advance, in writing:

- Access is enabled for a defined window and disabled afterwards — by a mechanism, not by intention.
- Someone on site knows a session is active.
- The session reaches a defined host, not the control zone generally.
- Actions are recorded.

The recurring failure is not that remote access exists; it is that it was enabled once for a commissioning issue and never turned off, and that nobody can now say who has it.

## Credential and Certificate Lifecycle

Where mechanisms exist, they need an owner and a lifecycle, or they degrade into obstacles that get bypassed.

**Controller protection levels and passwords.** Set at commissioning, then typically never revisited. The practical questions: is the same password on every controller in the plant, is it known to former staff and past contractors, and is there any record of who holds it? A single shared secret with no rotation is a control on paper only.

**Certificates, where the protocol uses them.** The lifecycle is what fails, not the cryptography — issuance, expiry tracking and device replacement. An expired certificate produces an outage at an arbitrary time with a cause that is not visible from the symptom, and a spare device with a new certificate will not connect until someone trusts it. Any trust model without a defined replacement procedure will be bypassed the first time a device is swapped at night.

**Service accounts.** Each integration should have its own, with only the rights it needs. A shared account used by four systems means no log can attribute anything, and revoking it breaks all four.

## Monitoring and Logging

Monitoring in OT differs from IT monitoring in one important way: **the traffic is more predictable, which makes deviation more meaningful.**

A control network's normal state is a small set of hosts exchanging a small set of protocols on a repetitive rhythm. That is a weak baseline in a data centre and a strong one here. Deviations worth noticing:

- A new device appearing on a control segment.
- A host speaking a protocol it has never spoken before.
- A connection attempt to a controller from an address not on the enumerated list.
- Write operations from a source that historically only read.
- Engineering-protocol activity outside a maintenance window.

**Passive observation is preferable to active scanning on control segments.** Scanning tools designed for IT networks can disturb devices that were never built to be scanned, and an availability incident caused by a security tool damages the security programme more than the finding was worth.

**Logs need to leave the device.** Controller and switch logs are small, circular and lost on power cycle. If the record of an event matters, it has to be somewhere else before the event is investigated — which means before it happens.

**Time synchronisation is a security requirement, not just a data-quality one.** Correlating a SCADA log, a firewall log and a controller event across three clocks that disagree turns an investigation into guesswork.

## Incident Containment

The last part of the design is the one most often absent: what to do when something is wrong, decided before it is wrong.

The tension is real and should be stated plainly: **the fastest containment action — disconnect — may itself be the most damaging action available**, because a supervisory system removed mid-process may leave operators without visibility on a running plant. Control usually continues in the PLCs, but blind operation is its own hazard.

What a workable containment plan settles in advance:

- Which segments can be isolated without stopping production, and which cannot.
- What operators lose in each isolation case, and whether the plant can be run that way.
- Who has authority to make the decision at three in the morning.
- How the plant reaches a safe state if the supervisory layer must be removed.
- What evidence to preserve before restoring, because a restore usually destroys it.

A containment plan that has never been reviewed with operations is a document, not a capability.

## Failure Modes

**Flat network with a firewall at the perimeter only.** Anything inside the perimeter reaches the controllers; the boundary protects against outside and nothing else.

**Any-any rules created during commissioning.** Written to get the plant running, never narrowed, still present years later.

**Enterprise reads reaching the control zone.** A reporting requirement created a path that outlived the report.

**One shared engineering credential.** No attribution possible; still valid for people who left.

**Remote access left enabled.** Opened for one incident, never closed, no current record of who can use it.

**Read-only consumers on write-capable paths.** Every integration carries command-channel consequence.

**Logs that never left the device.** The investigation begins after the circular buffer has wrapped.

**No containment plan.** The decision to isolate is made under pressure, without knowing what operators will lose.

## A Representative Scenario

*The following is an illustrative engineering example.*

A plant investigates unexplained setpoint changes on a packaging line. Operators report values differing from what they set; there is no alarm, and the SCADA event log shows the changes without a source.

The evidence assembles as follows. The line's controllers sit on a segment reachable from the site's general engineering VLAN. A legacy protocol without authentication carries the setpoint writes. Three systems can write: SCADA, a historical test tool left installed on an engineering PC, and a spreadsheet-driven production tool built years earlier by a since-departed engineer. All three use the same path, and the protocol carries no identity, so the SCADA log records the change but not its origin.

The tool proves to be the source: it writes a recipe value on a schedule, using a stale configuration.

Nothing here was an attack. But the same properties that made a benign tool produce unexplained changes — no identity, no source restriction, no read/write separation, no attribution — are precisely the properties that would make a genuine incident hard to detect and harder to scope. The investigation succeeded because someone recognised the pattern, not because the architecture produced evidence.

The remediation is structural: enumerate every host that may write to that segment, filter at the boundary to that list, give read-only consumers a read-only path, and record write operations with their source. The forgotten tool is then either an authorised, documented writer or it cannot write at all.

## Commissioning Considerations

Security decisions made during commissioning tend to become permanent, because the commissioning shortcut has no visible consequence and no expiry.

- Record every temporary rule with an owner and a removal date; review the list before handover.
- Verify the security configuration that is meant to be active is actually active — configured and effective are different states.
- Change default credentials, and record where each one now lives.
- Capture a baseline of normal traffic while the plant is known-good. It is the reference every future investigation will want and the one nobody thinks to take.
- Hand over the firewall rule set with a stated intent per rule. A rule whose purpose nobody remembers will never be safely removed.

## Recommended Practice

- Define zones and enumerate what crosses each conduit; treat unenumerated traffic as prohibited.
- Decide direction of initiation deliberately; never allow the enterprise to reach the control zone directly.
- Match architecture to protocol capability, and accept that unauthenticated legacy protocols need compensating controls rather than optimism.
- Separate read from write at the boundary, not by convention in the client.
- Keep the DMZ aggregating server read-only.
- Route engineering access through individually attributable jump hosts with session logging.
- Enable vendor remote access for a defined window by mechanism, and ensure site staff know when a session is live.
- Give each integration its own service account with only the rights it needs.
- Baseline normal traffic, monitor passively, and ship logs off the device.
- Synchronise time across control, supervisory and security systems.
- Agree the containment plan with operations, including what is lost in each isolation case.

## Conclusion

The security of a PLC-to-SCADA path is decided by architecture far more than by protocol. Direction of initiation, an enumerated conduit, read/write separation and attributable engineering access do more for a plant than any single cryptographic control, and they work on the installed base that cannot be replaced.

The honest position on legacy protocols is worth restating: they will not become secure, and the design has to hold without them being secure. That is achievable — but only if the boundary, the access procedure and the monitoring are engineered with the same seriousness normally reserved for the control logic itself.
