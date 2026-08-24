# Interlocks, Permissives and Trips: Designing the Constraint Layer

## Executive Summary

Three distinct mechanisms are routinely given the same name, and the confusion has operational consequences. A **permissive** is a condition that must be satisfied before equipment may start. An **interlock** is a condition that, while present, forces or holds a safe state. A **trip** is a protective action taken in response to a condition that has already occurred.

They differ in when they are evaluated, what they do to running equipment, and — most importantly — what it takes to clear them. Designing them as one undifferentiated pile of conditions produces the most familiar complaint in industrial automation: equipment that will not start, and nobody can say why.

## Why the Distinction Is Operational, Not Academic

Consider a pump that will not start. The operator needs to know which of three situations they are in:

- **A permissive is missing.** Something must be done before starting — open a valve, select AUTO, clear a downstream condition. The plant is healthy; a precondition is not met.
- **An interlock is active.** A condition currently forbids operation. Starting is not merely blocked; it would be wrong.
- **A trip has occurred and not been reset.** Something happened, protective action was taken, and the equipment is latched out pending investigation.

These require three different responses from three different people. A single "cannot start" indication forces the operator to call an engineer to find out which of the three it is — every time. The distinction costs nothing to design in and is nearly impossible to retrofit.

## The Classification

| Property | Permissive | Interlock | Trip |
| --- | --- | --- | --- |
| Evaluated | Before start | Continuously | On the event |
| Effect on stopped equipment | Blocks start | Blocks start | Blocks start until reset |
| Effect on running equipment | None | Forces safe state | Forces safe state |
| Clears when | Condition satisfied | Condition removed | Condition removed AND reset |
| Latched | No | No | Yes |
| Typical origin | Process readiness | Process or equipment protection | Protection device |

The row that carries the most weight is the third. **A permissive that stops running equipment is not a permissive; it is an interlock that was misclassified.** This distinction is frequently blurred, and the result is equipment that shuts down mid-operation for a condition that was only ever meant to govern starting.

## First-Out Capture

When several conditions become unsatisfied at once — which is what happens when equipment trips and cascades — the useful information is which one was *first*. Everything after it is a consequence.

Without first-out capture, an operator sees a list of active conditions and has to guess. With it, the display shows the initiating cause and the consequences separately, and the investigation starts at the right place.

The implementation principle is simple: **capture the state of all conditions at the instant the trip occurs**, and latch that snapshot until reset. Evaluating "which is active now" after the fact is not the same thing, because by then the consequences are active too.

The scan-cycle caveat matters here. Conditions that change within the same cycle are indistinguishable to cyclic logic. Where genuine sub-cycle resolution is needed — cascading electrical protection is the usual case — the ordering must come from time-stamped events in the devices themselves rather than from the controller's own scan.

## Reset Semantics

Reset is where dangerous designs hide, and there are three rules.

**A trip requires an explicit reset, and the condition must be gone first.** Auto-reset on condition-clear removes the human acknowledgement from the path: equipment returns to service without anyone having confirmed that the condition which tripped it is genuinely gone. The order matters too: a reset pressed while the condition is still present must not arm the equipment to start the moment the condition clears.

**Reset is not start.** These are separate actions and separate operator intents. Combining them means acknowledging a fault also commands the equipment to run, which is the behaviour nobody wants during fault-finding but everyone eventually implements by accident.

**Reset is edge-triggered, never level.** A reset that is held — a jammed button, a stuck HMI command, a bit left set — becomes a permanent auto-reset, and the trip latch stops existing. The failure is silent: everything works, and the protection is simply gone.

## Permissive Design

Two properties make permissives usable.

**Each condition is individually visible.** "Start permitted" as a single boolean is not enough. The operator interface must show which of the conditions is unsatisfied. This is straightforward in ladder, where the online view shows it directly; in text it requires assigning each condition to a named variable, which is the reason that convention exists.

**Permissives are grouped by responsibility.** A start blocked by a process condition is an operations matter; a start blocked by an equipment condition is a maintenance matter. Grouping them lets the interface tell the operator who to call — which is often the only decision they actually need to make.

## Interlock Design

**Interlocks are evaluated continuously and act on running equipment.** That is what distinguishes them, and it imposes an obligation: an interlock that forces a stop must produce an indication saying so. Equipment that stops with no explanation is indistinguishable from a fault, and the operator's next action will be to try starting it again.

**The safe state must be defined per equipment, not assumed.** "Safe" is not universally "off". A cooling pump's safe state during a high-temperature condition is running, not stopped. A conveyor feeding a blocked chute should stop; the conveyor *removing* material from it probably should not. Writing down the safe state for each piece of equipment is part of interlock design, and skipping it is how an interlock makes a situation worse.

**Interlock and permissive conditions overlap but are not identical**, and the overlap should be explicit. A condition that both blocks starting and stops running equipment is legitimately both — but it should be classified as an interlock, because the stronger behaviour governs.

## Override and Bypass

