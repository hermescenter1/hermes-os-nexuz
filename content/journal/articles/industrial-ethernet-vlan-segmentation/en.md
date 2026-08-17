# Industrial Ethernet Network Segmentation and VLAN Design

## Executive Summary

Segmentation advice written for corporate networks transfers badly to a plant, and the reason is specific rather than cultural: **a significant part of industrial communication does not route.** Device discovery, name assignment, some diagnostics and several protocol mechanisms operate at layer 2 only. A VLAN boundary in an office is an administrative line. In a plant it can be the line at which a controller stops being able to find its own I/O.

That single constraint reorganises the whole design. The routed edge has to sit *above* the cell, the broadcast domain has to be drawn around what must talk without a router in between, and the resulting VLANs turn out to be failure domains before they are anything else.

## The Engineering Problem

Three properties of industrial traffic drive the design, and none of them appear in general networking guidance.

**Layer-2-only mechanisms.** Discovery and identification protocols used to find, name and address field devices are broadcast or multicast at layer 2 and do not cross a router. Anything that depends on them — commissioning tools, device replacement, topology detection — must be in the same broadcast domain as the devices.

**Multicast as a normal operating mode.** Several industrial protocols distribute cyclic process data by multicast rather than unicast. In a switch without multicast filtering, that traffic is flooded to every port in the VLAN, meaning an unrelated device receives and must discard traffic it never asked for. On a small embedded device, that discard work is not free.

**Availability that outranks confidentiality.** The design pressure in a plant runs the opposite way to an office. A segmentation scheme that adds a device or a rule between a controller and its I/O has added a component whose failure stops production. **Every routed boundary inside the control layer is an availability liability, and it needs a reason stronger than tidiness.**

## What Belongs in the Same VLAN

The useful design question is not "how many VLANs should we have" but "what forces these devices into the same broadcast domain, and what forces them apart". Four tests, applied in order:

1. **Do they need to reach each other without a router?** If a controller must discover, name or exchange cyclic data with a device using layer-2 mechanisms, they belong together. This test alone decides most of the topology.
2. **Do they share a failure domain the plant already accepts?** Devices belonging to one machine that stops as a unit can share a broadcast domain; devices in independent process areas should not, because a storm or a misconfiguration then crosses a boundary the process does not have.
3. **Do they share a traffic character?** Cyclic I/O, supervisory polling, video and file transfer behave differently. Mixing a bulk transfer with cyclic control in one broadcast domain means the bulk transfer's bursts are the control layer's problem.
4. **Do they share a lifecycle?** Equipment that is commissioned, patched and modified together causes less disruption when it is grouped than when a change in one area requires touching a VLAN that spans three.

A structure that results from applying those tests to a typical plant:

```text
Enterprise LAN
      |
   Firewall
      |
 Industrial DMZ        (data broker, remote-access gateway)
      |
   OT Firewall
      |
+---------------------------+
| Supervisory VLAN          |  SCADA, historian collector
+---------------------------+
      |
 Core OT switching  ── Management VLAN (switch/infrastructure only)
   /        |        \
Cell A     Cell B     Utilities        <- one VLAN per cell,
VLAN       VLAN       VLAN                controller + its I/O together
```

**The important property of that diagram is where the routed boundary is not.** It is not between a controller and its remote I/O, and not between a controller and the engineering tool that must discover it. It sits between the cells and the supervisory layer, where the traffic crossing it is already IP-routable by design.

## Layer 2 Versus Layer 3 in an OT Context

| Property | Layer 2 separation (VLAN) | Layer 3 separation (routed) |
| --- | --- | --- |
| Contains broadcast/multicast | Yes | Yes |
| Passes layer-2 discovery protocols | Yes, within the VLAN | No |
| Natural place for a policy rule | No | Yes |
| Adds a device that can fail | No | Yes |
| Adds troubleshooting complexity | Modest | Significant |
| Suitable inside a control cell | Yes | Rarely |
| Suitable between cell and supervisory | — | Yes |

The reasoning to carry away: **VLANs contain faults; routed boundaries apply policy.** Use the first freely inside the control layer, and the second deliberately at the edges of it.

**Over-segmentation is a real failure mode, not a theoretical one.** Every routed hop between a controller and something it depends on is a rule that can be wrong, a device that can fail, and a step a technician must understand at three in the morning. A plant network with more boundaries than the process has independent areas has bought policy granularity with availability, usually without anyone stating that trade.

## Multicast and Broadcast Containment

This is the most OT-specific part of the design and the one most often skipped.

