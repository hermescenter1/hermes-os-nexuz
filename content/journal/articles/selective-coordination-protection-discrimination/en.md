# Selective Coordination and Protection Discrimination

## Executive Summary

Coordination has one objective that is easy to state and hard to achieve: **when a fault occurs, only the device immediately upstream of it should operate.** Everything else in the plant should keep running.

The difficulty is that the three properties a protection scheme is asked to deliver pull against each other. Clearing quickly limits damage. Detecting small faults requires low thresholds. Letting the downstream device act first requires the upstream device to wait. **Speed, sensitivity and selectivity cannot all be maximised at the same point in the network**, and a coordination study is fundamentally the record of where each compromise was made and why.

> This article consumes the output of the companion article on short-circuit analysis. It assumes the reader has both a maximum and a minimum fault case, and that the distinction between prospective current, breaking capacity, making capacity and short-time withstand is already established.

**Safety note.** Setting changes, injection testing and interlock proving are performed on equipment with lethal energy levels. Isolation, lock-off, proof of dead, test-plan preparation and competent personnel apply throughout. Nothing here is guidance for working on energised equipment.

## Selectivity and Backup Protection Are Different Objectives

These two are frequently discussed as if they were the same subject. They are opposites in intent, and confusing them produces schemes that satisfy neither.

**Selectivity (discrimination)** means the downstream device clears the fault and the upstream device does not operate at all. It preserves supply to everything else on the upstream board.

**Backup protection** means the upstream device *is expected to act* — either because the downstream device has failed to clear, or because the fault current exceeds what the downstream device can interrupt alone.

**Backup by cascading is a deliberate trade of selectivity for economy.** Where the prospective current at a point exceeds a downstream device's breaking capacity, a manufacturer-verified combination may permit that device to be used anyway, because the upstream current-limiting device assists in clearing. The consequence must be stated plainly: **in the current range where the upstream device assists, both devices operate, and selectivity in that range is lost by design.**

That is a legitimate engineering choice with a documented cost. It becomes a defect only when the loss of selectivity is discovered during an outage rather than recorded during design.

**A crucial constraint on cascading: it is only valid for the specific device pairing the manufacturer has tested and published.** It cannot be derived from published time-current curves, cannot be transferred between manufacturers, and cannot be assumed for a device substituted later on grounds of equivalence.

## Current Selectivity

The simplest mechanism, and the one with the clearest limit.

**The principle:** the impedance of the cable between the upstream and downstream devices reduces the fault current seen at the downstream location. If the fault current for a fault beyond the downstream device is below the upstream device's instantaneous pickup, the upstream device does not see a reason to operate at all, and selectivity is achieved without any time delay.

**Where it works:** long feeders, small downstream circuits, and any situation where there is significant impedance between the two devices.

**Where it fails:** close-coupled arrangements. A fault immediately downstream of a device sitting a few metres from the main board produces almost the same current as a fault on the board itself. There is no current difference to exploit, and current selectivity cannot be established regardless of settings.

**The check is explicit:** compare the maximum fault current at the downstream device's load-side terminals with the upstream device's instantaneous threshold, including its tolerance band. If the fault current can reach that threshold, current selectivity does not exist in that range.

## Time Selectivity

Where current selectivity is unavailable, the upstream device is deliberately delayed so the downstream device operates first.

**What a grading interval must cover**, and this is where schemes are commonly under-graded:

- The downstream device's own operating time at the relevant current, including its tolerance.
- The downstream circuit breaker's mechanical opening and arcing time.
- Any measurement or relay overshoot — the upstream device may continue toward operation briefly after the current has been interrupted.
- The upstream device's own timing tolerance.
- A safety margin.

**Grading intervals are derived, not chosen from habit**, and modern numerical relays generally allow smaller intervals than older electromechanical devices because their timing repeatability is better. The margin belongs to the actual devices installed.

**The costs of time selectivity are real and must be accepted explicitly:**

- **The fault burns longer.** Energy into the fault rises with duration; equipment damage rises with it.
- **The upstream device and everything between it and the fault must carry the fault current for the delay.** This is precisely where the short-time withstand rating — current *and* time — from the fault study is consumed. A delay applied without checking withstand is a scheme that protects selectivity and endangers the busbar.
- **Arc energy rises with clearing time**, which matters wherever arc-flash risk is assessed.

**The consequence: the deepest delays sit at the top of the hierarchy, which is exactly where fault currents are highest.** That inversion — slowest clearing where the energy is greatest — is the central discomfort of time-graded schemes and the reason the techniques in the next two sections exist.

## Selectivity in the Current-Limiting Range

This is the area where confident-sounding but unsound claims are most common, so the limits deserve stating precisely.

**Below the current-limiting range**, coordination can be assessed from time-current characteristics: if the downstream device's total clearing time is less than the upstream device's operating time across the relevant current range, with adequate margin, the pair is selective there.

