# Redundant SCADA Architectures for Mission-Critical Plants

## Executive Summary

Redundancy is usually specified as a property to be acquired: the system is redundant, therefore it is available. That framing hides the engineering. A redundant pair removes one failure mode — the loss of a single server — and introduces a set of new ones that a standalone system cannot have: disagreement about which node is primary, switchover triggered by a transient, and a standby that has been quietly broken for months.

This article is about those new failure modes and the design decisions that contain them.

## Why This Matters

The uncomfortable observation about redundant systems is that a meaningful share of their outages are caused by the redundancy mechanism rather than prevented by it. A standalone server fails in one way. A pair can additionally fail by both nodes claiming primary, by neither claiming it, by flapping between them, or by failing over to a standby whose data or configuration diverged.

None of that argues against redundancy. It argues that redundancy is a design with its own failure analysis, not a checkbox — and that the question "is it redundant?" is far less useful than "what happens, specifically, when the primary stops?"

> Redundancy scope — which roles justify a pair at all — is treated in the companion article on SCADA architecture. This one assumes the decision has been made and asks how to build the pair so it behaves.

## Active/Passive and Active/Active

| Property | Active/Passive | Active/Active |
| --- | --- | --- |
| Data consistency | Simpler: one writer at a time | Harder: concurrent writers need coordination |
| Switchover visibility | A transition occurs; clients may see a gap | No transition for surviving clients |
| Standby exercise | Standby is idle — decay is invisible | Both nodes are continuously proven |
| Capacity | Half the hardware carries the load | Load shared; a failure means degraded capacity |
| Failure surface | Smaller; fewer coordination paths | Larger; coordination is itself a failure mode |

The trade-off worth stating plainly: **active/passive is simpler to reason about but hides standby decay, while active/active continuously proves both nodes but introduces coordination as a new failure mode.**

The hidden-decay problem deserves emphasis. In an active/passive pair, the standby does nothing observable for months. Its storage may be full, its licence expired, its configuration stale, its network path broken — and none of that is visible until the moment it is asked to take over. This is why periodic *planned* switchover matters more than any amount of monitoring: it is the only test that exercises the actual path.

**Capacity honesty for active/active:** if both nodes routinely run at high utilisation, then the surviving node after a failure is overloaded, and the architecture has traded a clean failure for a degraded-service failure. Each node must be able to carry the whole load, or the redundancy is partial and should be described as such.

## Heartbeat Design

The heartbeat is how each node decides whether its partner is alive, and its design determines whether the pair behaves correctly under partial failure.

**Path independence is the property that matters.** If the heartbeat travels the same physical path as the data traffic, then a network failure looks identical to a partner failure — and both nodes conclude the other is dead while both remain alive and connected to their own clients. That is split-brain, and it is caused by the heartbeat design rather than by the network.

The mitigation is redundant, independent heartbeat paths: typically a direct link between the nodes in addition to the network route, so that losing one does not imply partner death.

**Timing must be reconciled with the network's own recovery behaviour.** If the plant network uses a ring protocol with a reconfiguration time, and the heartbeat timeout is shorter than that reconfiguration, then every ring recovery triggers a SCADA switchover. The pair will fail over on events the network was designed to absorb. Heartbeat timeout must exceed the worst-case network recovery time with margin — which requires knowing that number rather than assuming it.

**A tie-breaker resolves the ambiguous case.** When a node cannot reach its partner, it cannot distinguish "partner dead" from "I am isolated". A third reference — a witness, a quorum device, or a shared resource that only one node can hold — converts an unanswerable question into a decidable one. Without it, the design is relying on the heartbeat never being wrong.

## Split-Brain

Split-brain is the failure where both nodes act as primary simultaneously. Its consequences differ by role, and the difference decides how much effort prevention deserves.

For a **read-only supervisory function**, two active primaries are mostly harmless: two servers poll the same controllers, producing duplicate load but no conflicting action.

For anything that **writes** — setpoints, commands, sequence control — two primaries are a genuine hazard, because two independent supervisory systems may issue conflicting instructions to the same plant.

For the **historian**, split-brain produces two divergent archives, both incomplete, with no authoritative record of the period.

The engineering consequence: **the write path deserves stronger split-brain protection than the read path.** Where a supervisory system holds command authority, an explicit exclusive-ownership mechanism — only the node holding a token may write — is worth its complexity. Where the system only reads, a simpler arrangement is defensible.

## Client and Controller Failover

Redundancy at the server is worthless if the clients do not follow.

**Operator stations must fail over without operator action.** A client that requires someone to notice, understand and manually reconnect has moved the recovery time from milliseconds to however long it takes to realise something is wrong — during an event, potentially a long time.

Three properties worth specifying:

- **The client's own detection time**, which is separate from the server's switchover time. Total recovery is the sum, not the larger.
- **What the display does during the gap.** Values must show as stale or unavailable, not freeze at their last value. A frozen display during a switchover is indistinguishable from a stable process.
- **Whether operator context survives.** Losing the current display, the trend window and any partially entered command turns a technical switchover into an operational disruption.

**Controller-side failover** carries a constraint that catches projects out: each supervisory node consumes controller communication resources, and a redundant pair may consume them from both nodes simultaneously. If the controller's connection capacity was sized for one supervisory consumer, the pair will exhaust it — and the symptom appears as intermittent communication faults rather than as a redundancy problem.

