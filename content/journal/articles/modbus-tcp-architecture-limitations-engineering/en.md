# Modbus TCP Architecture, Limitations and Engineering Practices

## Executive Summary

Modbus TCP is the most widely implemented industrial protocol in service, and the reason is not technical excellence. It is that the protocol is small enough to implement correctly in a weekend, and small enough that almost every device supports it. That combination has kept it relevant for decades and will keep it relevant for decades more.

The engineering problem is what the protocol does *not* do. It moves 16-bit registers between a client and a server, and it attaches no type, no unit, no scaling, no timestamp, no quality indication and no identity to any of them. Every one of those things still has to exist somewhere — and where it exists is in a document, a spreadsheet or somebody's memory. That displacement, from protocol into paperwork, is the source of nearly every Modbus integration failure.

## What the Protocol Specifies — and What It Leaves to You

The specified part is short and worth stating precisely, because engineers routinely attribute to Modbus behaviours it never claimed.

**Specified:** a client/server transaction model over TCP, four data spaces (read-only bits, read/write bits, read-only 16-bit registers, read/write 16-bit registers), a set of function codes that read and write within those spaces, and an exception response mechanism for refusals.

**Not specified, and left entirely to the engineer:**

| Concern | Modbus position | Where it actually lives |
| --- | --- | --- |
| Data type | Everything is a 16-bit register | A register map document |
| Engineering unit | None | A register map document |
| Scaling | None | A register map document |
| Word order for 32-bit values | Not defined across registers | Convention, per device |
| Timestamp | None; a value is "now" or unknown | The client's own clock |
| Quality | None; a read either succeeds or fails | Inferred by the client |
| Discovery | None; the client must be told | A document, out of band |
| Identity / authentication | None | The network, or nothing |

The pattern is consistent: **Modbus is a transport for numbers, and the meaning of those numbers is a separate artefact that the protocol cannot validate.**

> The companion article on OPC UA covers the opposite design choice — an information model in which type, unit and structure travel with the value. Neither approach is universally correct; the point is knowing which one you have.

## The Register Map Is the Interface Contract

Because the meaning lives outside the protocol, the register map is not documentation *about* the interface. It **is** the interface. A register map that is out of date is not an inconvenience; it is a broken contract that the protocol will happily keep honouring with wrong numbers.

A register map that prevents the common failures states, per entry:

- Address, and **explicitly which addressing base** it is written in.
- Data space (input register, holding register, coil, discrete input).
- Data type and, for multi-register values, the **word order**.
- Scaling factor and engineering unit.
- Read-only or read/write, and for writable entries, what the write does.
- Valid range, and the value that indicates "invalid" if one exists.
- A version and a date.

**The most valuable single field in that list is the addressing base**, for reasons the next section explains.

## Addressing, Types and Word Order

Three ambiguities cause more Modbus commissioning time than everything else combined.

**Addressing base.** The historic documentation convention numbers holding registers from 40001, while the protocol wire format numbers them from zero. A device documented as "40001" is read at protocol offset 0. Vendors document inconsistently — some publish the wire offset, some the legacy number, some both, some neither clearly. The result is the classic off-by-one: everything reads, nothing means what it should, and the values look plausible enough that the error survives testing.

The engineering defence is not cleverness. It is **stating the base explicitly in the register map and verifying one known value at commissioning** — a running motor's current, a tank level someone can see — before trusting the rest.

**Data types.** A 32-bit float, a 32-bit integer and a timestamp are all conventions built on pairs of registers. The protocol defines byte order within a single register, but **the order of registers within a multi-register value is not defined by the protocol** — so two conforming implementations can disagree. This is the origin of the "byte swap" settings found in every Modbus client, and of values that read as absurd numbers or as near-zero when the halves are exchanged.

A practical diagnostic: **a 32-bit float that reads as a wildly wrong magnitude, while the same device's 16-bit integers read correctly, is a word-order problem, not a scaling problem.** Scaling errors produce values that are wrong by a clean factor; word-order errors produce values that are wrong by orders of magnitude or nonsensical.

**Signedness and scaling** are the third layer. A register carrying a temperature as tenths of a degree, signed, reads as 65,xxx when interpreted as unsigned and negative in reality. Every one of these is invisible to the protocol and visible only against a known physical value.

## Polling Strategy and Load

Modbus has no subscription mechanism. The client asks; the server answers; nothing arrives unsolicited. Everything about load follows from that.

