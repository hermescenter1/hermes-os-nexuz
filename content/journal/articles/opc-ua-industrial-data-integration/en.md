# OPC UA Architecture for Industrial Data Integration

## Executive Summary

OPC UA is frequently adopted for the wrong reason — as a modern replacement transport for a legacy protocol — and consequently under-used. Its substantive contribution is not that it moves values between systems; many protocols do that. It is that values arrive carrying structure, type and meaning, so a consumer can discover what a device offers rather than being told out-of-band by a tag list in a spreadsheet.

That capability has a cost. An information model must be designed, a namespace strategy chosen, and a certificate trust relationship operated for the life of the system. Projects that take the transport and skip the modelling get a more complicated protocol with none of the benefit.

## What OPC UA Actually Provides

Three things, in descending order of engineering value:

**An information model.** A node in the address space is not just a value; it has a data type, an engineering unit, a browse name, references to other nodes, and potentially a type definition shared with every similar device. A pump exposed as a typed object is self-describing in a way that `DB100.DBD24` is not.

**A discovery mechanism.** A client can browse the server's address space and learn what exists. Integration stops depending on a maintained external tag list, which is the artefact most likely to be out of date.

**A security framework.** Certificate-based mutual authentication, message signing and encryption are part of the specification rather than bolted on. Whether that framework is used correctly is an operational question addressed below.

The transport itself is the least interesting part, and treating it as the point is the most common architectural mistake.

## Address Space and Namespace Strategy

The address space is where OPC UA either pays for itself or becomes an expensive flat tag list.

**The failure mode to avoid is publishing the program's internals.** It is easy to expose whole data blocks: every variable appears, integration proceeds, and the project moves on. What has happened is that internal program structure became an external contract. Renaming a variable, reordering a structure or refactoring a block now breaks a SCADA system, an MES connection or a reporting job — and nobody discovers this until the refactoring is already deployed.

**The alternative is a deliberate interface layer.** A small number of blocks exist specifically to be the published surface. Internal logic writes to them; the server exposes only them. Internal refactoring is then free, and the external contract changes only when someone decides it should.

**Namespace strategy** determines whether identifiers survive change. A few rules that hold up:

- Keep vendor and standard namespaces separate from your own. Mixing them means a firmware upgrade can collide with your identifiers.
- Prefer stable, meaningful identifiers over auto-generated numeric ones where the server allows it. A numeric node id that changes when the project is recompiled is not an integration contract.
- Decide early whether clients bind by node id or by browse path. Binding by browse path is more readable and more fragile; binding by node id is opaque and more stable. Whichever is chosen, it should be chosen rather than discovered.

**Type definitions are the mechanism that makes scale manageable.** Modelling one pump type and instantiating it four hundred times means a consumer writes one integration and applies it everywhere. Modelling four hundred individual pumps means four hundred integrations. The effort difference appears at the consumer, which is why it is often invisible to the team doing the server-side work.

## Sessions, Subscriptions and Monitored Items

The runtime concepts matter because they determine load, and load is where OPC UA deployments most often disappoint.

```text
Client
  └── Session            (authenticated, stateful)
        └── Subscription (a publishing rhythm)
              └── Monitored Item  (one node being watched)
                    ├── sampling interval
                    ├── deadband
                    └── queue size
```

Four parameters decide the traffic profile, and each is routinely left at a default:

| Parameter | Governs | Consequence of a careless default |
| --- | --- | --- |
| Sampling interval | How often the server checks the node | Faster than the process needs = wasted server load |
| Publishing interval | How often the server sends a batch | Very short intervals produce many small messages |
| Deadband | What counts as a change worth sending | Zero deadband on a noisy analogue floods the link |
| Queue size | How many changes are buffered per item | Size 1 silently discards intermediate changes |

The queue-size subtlety is worth stating explicitly, because it produces a data-integrity surprise rather than a performance one: **with a queue size of one, values that change faster than the publishing interval are overwritten, and the client sees only the latest.** For a trend that is usually acceptable; for a sequence of discrete states it means transitions are lost. If a consumer needs every state change, the queue must be sized for the worst-case change rate within a publishing interval.

**Server capacity is finite and specified.** The number of sessions, subscriptions and monitored items a controller-embedded server can support is a published figure per model. An architecture that adds SCADA, a historian collector, an MES connector and two engineering clients has added five sessions to every controller. Exceeding capacity does not produce a clear error at the design stage; it produces refused connections and intermittent faults after commissioning.

## Security in Practice

The specification provides a strong security framework. The failure is almost always operational rather than cryptographic.

**Security modes are a decision, not a default.** None, Sign, and Sign-and-Encrypt differ in what they protect. "None" is appropriate only in a genuinely isolated context, and the commissioning shortcut — set it to None to get a connection working, intending to change it later — is the single most common way an insecure endpoint reaches production.

**Certificate trust must be operable.** The mechanism requires each side to trust the other's certificate. The engineering questions that decide whether this survives:

- Who issues certificates, and is there a defined process, or does each device get a self-signed certificate manually trusted once and never reviewed?
- What happens when a certificate expires? An expiry that nobody tracked is an outage with no obvious cause, arriving at an arbitrary time.
- What is the replacement procedure when a device is swapped? Certificate handling therefore belongs in the commissioning procedure of the device, next to its address and its namespace, rather than in a security document nobody opens during a swap-out.