**Multicast filtering must be configured, and it needs a querier.** Switches suppress unnecessary multicast flooding by learning which ports have interested receivers, but that learning depends on periodic queries. In an office, the router provides them. In an isolated control VLAN there may be no router at all — so unless a switch is explicitly configured to act as querier, the filtering either never activates or ages out and the traffic reverts to flooding everywhere.

The failure this produces is characteristic and worth recognising: **a cell that has worked for months begins showing communication faults after unrelated devices were added elsewhere in the same VLAN**, because the added multicast is now flooded to devices that have no interest in it and limited capacity to discard it.

**Broadcast containment is what makes a VLAN a failure domain.** A device with a failed network interface can emit continuous broadcast traffic; a misconfigured tool can do the same. Within a VLAN, everything is affected. Across a VLAN boundary, nothing is. Sizing broadcast domains to match the plant's independent areas means that the blast radius of an unpredictable event matches an area the plant already knows how to run without.

**Storm control is a mitigation, not a design.** Rate-limiting broadcast on access ports contains a faulty device. It does not make an oversized broadcast domain acceptable.

## Trunks, Access Ports and the Details That Bite

**Field devices belong on access ports, untagged.** Most industrial devices have a single interface with no VLAN awareness. Putting one on a trunk, or expecting it to interpret tags, produces a device that appears on the network and does not communicate.

**Trunks carry only the VLANs they need to.** A trunk configured to carry everything by default extends every broadcast domain across every link, quietly undoing the segmentation the design intended. Pruning the trunk list is a five-minute task at commissioning and a forensic exercise afterwards.

**The untagged VLAN on a trunk deserves an explicit decision.** Leaving it at the switch's default means any port misconfiguration lands traffic in a VLAN nobody planned, and default-VLAN traffic is the traffic least likely to be monitored.

**Port descriptions are diagnostic infrastructure.** A switch whose ports are labelled with the device and location they serve turns "port 14 is down" into "the palletiser's remote I/O is down". Without them, every incident begins with tracing cables.

## The Management VLAN

Infrastructure management belongs in its own VLAN, and the reasoning is availability rather than security posture.

**A management path that shares fate with the fault it must report is not a management path.** If the switch's management interface is reachable only through the same uplink that has just failed, the switch becomes uncontactable exactly when its counters and logs are the evidence needed. Where the consequence justifies it, an out-of-band route to core infrastructure earns its cost the first time it is used.

Further properties worth deciding explicitly:

- Management interfaces should not be reachable from cell VLANs. A field device has no reason to talk to a switch's management plane.
- Time synchronisation, logging and monitoring should reach the management VLAN by a defined path, because correlating a network event with a plant event requires both to be timestamped consistently.
- Engineering workstations need a controlled route to cells for commissioning. That route is a deliberate exception, and it should be documented as one rather than being an artefact of a flat address plan.

> What a segment does not decide — who may cross it, with which protocol, and under whose authority — is the subject of the companion article on securing PLC-to-SCADA communication. This article is about the network structure those controls are applied to; the two decisions are related but separately made.

## Diagnostics

Segmentation changes what symptoms mean, and a segmented network is diagnosable in a way a flat one is not — provided the design is documented.

| Symptom | Evidence | Likely domain |
| --- | --- | --- |
| Device reachable by IP, but engineering tool cannot discover it | Tool is on a different subnet | A routed boundary is blocking a layer-2-only mechanism |
| One cell's devices drop together | They share a VLAN and an uplink | Distribution layer, not the devices |
| Devices in several cells drop together | The cells share a trunk or core switch | Core or trunk, not the cells |
| A cell degrades after unrelated work elsewhere | The two areas share a broadcast domain | Segmentation boundary is drawn wrong |
| Multicast-based I/O intermittent, unicast fine | Flooding visible on uninvolved ports | Multicast filtering inactive; no querier |
| Switch unreachable during an incident | Management shares the failed uplink | Management path design |
| A device works on one port, not another | Port VLAN assignment differs | Access-port configuration |

**The reasoning throughout is the same: what failed together shares something, and the segmentation design tells you what that something is.** On a flat network, simultaneous failures carry almost no information; on a segmented one, they identify the layer.

## Documentation That Makes the Design Survivable

A VLAN design that only exists in switch configurations is a design that will be undone by the next expansion.

The minimum artefact set, and what each one prevents:

- **VLAN register** — ID, name, purpose, subnet, which areas it serves. Prevents reuse of an ID for two purposes on different switches.
- **Allowed-flow list per routed boundary** — what crosses, in which direction, and why. Prevents rules nobody dares remove because nobody knows what they were for.
- **Physical-to-logical map** — which switch, which port, which device, which VLAN. Prevents every incident starting with cable tracing.
- **Trunk VLAN lists** — what each inter-switch link is permitted to carry. Prevents segmentation silently dissolving.
- **An addressing plan with room in it.** Blocks reserved per area mean an expansion does not force a re-address, and a re-address forces changes in every controller configuration that references an IP.

## Failure Modes

**Routed boundary inside a cell.** Discovery and device replacement stop working; the tool that worked at commissioning does not work in the plant.

**One flat control VLAN across the site.** A single faulty interface affects every area; nothing localises.

**Trunks carrying all VLANs by default.** The design is documented as segmented and behaves as flat.

**Multicast filtering with no querier.** Filtering ages out; traffic reverts to flooding; symptoms appear months later.

**Management VLAN dependent on the production uplink.** The switch is unreachable exactly when it holds the evidence.

**VLAN IDs reused with different meanings on different switches.** A trunk between them merges two unrelated domains.

**No addressing headroom.** An expansion forces re-addressing, and re-addressing touches controller configurations.

**Undocumented exception rules.** Accumulated over years, never removed, and eventually the boundary permits more than the flat network it replaced.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A steel plant's material-handling area is extended with two new conveyor cells. The network design places every cell in the existing site-wide control VLAN, as the original cells were. The extension is commissioned successfully.

Three weeks later, one of the *original* cells begins showing intermittent I/O communication faults during specific production sequences. The cell has not been modified. Its devices, cabling and controller are checked and replaced in part; the faults continue.

The evidence that reframes the problem: the faults correlate in time with the new cells running their high-speed transfer sequence, and switch statistics show a substantial multicast load arriving at ports belonging to the original cell — ports whose devices have no interest in that traffic. Multicast filtering is enabled on the switches, but no querier is configured anywhere in the VLAN, and there is no router inside it to provide one. The filtering state ages out, and the switches revert to flooding.

The original cell's devices were operating with adequate margin before; the additional flooded traffic consumed it.

Two corrections are available and both are worth making. The immediate one is to configure a querier so multicast filtering remains active. The structural one is that the two new cells should never have shared a broadcast domain with the original ones: separate cell VLANs would have contained the traffic regardless of the filtering state, and would have made the original cell's symptoms impossible.

**The general lesson is the one that recurs in OT segmentation: a design that depends on a protocol feature staying configured is weaker than a design whose structure makes the failure impossible.**

## Commissioning and Change Control

- Verify VLAN membership per port against the design before energising, not after a fault.
- Confirm multicast filtering is active *and* that a querier exists and is stable; re-check after any core switch replacement.
- Prune trunk VLAN lists explicitly; do not accept defaults.
- Test the management path with the production uplink deliberately removed.
- Record the as-built VLAN register and physical-to-logical map at handover; an as-designed document that was never reconciled is worse than none, because it will be trusted.
- Treat any new routed boundary inside the control layer as a design change requiring justification, not a configuration task.

## Recommended Practice

- Draw broadcast domains around what must communicate without a router, then check them against the plant's independent areas.
- Keep the routed edge above the cell; never place one between a controller and its I/O or its engineering tool.
- Use one VLAN per cell so a broadcast fault matches an area the plant can already run without.
- Configure multicast filtering and an explicit querier; verify it stays active.
- Put field devices on untagged access ports; keep trunks pruned to the VLANs they must carry.
- Decide the untagged VLAN on trunks explicitly rather than inheriting a default.
- Give infrastructure management its own VLAN and a path that survives a production uplink failure.
- Label every port with the device and location it serves.
- Maintain a VLAN register, an allowed-flow list per boundary, and an addressing plan with headroom.
- Resist segmentation that the process does not justify — each routed boundary is an availability cost.

## Conclusion

Industrial segmentation is a different discipline from its office counterpart because the traffic has different rules. Protocols that do not route dictate where broadcast domains must be, cyclic and multicast traffic dictate how large they can be, and the plant's own independent areas dictate where the boundaries belong.

Get those three right and the VLAN structure becomes a diagnostic asset: what fails together tells you which layer to look at, and the segmentation itself keeps a local fault local. Get them wrong — a routed boundary inside a cell, one flat domain across a site, or multicast filtering that silently ages out — and the network delivers the worst of both worlds: the operational complexity of a segmented design with the failure behaviour of a flat one.