**Group registers so that one request covers many values.** A read of a contiguous block costs one transaction; reading the same values individually costs one transaction each. This is why the register map should be *designed* with contiguity in mind — grouping values that are read together, at the same rate, into adjacent addresses. It costs nothing at design time and cannot be retrofitted without breaking every existing client.

**Poll rate belongs to the process, not to the hardware.** A tank level that moves over minutes does not benefit from a one-second poll, and the cost of that poll is paid on every device, every client and the network, permanently.

**Split the map by rate.** Values that need to be fast and values that need to be current-within-a-minute should not share a poll group; otherwise the slow ones set the cost of the fast ones or vice versa.

A useful way to think about the total: the load is *(number of transactions per scan) × (scan rate) × (number of clients)*, and each of those three factors is usually set by a different person without reference to the other two.

## Timeouts, Retries and What a Silence Means

This is where Modbus offers real diagnostic value, and it is routinely discarded.

**An exception response and a timeout are different events with different causes.**

- An **exception response** means the request reached a live server, which understood it and refused — a function code it does not support, an address outside its map, a value outside range, or a device-side fault. The path works; the request is wrong.
- A **timeout** means nothing came back — the path, the connection, or the device is the problem. The request may be perfectly valid.

Treating both as "communication error" throws away the single most useful distinction the protocol provides. **A client that logs the exception code separately from the timeout has converted a symptom into a direction.**

**Timeout selection** must exceed the device's worst-case turnaround, not its typical one. Small embedded servers deprioritise Modbus under load, and a timeout tuned to a quiet bench will expire under production conditions.

**Retries multiply load precisely when the system is least able to carry it.** A short timeout with aggressive retries turns a busy device into an unreachable one: each timeout produces another request, which lengthens the queue, which causes another timeout. Retry counts should be small, and the timeout should be long enough that a retry means something has genuinely failed.

**TCP hides physical problems.** Retransmission at the transport layer conceals a degrading link until it is bad enough to break the application. Where a link is suspect, the evidence is in the switch's port counters, not in the Modbus client.

## Connection Scaling and Gateways

**Each client opens its own TCP connection**, and embedded servers support a finite number. SCADA, a historian collector, a reporting connector and an engineering laptop are four connections to every device. Unlike some protocols, many Modbus devices do not publish a supported connection count at all — so the limit is discovered by exceeding it, typically as refused connections or as an existing client being dropped when a new one arrives.

The mitigation is architectural: **one poller reads the device; everything else reads the poller.** A single data concentrator with one connection per device, serving many consumers, removes the scaling problem and gives one place to put logging and rate control.

**Serial gateways deserve their own treatment**, because they are where fast TCP expectations meet a slow serial reality.

```text
SCADA ──┐
        ├── TCP (fast, parallel) ── Gateway ── RTU serial (slow, strictly sequential)
Historian ┘                                        │
                                            device 1 … device n
```

A gateway does not multiply the serial bus's capacity; it serialises everything onto it. Three TCP clients polling ten serial devices produce a queue, and the queue's length — not the network — determines response time. When a gateway is present:

- The serial side sets the achievable scan rate; the TCP side must be configured to it, not to what TCP could do.
- TCP timeouts must accommodate the queue delay, not the device's own response time.
- One slow or absent serial device delays every request behind it, which is why an unresponsive device on a shared line appears as a plant-wide slowdown rather than as one bad device.

## Security Position

Stated plainly: **Modbus TCP has no authentication, no authorisation and no encryption.** Anything that can reach the server's port can read any register in the map and, where the map allows writes, write to it. The protocol cannot be configured to prevent this because there is nothing to configure.

This is not a criticism — the protocol predates the threat model — but it is a design input:

- Because the protocol carries no identity to check, place it where segment membership is the identity.
- Let the boundary supply the authorisation the protocol cannot express itself.
- Prefer read-only paths for consumers that do not need to write, at the boundary rather than by client convention.
- Never expose a Modbus server across an untrusted boundary on the assumption that obscurity of the register map is protection. It is not; the map is small and enumerable.

> The companion article on secure PLC-to-SCADA communication covers the compensating-control architecture in full. The point here is narrower: no amount of Modbus configuration contributes to it.

## Diagnostics

A short evidence table that separates fault domains rather than listing causes:

| Symptom | Evidence | Likely domain |
| --- | --- | --- |
| Exception response on one address | Other addresses respond normally | Register map is wrong, not the network |
| Timeout on all addresses of one device | Other devices on the same switch respond | Device, its port, or its cable |
| Timeouts on several devices at once | They share a switch, gateway or uplink | Common infrastructure, not the devices |
| Values plausible but consistently wrong by a factor | Scaling documented differently by two parties | Register map, scaling column |
| 32-bit values absurd, 16-bit values correct | Halves read individually look sane | Word order |
| Response times growing with client count | Each client polls the device directly | Connection scaling; needs a concentrator |
| Intermittent timeouts under plant load | Correlates with a drive or crane, port errors rising | Physical layer, not Modbus |

**The reasoning pattern worth internalising: the protocol tells you whether the device answered. What answered together, and what failed together, tells you where the fault lives.**

## Failure Modes

**Addressing base assumed rather than stated.** Everything is off by one; values look plausible.

**Word order assumed.** 32-bit values are nonsense on one device and correct on another with the same map.

**Scaling held in one person's head.** The value is wrong the first time someone else touches it.

**Every value polled at the fastest rate available.** Permanent load with no operational benefit.

**Short timeout with many retries.** A busy device becomes an unreachable device.

**Every consumer connecting directly.** The device's undocumented connection limit is discovered in production.

**Gateway configured to TCP expectations.** Queue delay is blamed on the network.

**Exception responses logged as generic communication errors.** The most useful diagnostic signal is discarded.

**Register map not versioned.** A firmware update shifts addresses and nobody knows which client is now reading the wrong register.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A water utility integrates twelve borehole pump stations into a central SCADA system over Modbus TCP. Each station has a controller and a gateway to two serial flow meters. Commissioning is uneventful. Six weeks later, operators report that flow values on several stations are intermittently stale, and pump commands sometimes take a noticeable time to be reflected.

The evidence: the stale values are always the meter values, never the controller values. The controller and the meters are read by the same SCADA server, but by different paths — the controller directly over TCP, the meters through the gateway onto the serial line. Timeouts appear in the meter poll group only.

The design check finds the cause. The SCADA integrator configured every poll group at the same one-second rate, including the meters. On the serial side, two meters at that rate leave almost no idle time, and when the historian was added — a second client, also polling at one second — the gateway's queue grew beyond the configured TCP timeout. The pump-command delay is the same queue: writes wait behind the reads.

Nothing was faulty, and nothing was misconfigured in isolation. The error was applying a TCP-side assumption to a serial-side resource, and then adding a second consumer without recounting the load.

The remediation is unremarkable and structural: poll the meters at a rate the process actually needs, let the historian read from the SCADA server rather than from the gateway, and set the TCP timeout from the measured queue delay rather than from the meter's own response time.

## Where Modbus TCP Is the Right Choice

An honest assessment includes the cases where the simplicity is the feature.

- **A small, stable set of values from a device that will not change.** The modelling effort of a richer protocol returns nothing here.
- **Heterogeneous equipment from many vendors.** Modbus is the interoperability floor; almost everything speaks it.
- **Devices with constrained processors.** A full information model may not be available at all.
- **Integrations where the register map is genuinely stable and well documented.** Most of the protocol's weaknesses are weaknesses of the surrounding documentation practice, not of the wire format.

And the cases where it is the wrong choice: when the consumer needs to *discover* what a device offers, when values need to carry quality and timestamp for a historian, when the integration must be secured at the protocol level, or when a device's data set is large and changes often.

## Recommended Practice

- Treat the register map as the interface contract: versioned, dated, and owned.
- State the addressing base explicitly, and verify one known physical value at commissioning before trusting the rest.
- Document word order and signedness for every multi-register value.
- Design the map for contiguity, grouped by poll rate.
- Set poll rates from the process, not from the hardware's maximum.
- Set timeouts from worst-case turnaround; keep retry counts small.
- Log exception codes separately from timeouts — they point in different directions.
- Concentrate polling in one client and serve everything else from it.
- Where a serial gateway exists, size the whole design from the serial side.
- Confine Modbus to an enumerated segment and filter at the boundary; expect nothing from the protocol.
- Re-verify the map after any device firmware change.

## Conclusion

Modbus TCP is a good protocol for what it claims to be and a poor foundation for what people often assume it is. It moves registers; it does not carry meaning, and it cannot detect when the meaning has drifted away from the numbers.

That single property explains the discipline this article recommends. The register map, the addressing base, the word order and the poll rates are not administrative details — they are the parts of the interface the protocol declined to specify, and they are therefore the parts that will fail. Engineer them explicitly and Modbus TCP will run for twenty years. Leave them implicit and the protocol will keep working perfectly while delivering the wrong numbers.
