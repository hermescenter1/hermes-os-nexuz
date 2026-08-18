# Modern SCADA Architecture for Industrial Facilities

## Executive Summary

"SCADA" names a set of roles, not an application. Data acquisition, alarm and event processing, historisation, operator display, engineering and reporting have genuinely different availability requirements, different failure consequences and different lifecycles — and a design that treats them as one installable product inherits the worst availability characteristic of the whole set.

This article is about the boundaries between those roles: where they belong, what crosses them, and how the resulting architecture behaves when one part fails.

## Why This Matters

The question worth asking of any SCADA design is not "does it work?" but "what stops when each part of it stops?"

In a system where acquisition, historisation and engineering share a host, the answer is: everything, including the record of what happened during the outage. In a system where those roles are separated, an engineering-station failure costs nothing operationally, a historian failure costs data continuity but not control, and only an acquisition failure costs plant visibility.

Those are three completely different incidents. A design that cannot distinguish them will be operated as though every SCADA problem is a plant emergency, which is both exhausting and, eventually, desensitising.

The other reason this matters is that **SCADA is a supervisory layer, not a control layer**. Plant control lives in the PLCs and RTUs. A correctly architected facility keeps running — safely, in its current state — when SCADA is entirely absent. If losing SCADA stops production, some control function has been implemented in the wrong layer, and that is an architectural defect regardless of how reliable the SCADA happens to be.

## The Role Separation

```text
Enterprise / IT network
        |
    Firewall
        |
Industrial DMZ  ── replicated historian, reporting, remote-access broker
        |
   OT firewall
        |
============ OT / supervisory zone =====================
   |            |              |               |
 SCADA       Historian     Engineering      Operator
 server      (primary)     station          stations
   |
Industrial Ethernet (process control network)
   |
PLC / RTU / remote I/O / intelligent devices
```

Each role, and what it must survive:

| Role | Function | Availability need | Loss consequence |
| --- | --- | --- | --- |
| Acquisition / SCADA server | Polls devices, maintains real-time image, evaluates alarms | Highest in the supervisory layer | Plant visibility lost; control continues in PLCs |
| Historian | Persists time-series and events | High, but tolerant of short gaps if buffered | Data continuity gap; no immediate operational impact |
| Operator stations | Render the process, accept operator action | Redundant by count, not by pairing | One station lost = one operator relocates |
| Engineering station | Configuration, downloads, version control | Lowest | No operational impact; change capability paused |
| Reporting / analytics | Aggregation for non-real-time consumers | Lowest | Reports late |

The engineering point in that table is the last column. **Roles with different loss consequences should not share a failure domain.** Putting the engineering station's software on the SCADA server means a routine engineering task can destabilise plant visibility — and engineering tasks are, by their nature, the ones involving untested changes.

## Acquisition Layer Design

**Polling versus report-by-exception.** Cyclic polling is predictable and simple to reason about; its cost is bandwidth and controller communication load proportional to tag count rather than to change rate. Report-by-exception inverts that: quiet processes cost almost nothing, but a plant-wide upset produces a burst exactly when the network is least able to absorb it. Neither is universally right. What matters is that the choice is made against a measured tag-change profile rather than inherited from a template.

**Communication load is a controller property, not just a network one.** Every supervisory connection consumes controller resources — sessions, connection slots, acyclic communication budget. A design that adds a second SCADA server, a historian collector and three engineering clients has added four consumers to every controller, and controller communication capacity is specified per model. This is the single most common cause of "the PLC scan time went up after the SCADA upgrade".

**Data quality must be modelled, not assumed.** A supervisory value has at least three states: good, stale and unavailable. If the architecture collapses these into a number, then a communication failure presents as a frozen but plausible reading — the same failure mode that makes distributed I/O dangerous, promoted to the supervisory layer where operators make decisions. Every value that crosses into SCADA should carry a quality indication, and every display and calculation consuming it should respect that indication.

## Time Synchronisation

Time discipline is the quietest architectural decision and the one that most often makes post-event analysis impossible.

When a plant trips, the useful question is the order of events. Answering it requires that timestamps from different devices be comparable, which requires three things:

1. **A single time source hierarchy.** One authoritative source, distributed downward. Two independent sources on the same plant produce two mutually inconsistent event records.
2. **Timestamping as close to the event as possible.** Where the timestamp is applied decides what the archive can later be asked, and the acquisition layer is the only place that choice can be made. Devices that can timestamp at source should, and the architecture should carry that timestamp rather than overwriting it.
3. **An explicit decision about time zones and DST.** Storing local time in a historian creates one ambiguous hour per year and one missing hour per year. Storing UTC and rendering local is the only arrangement that is unambiguous.

The practical test: after any plant event, can someone reconstruct the sequence across PLC diagnostics, SCADA events and the historian without manual clock offsets? If not, the time architecture is not finished.

## Zone Boundaries and the DMZ

The zone model — from IEC 62443's zone-and-conduit thinking — maps naturally onto SCADA, and its main practical consequence is this: **enterprise consumers should not reach into the OT zone.**

The pattern that achieves it is a DMZ containing a replicated historian and reporting services. Business users query the replica; the replication flow is one-directional and passes through a controlled conduit. The OT zone therefore has no inbound business traffic at all.