**Above it — in the range where a current-limiting device operates so fast that it interrupts before the fault current reaches its prospective peak — time-current curves stop being sufficient.** In that region the devices interact dynamically within a single half cycle, and what matters is the energy the downstream device lets through compared with what the upstream device requires to complete its own operation.

**The honest statement is this: selectivity in the current-limiting range cannot be established reliably by comparing published curves or by a generic let-through energy argument.** It is determined by testing the specific pair of devices, and the result is published by the manufacturer as a selectivity table or limit — typically expressed as a current up to which the pair is selective.

**What follows in practice:**

- **Use the manufacturer's selectivity tables** for device pairs operating in this range. They are the evidence; the curves are not.
- **Selectivity tables are pair-specific.** Substituting either device for a nominally equivalent one invalidates the entry.
- **Fuse-to-fuse coordination is the one case with a widely used curve-based method:** selectivity is generally assessed by comparing the total operating energy of the downstream fuse against the pre-arcing energy of the upstream fuse, with a ratio recommended by the manufacturer. Even here, the manufacturer's recommended ratio is the authority.
- **Mixed pairs — fuse upstream of a breaker, or the reverse — require the manufacturer's data**, because the interaction depends on both devices' dynamic behaviour.

**Partial selectivity is a legitimate, documentable outcome.** A pair may be selective up to a stated current and non-selective above it. The correct response is to record that limit, compare it against the maximum fault current at that location, and accept or address the gap — not to describe the scheme as "selective" without qualification.

## Zone Interlocking and Bus Faults

**A fault on a busbar is the case time grading handles worst.** No downstream device sees it, so it must be cleared by the incomer — the device with the longest delay, at the location with the highest fault current.

Two established responses:

**Zone-selective interlocking.** Downstream devices signal upstream when they detect a fault. If the upstream device receives that signal, it applies its delay and lets the downstream device clear. If it detects a fault and receives no signal, the fault must be in its own zone, and it trips without the delay. The result is fast clearing for bus faults and retained selectivity for downstream faults.

Its failure modes are wiring and commissioning ones, and they are asymmetric in consequence:

- **Interlock signal missing or wiring incomplete** — the upstream device trips fast on a downstream fault, and selectivity is lost.
- **Interlock permanently asserted** — the upstream device always waits, and a bus fault is cleared with the full delay, which is the condition the scheme existed to prevent.

**Both faults are silent in normal operation and only appear during a fault**, which is why the interlocking must be proved by test rather than by inspection of drawings.

**Busbar differential protection** is the other answer: it defines a protected zone by measuring current in and out, and clears anything inside it quickly without depending on grading. It costs more and is applied where the consequence justifies it.

## Feeder Types With Their Own Constraints

**Motor feeders.** The short-circuit element must sit above the motor's starting inrush, or the motor trips on every start; the thermal overload function handles sustained overcurrent. Two disciplines follow:

- Set the instantaneous threshold from the motor's inrush characteristic and the fault study, not by raising it until nuisance trips stop.
- Selectivity with the upstream device is usually established by current selectivity, because motor cables add impedance. Where the motor is close to the board, expect that to fail and grade in time instead.

**Transformer feeders.** Energisation inrush is a large, decaying, offset current that the primary protection must ride through without operating, while still protecting the transformer. The transformer's own withstand characteristic bounds how long a through-fault may persist. Coordination between the primary device and the secondary main is the classic difficulty, because the impedance between them is the transformer itself.

**Long feeders.** These are the circuits where the minimum fault case governs. A setting chosen for selectivity may be above the current available at the far end, in which case the fast element never operates there. **Selectivity and sensitivity are being traded, and the trade must be examined at both ends of the circuit.**

## The Trade-Off, Stated Explicitly

| Objective | What improves it | What it costs |
| --- | --- | --- |
| **Speed** | Lower thresholds, shorter delays, current limiting | Selectivity margin; nuisance operation risk |
| **Sensitivity** | Lower pickup, dedicated earth-fault protection | Selectivity margin; risk of operating on load transients |
| **Selectivity** | Grading intervals, higher upstream thresholds | Longer clearing at higher fault levels: damage, arc energy, withstand duty |

**No setting maximises all three, and a scheme that appears to has usually not been checked at the minimum fault current.** The design record should state, per level, which objective was prioritised and what was accepted in exchange.

## Commissioning and Testing

Coordination exists only if the settings in the devices match the study and the scheme behaves as designed.

- **Apply and record every setting**, and compare the applied values against the study — not against the previous device's settings.
- **Injection-test protection functions** to confirm they operate at the set values and times, by competent personnel under a prepared test plan.
- **Prove zone-selective interlocking by test**, exercising both the "signal present" and "signal absent" cases. Drawings are not proof.
- **Verify that any device relying on a delay has adequate short-time withstand for that delay**, and that busbars and cables between the devices do too.
- **Record partial selectivity limits** where they exist, with the current up to which the pair is selective.
- **Re-check coordination after any change** to sources, network configuration, device replacement or setting adjustment. A device replaced with a nominally equivalent model invalidates any manufacturer selectivity or cascading entry that named the original.