A trust model that is not operable will be bypassed — usually by disabling security — and a bypassed model provides nothing.

**User authentication is separate from certificate trust.** The certificate authenticates the *application*; user tokens authenticate the *person or service*. Both matter, and conflating them tends to produce a system where every client shares one identity and audit logs cannot attribute anything.

**Write access deserves separate treatment from read access.** A server that only publishes has a fundamentally smaller consequence surface than one accepting writes. Where writes are needed, enumerate them and restrict them at the server rather than relying on client discipline. This is IEC 62443's conduit thinking applied at the protocol level: the OPC UA endpoint is a conduit out of the control zone, and conduits are where policy is applied.

## Where OPC UA Is Not the Right Answer

An honest architecture recognises the boundaries.

**Hard real-time control.** Standard client/server OPC UA is not a substitute for a fieldbus for cyclic control traffic. Deterministic exchange between a controller and its I/O belongs on the industrial protocol designed for it.

**Very high-frequency data on constrained devices.** The per-item overhead is real. A device publishing thousands of fast-changing values may be better served by a purpose-built collector, with OPC UA carrying the aggregated or contextualised result.

**Trivial point-to-point integration.** Where one system needs a handful of values from one device, on an isolated link, the modelling and certificate lifecycle may cost more than they return. Modbus TCP is not obsolete because OPC UA exists; it is simpler, and simplicity is a legitimate engineering property.

**Legacy devices with no server.** These need a gateway, and that gateway becomes an architectural component with its own availability, security and lifecycle characteristics — not a transparent adapter. A gateway that translates a flat register map into a flat OPC UA address space has moved the data without adding the model, which is a reasonable interim step but should be recognised as one.

```text
Enterprise / MES
       |
   OPC UA client
       |
Industrial DMZ  -- aggregating OPC UA server / gateway
       |
   OT firewall
       |
OT zone -- SCADA, historian collector
       |
Controller-embedded OPC UA servers
       |
Fieldbus (cyclic control traffic — NOT OPC UA)
       |
Remote I/O / field devices
```

The layering point: OPC UA belongs at integration boundaries. The cyclic control layer beneath it stays on the protocol built for determinism.

## Failure Modes

**Internals published as the interface.** A refactor breaks three consumers; nobody knew they existed.

**Session exhaustion.** Each integration added one client; the controller's specified capacity was never checked; symptoms appear as intermittent communication faults.

**Queue size one on a state variable.** Intermediate transitions silently lost; a sequence appears to skip steps.

**Zero deadband on noisy analogues.** The link carries sensor noise at full sampling rate.

**Security set to None during commissioning.** Never changed, because nothing visibly depends on changing it.

**Certificate expiry.** An outage at an arbitrary future date, with a cause that is not obvious from the symptom.

**Gateway treated as transparent.** Its availability, patching and failure behaviour were never considered, and it becomes the single point of failure for all enterprise data.

## A Representative Scenario

*The following is an illustrative engineering example.*

A manufacturing site adds an MES connection to five existing production cells over OPC UA. Integration testing passes. Two weeks after go-live, operators report intermittent SCADA data loss on two cells, worst during shift changeover.

The evidence: the affected controllers show session counts at their specified limit. The MES connector opens a session per cell, as does the historian collector, and the engineering laptop opens one whenever it is connected. At shift changeover, an additional engineering client connects — and the oldest or newest session is refused depending on server behaviour.

Nothing is faulty. The architecture added consumers without counting them against a published capacity figure, and the failure surfaced only when a transient sixth consumer appeared.

The remedy is architectural rather than corrective: aggregate the enterprise-facing consumers behind a single DMZ-resident server that holds one session per controller and serves many clients, rather than every consumer connecting directly to the control layer. That pattern also happens to satisfy the zone boundary, which is why it is worth adopting before capacity forces it.

## Recommended Practice

- Design an information model; do not publish program internals as the interface.
- Confine the published surface to blocks that exist to be published.
- Model types and instantiate them, so consumers write one integration rather than many.
- Keep your namespace separate from vendor and standard namespaces.
- Choose node-id versus browse-path binding deliberately and document it.
- Set sampling interval, publishing interval, deadband and queue size per item against real requirements.
- Size queues for the worst-case change rate where every transition matters.
- Count every session against the server's published capacity before commissioning.
- Decide the security mode explicitly and never leave a commissioning "None" in production.
- Define certificate issuance, expiry tracking and device-replacement procedures before go-live.
- Aggregate enterprise consumers at a DMZ server rather than connecting them to the control layer.

## Conclusion

OPC UA repays the effort spent on modelling and costs more than it returns when used as a transport alone. The decisions that determine which outcome you get are made early: whether there is a designed interface or an exposed program, whether types exist, whether the namespace is stable, and whether the certificate model is something an operations team can actually run.

The honest closing point is the one vendors rarely make: OPC UA is the right answer at integration boundaries and the wrong answer for cyclic control. An architecture that respects that distinction gets a discoverable, typed, secured integration layer sitting cleanly on top of a deterministic control layer — and each does the job it was designed for.