Override exists because plants must sometimes operate with a defective sensor while a repair is arranged. Pretending otherwise produces unauthorised overrides implemented by disconnecting field wiring, which is worse in every respect.

Disciplined override has four properties:

1. **Authorised.** Access is controlled, and who may override what is defined in advance rather than negotiated during an event.
2. **Visible.** Every active override appears on an operator display. An override nobody can see is indistinguishable from a working interlock, which is precisely the dangerous case.
3. **Time-bounded.** Overrides expire or are re-confirmed. The alternative is the override that outlives everyone's memory of it.
4. **Recorded.** Who, what, when, why — because the question is always asked afterwards.

Safety-instrumented functions are a separate matter entirely: their bypass is governed by the functional-safety standards for the sector and by the plant's own management-of-change process, and is never an operator convenience implemented in the control layer.

## Failure Modes

**Misclassified permissive.** A start condition wired as a continuous interlock stops running equipment on a transient. The plant experiences unexplained shutdowns, and the logic is technically correct.

**Auto-reset trip.** Protection acts, condition clears, plant restarts, nobody investigates. The underlying fault continues until it causes damage.

**Held reset.** The latch is defeated permanently and silently. Protection appears present and is not.

**No first-out.** Every trip presents as a list of consequences, and every investigation begins by reconstructing an ordering from an unordered list.

**Invisible override.** An override applied during a night shift and forgotten. The interlock appears healthy for months.

**Undefined safe state.** An interlock stops a cooling pump during a high-temperature event because "stop" was assumed to be safe.

**Interlock in the wrong layer.** A condition credited as protection in a risk assessment implemented in the standard control system, where it does not have the independence the assessment assumed.

## A Worked Example

*The following is an illustrative engineering scenario.*

A conveyor discharges into a crusher. The design conditions:

- **Permissive:** crusher running at speed. The conveyor may not start feeding into a stopped crusher. If the crusher stops, the conveyor should also stop — so this is not purely a permissive, and the classification must be decided rather than defaulted.
- **Interlock:** chute blockage detected. While present, the conveyor must not run — it would make the blockage worse. Safe state: stopped.
- **Interlock:** crusher stopped while the conveyor is running. Safe state: conveyor stopped, because continuing to feed a stopped crusher is exactly the fault condition.
- **Trip:** conveyor drive overload. Latched. Requires the condition to clear and a deliberate reset, because an overload indicates something that must be looked at before restarting.
- **Permissive (not interlock):** local isolator in the remote position. If someone moves the isolator to local while the conveyor is running, the drive loses control authority anyway — but the logic must recognise this and report it rather than continue commanding a drive it no longer controls.

Note what the classification decides for the operator interface: three of these five produce a different message and a different next action. Collapsing them into "conveyor not available" discards all of that.

## Commissioning Considerations

- **Test every interlock by creating its condition**, not by forcing the bit. Forcing proves the logic; creating the condition proves the whole chain, including the sensor and the wiring.
- **Verify first-out capture with a real cascade** rather than a single simulated condition. The mechanism only earns its place when several conditions arrive together.
- **Confirm reset behaviour explicitly**: reset with the condition still present must not arm the equipment.
- **Check the safe state of each interlock against the process**, not against the assumption that stopping is always safe.
- **Leave no override active at handover**, and confirm the override display shows correctly during testing.

## Safety Considerations

Interlocks credited as protection layers in a risk assessment belong in the layer the assessment assumed, engineered under the functional-safety standards applicable to the sector — IEC 61508 as the generic basis and IEC 61511 for the process industries, with the machinery standards for machine safety. Their independence from the basic process control system is normally part of what was credited, and implementing them in the same controller, on the same I/O, with the same power supply, removes that independence whether or not the logic is correct.

Two practical consequences: the classification of every interlock as safety-credited or operational should be recorded and visible in the design documentation; and any change to a safety-credited interlock — including its bypass arrangements and its reset behaviour — goes through the management-of-change process governing the assessment, not through a routine software change.

## Recommended Practice

- Classify every condition as permissive, interlock or trip, and record the classification.
- Make each condition individually visible to the operator, not just the combined result.
- Capture first-out at the instant of the trip and latch it until reset.
- Require condition-clear plus a deliberate, edge-triggered reset to leave a trip.
- Keep reset and start as separate operator actions.
- Define the safe state per equipment; never assume "off" is safe.
- Make every override authorised, visible, time-bounded and recorded.
- Keep safety-credited interlocks in the layer with the independence they were credited on.
- Test interlocks by creating their conditions, not by forcing bits.

## Conclusion

The constraint layer is where a control system communicates its own reasoning to the people operating it. Designed as three distinct mechanisms with individually visible conditions, first-out capture and disciplined reset, it answers "why can I not start this" in seconds, from the operator interface, without a phone call.

Designed as one undifferentiated set of conditions, it produces exactly the opposite — and the difference is decided at design time, in a classification that costs nothing and is nearly impossible to add afterwards.