## Failure Modes

**Selectivity assumed from curve overlap in the current-limiting range.** The pair is non-selective where it matters most.

**Cascading applied without the manufacturer's verified combination.** A device is used above its breaking capacity on an argument rather than a test.

**Grading interval taken from habit.** Under-graded scheme; both devices operate.

**Delay applied without checking short-time withstand.** Selectivity is protected and the busbar is not.

**Instantaneous element raised to stop nuisance trips.** Fault protection quietly desensitised; the original nuisance cause never found.

**Settings verified against the previous device rather than the study.** Historic errors are propagated.

**Zone interlocking never tested.** Either selectivity or fast bus clearing is missing, and nobody knows which.

**Minimum fault current not checked at the far end.** The scheme is selective and insensitive.

**Device substituted as "equivalent".** Any manufacturer selectivity or backup entry naming the original no longer applies.

**Partial selectivity described as selectivity.** The gap is discovered by an outage.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A petrochemical utilities area has a main LV switchboard feeding several sub-boards. A fault in a sub-board cubicle trips both the sub-board incomer and the main switchboard incomer, taking out the whole area. The devices are correctly rated, the study exists, and the settings match it.

```text
Symptom:
Downstream fault cleared, but the upstream incomer tripped as well.

Evidence:
- both devices operated for a single fault in a sub-board cubicle
- the sub-board is close-coupled to the main board by a short, large busduct
- computed fault current at the sub-board is only slightly below the
  value at the main board
- the main incomer's instantaneous element is set above its own board's
  load requirement but below the sub-board fault current
- no time delay is configured on the main incomer
- the coordination record shows the pair assessed on current selectivity

Reasoning:
Current selectivity depends on impedance between the two devices producing
a meaningful reduction in fault current. Here there is almost none, so both
devices see essentially the same fault and both instantaneous elements pick
up. This is not a settings error within the chosen method; it is the chosen
method being applied where its precondition does not hold.

Next investigations:
- confirm fault currents at both locations from the study, maximum case
- establish whether a short-time delay on the main incomer is viable, and
  whether the main busbar's short-time withstand covers that delay
- check the manufacturer's selectivity table for this specific device pair,
  which may establish selectivity in the current-limiting range
- verify that any delay introduced still clears within the transformer and
  cable withstand limits, and reassess arc energy at the main board
```

Three remedies exist and they are not equivalent. Introducing a short-time delay on the main incomer restores selectivity — provided the main busbar's short-time withstand covers the delay, and provided the increased clearing time is acceptable for damage and arc energy. Consulting the manufacturer's selectivity table for the specific pair may establish selectivity in the current-limiting range without any delay. Zone-selective interlocking achieves both, at the cost of wiring and a commissioning test.

**The transferable point: current selectivity has a precondition, and the scheme did not fail — it was applied where its precondition was absent. The coordination record said "current selectivity" without recording the impedance assumption that made it valid.**

## Recommended Practice

- Treat coordination as a consumer of the fault study, using the maximum case for equipment behaviour and the minimum case for sensitivity.
- Distinguish selectivity from backup protection in the design record, and state where selectivity is deliberately traded away.
- Verify current selectivity against the actual fault-current difference between the two devices, including tolerances.
- Derive grading intervals from the installed devices' timing behaviour, not from habit.
- Check short-time withstand — current and time — for every device, busbar and cable that a delay asks to hold the fault.
- Use manufacturer selectivity tables for pairs operating in the current-limiting range; do not infer selectivity from published curves there.
- Use manufacturer-verified combinations for any cascading or backup arrangement, and record the current range in which selectivity is lost.
- Assess fuse-to-fuse coordination using the manufacturer's recommended energy ratio.
- Set motor feeder short-circuit elements from inrush and the fault study, never by raising until trips stop.
- Treat transformer inrush and through-fault withstand as explicit constraints on primary-side settings.
- Consider zone-selective interlocking or bus differential where bus faults would otherwise be cleared slowly at the highest fault level.
- Record partial selectivity limits explicitly rather than describing a scheme as selective without qualification.
- Apply, injection-test and record settings against the study, and prove interlocking schemes by test.
- Re-verify coordination after any source, configuration, device or setting change.

## Conclusion

A coordination scheme is a set of accepted compromises made visible. Current selectivity works where impedance separates the devices and fails where it does not. Time selectivity works everywhere and pays for it in clearing time, damage and withstand duty at exactly the locations where fault energy is highest. Selectivity in the current-limiting range is real, valuable and knowable only from the manufacturer's testing of the specific pair.

The schemes that hold up in service are the ones whose records say which mechanism was used at each level, what was assumed to make it valid, up to what current it holds, and what was accepted in exchange. The ones that fail usually look identical on a single-line diagram — and differ only in that nobody wrote down the assumption that stopped being true.