What this buys is not only security. It also decouples lifecycles: the reporting stack can be patched, upgraded and restarted on business schedules without a change-control conversation about the process control network.

Two related decisions belong here:

- **Remote engineering access** is a conduit and should be designed as one: brokered, authenticated, logged, and terminating in the DMZ rather than in the OT zone.
- **Read and write paths deserve separate treatment.** A supervisory system that only reads has a fundamentally smaller consequence surface than one that writes setpoints. Where writes are required, they should be enumerated and constrained rather than implicit in a general-purpose connection.

## Redundancy — Scope and Honesty

Redundancy belongs to specific roles, not to "the SCADA".

The acquisition role is usually the one that justifies a redundant pair, because its loss costs plant visibility. Historians are more often protected by store-and-forward buffering at the collector than by a redundant server: if the collector buffers during a historian outage and forwards on recovery, the data gap closes by itself. Operator stations are made redundant by having several, not by pairing them.

Two honest caveats, treated properly in a dedicated companion article on redundant SCADA architectures:

- **A pair is a different system, not a safer copy of the same one.** Two servers introduce an arbitration problem the single server did not have, and arbitration is the part that fails: split-brain, and switchover triggered by a transient rather than by a genuine loss.
- **Pairing is therefore a scope decision, not a reliability upgrade.** Deciding which role gets a pair means accepting arbitration complexity for that role and rejecting it for the others — which is why buffering at the collector often serves the historian better than a second server would.

## Failure Modes

**Silent acquisition failure.** The SCADA server keeps running and keeps displaying the last received values. Nothing is obviously wrong; the numbers simply stopped changing. This is why the "unavailable" quality state must reach the display rather than being smoothed away.

**Historian gap discovered during an investigation.** The data needed to explain an event is missing precisely for the period of the event, because the disturbance that caused the event also disrupted collection. Store-and-forward buffering at the collector is the mitigation, and its buffer depth is an engineering parameter, not a default.

**Engineering change destabilising operations.** A configuration download, a driver update or a test performed on a shared host affects live acquisition. Prevented entirely by role separation.

**Time drift making an event log unusable.** Devices disagree by seconds; the trip sequence cannot be reconstructed; the investigation reaches a conclusion by argument rather than evidence.

**Controller communication saturation.** Each added supervisory consumer is invisible individually and decisive collectively. Symptom: scan-time increase and intermittent communication faults after a supervisory expansion nobody connected to the controller.

## Diagnostics: Stale Data on One Area

*The following is an illustrative engineering example, not an account of a specific project.*

**Symptom:** Values for one process area stop updating on the operator displays. Other areas are normal. The PLC for that area is running.

**Evidence to gather:**

- the quality indication on the affected tags (good / stale / unavailable)
- whether the PLC's own cycle time and diagnostic buffer are clean
- the SCADA driver's connection state for that controller
- controller connection/session count against its specified capacity
- switch port statistics on the path to that controller
- whether the affected tags share one driver, one connection, or one network path

**Reasoning:** If the PLC is healthy and its diagnostics are clean, the fault is above the controller. If all affected tags share a single driver connection, the fault is that connection rather than the network. If the controller's session count is at its limit, the newest consumer has been refused — which points at a recent supervisory addition rather than at a fault at all. If port statistics show rising errors on one path, the physical layer is the candidate.

The distinction that matters: **a healthy PLC with stale SCADA data is a supervisory-layer problem**, and looking for it in the control layer wastes the shift.

## Lifecycle and Maintainability

SCADA systems outlive the people who build them, and two practices decide whether that is survivable.

**Configuration under version control, with a defined baseline.** The question "what changed between the version that worked and the version that does not" must be answerable. This is as true for graphics and tag databases as it is for PLC code.

**A documented tag and naming convention that encodes area, equipment and function.** A tag found in an alarm should locate its source without a cross-reference tool. This is the same discipline that makes PLC programs maintainable, applied to the supervisory layer where the audience is broader.

The lifecycle asymmetry worth planning for: PLCs commonly remain in service far longer than server operating systems. An architecture that couples the supervisory software tightly to a specific OS generation will face a forced migration long before the plant does — which is an argument for keeping interfaces (OPC UA, documented tag structures) rather than proprietary couplings at the boundaries.

## Recommended Practice

- Separate acquisition, historisation, engineering and reporting into distinct failure domains.
- Keep control in the PLC/RTU layer; verify the plant is safe with SCADA entirely absent.
- Model data quality explicitly and let it reach the operator.
- Establish one time-source hierarchy, timestamp at source, store UTC.
- Place enterprise consumers behind a DMZ replica; keep the OT zone free of inbound business traffic.
- Count every supervisory consumer against the controller's specified communication capacity.
- Buffer at the historian collector so a historian outage does not become a data gap.
- Apply redundancy per role, and test switchover on a schedule.
- Put SCADA configuration under version control with a defined baseline.

## Conclusion

The quality of a SCADA architecture is measured by how precisely it fails. A design in which every fault presents as "SCADA is down" has told the operator nothing and forces every incident to be treated as maximal. A design with separated roles, explicit data quality, disciplined time and a real zone boundary produces incidents that are diagnosable in minutes and whose operational consequence is proportionate to what actually broke.

None of that comes from the product chosen. It comes from decisions about boundaries — made once, early, and expensive to retrofit.