## Synchronisation and Divergence

The standby is only useful if its state is close enough to the primary's to take over meaningfully. Three categories diverge differently:

**Configuration** — graphics, tag database, alarm settings. Divergence here is the most damaging and the least visible: a standby with last year's configuration takes over and presents a plant that no longer exists. Configuration should be deployed to both nodes by one mechanism, and equality should be verified rather than assumed.

**Real-time state** — current values, alarm states, acknowledgement status. Some loss is usually acceptable; what matters is that the behaviour is defined. If unacknowledged alarms do not survive a switchover, operators will re-receive alarms they already handled, which is survivable but must be known.

**Historical data** — handled by store-and-forward at the collector rather than by server pairing, as discussed in the historian article.

The practical check: **can you demonstrate that the standby's configuration matches the primary's, right now, without a manual comparison?** If not, the pair has an untracked divergence risk regardless of how healthy its heartbeat looks.

## Recovery Objectives

Where recovery objectives are used, two are worth stating precisely because they are frequently conflated:

- **Recovery time** — how long until supervisory function is restored. For a SCADA pair this is switchover time plus client reconnection time.
- **Recovery point** — how much data may be lost. For supervisory data this is usually bounded by the collector buffer rather than by the server pair.

The honest framing for a supervisory layer: **neither objective describes plant safety**, because control remains in the PLCs throughout. They describe how long the plant runs without visibility and how much history is missing — both real costs, but not the same category as a control-layer outage.

## Maintenance Under Redundancy

One of redundancy's genuine benefits is the ability to patch, upgrade or restart one node while the other carries the load. Realising it requires two disciplines:

**A defined procedure with a verification step at each stage** — take the standby out, work on it, verify it, return it, switch over deliberately, verify, then work on the other node. Skipping the deliberate switchover means the upgraded node has never actually carried load until the day it must.

**Version-skew awareness.** Running two nodes at different software versions during an upgrade window is normal; running them that way indefinitely because the second upgrade was deferred is a divergence risk that grows silently.

## Failure Modes

**Split-brain from a shared heartbeat path.** Network fault reads as partner death; both nodes go primary.

**Switchover on a transient.** Heartbeat timeout shorter than network recovery; the pair fails over every time the ring reconfigures.

**Standby decayed.** Full disk, expired licence, stale configuration or broken network path, discovered at the moment of need.

**Clients that do not follow.** Server switchover succeeds in milliseconds; operators reconnect manually in minutes.

**Frozen displays during switchover.** Values hold their last state; operators cannot tell the difference between a stable process and a disconnected one.

**Controller connection exhaustion.** Both nodes connect; capacity sized for one; intermittent faults blamed on the network.

**Flapping.** Repeated switchover between nodes because the trigger condition is marginal and no damping exists.

## A Representative Scenario

*The following is an illustrative engineering example.*

A water utility's redundant SCADA pair fails over roughly twice a month. Each event is brief, operators barely notice, and the pair recovers cleanly — so it is recorded as "redundancy working as designed".

The evidence says otherwise. Switchovers correlate with network events on the plant ring, which reconfigures after cable disturbances during ongoing civil works. The heartbeat runs over the same ring, and its timeout is shorter than the ring's reconfiguration time.

So each ring recovery — an event the network is designed to absorb transparently — is interpreted by the SCADA pair as partner death. The pair is not demonstrating resilience; it is generating avoidable transitions, each one a small operational disruption and each one an opportunity for a worse outcome if it coincides with a genuine fault.

The remedy is not a better ring. It is an independent heartbeat path and a timeout derived from the measured worst-case network recovery — a configuration decision, not a hardware one.

## Testing

The single most valuable practice in redundancy engineering is also the least performed: **deliberately switching over on a schedule, under controlled conditions, and recording what happened.**

What a meaningful test covers:

- Switchover under load, not on a quiet system.
- Client behaviour during and after — including whether displays showed stale data rather than freezing.
- Standby's ability to carry full load, not merely to start.
- Configuration equality verified before and after.
- The reverse direction, because failing back is a separate path that is often less exercised.
- Recovery of the failed node into standby without disturbing the new primary.

A pair whose switchover has not been exercised since commissioning has an untested recovery path in the one moment it matters. That is not redundancy; it is the expectation of redundancy.

## Recommended Practice

- Decide active/passive versus active/active on data-consistency and capacity grounds, and state which failure modes each brings.
- Give the heartbeat at least one path independent of the data network.
- Set heartbeat timeout above the measured worst-case network recovery time, with margin.
- Provide a tie-breaker so an isolated node cannot assume its partner is dead.
- Protect the write path more strongly than the read path against split-brain.
- Specify client detection time and require displays to show stale rather than freeze.
- Count both nodes against controller communication capacity.
- Deploy configuration to both nodes by one mechanism and verify equality mechanically.
- Switch over deliberately on a schedule, under load, in both directions, and record results.

## Conclusion

Redundancy is not availability. It is a trade: one failure mode removed, several added, and a net improvement only if the added ones are contained by design.

The containment is unglamorous — an independent heartbeat path, a timeout derived from measurement, a tie-breaker, configuration deployed by one mechanism, and a switchover exercised often enough to be a capability rather than a belief. A pair with those properties genuinely improves availability. A pair without them has added coordination complexity to a system that previously failed in only one way.
