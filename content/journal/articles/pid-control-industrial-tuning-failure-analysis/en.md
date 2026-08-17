# PID Control: Practical Industrial Tuning and Failure Analysis

## Executive Summary

A control loop that is not behaving is almost always described as needing tuning. That description is a hypothesis, and it is usually wrong.

**An oscillating loop has at least eight distinct causes**: proportional action too aggressive, integral action too fast, valve stiction, actuator saturation with windup, dead time larger than the tuning assumed, dead time that varies with throughput, an external disturbance or interaction with another loop, and measurement noise mistaken for process movement. **Two of those eight are tuning.** The remaining six are unaffected by retuning, and several of them are made *worse* by the detuning that follows an unsuccessful attempt — because a slower loop produces a slower, gentler oscillation that looks like progress.

This article treats PID as a diagnostic discipline. It covers what each term actually does and why a set of tuning numbers is meaningless without knowing the controller's form, which process characteristics determine what performance is even achievable, how to read a step response, why windup is a structural fault rather than a tuning error, how derivative and noise interact, and — at its centre — how to tell the eight causes apart.

**One test dominates all of it: put the loop in manual.** If the oscillation continues with the controller no longer acting, the controller is not the cause, and every hour spent on tuning parameters is wasted. That single step, taken first, resolves a large fraction of the loops that have been "retuned" repeatedly over the years.

## What Each Term Does, and Why the Form Matters

**Proportional action** responds to the error that exists now. It is the term that provides speed. On a self-regulating process it leaves a steady-state offset, because a non-zero output requires a non-zero error to produce it. How much proportional action a loop can accept is limited by the process's own phase lag: past a certain point, the correction arrives too late to help and instead sustains an oscillation.

**Integral action** removes offset by accumulating error over time. It is also the term that most reliably destabilises a loop, because integration adds phase lag, and it is the term that winds up. **Integral action is a cost paid to eliminate offset**, and the correct amount is the slowest that removes offset in an operationally useful time — not the fastest the loop will tolerate.

**Derivative action** responds to the rate of change of the signal. It contributes phase lead, which can permit more proportional action than would otherwise be stable, and it is genuinely valuable on processes with substantial thermal lag and a clean measurement. It also amplifies high-frequency content, which is why it is nearly always filtered and frequently switched off entirely. **A derivative term on a noisy measurement is a way of putting noise onto the valve.**

**The point that ruins the transfer of tuning parameters between systems** is that "PID" describes a family of structures, not one algorithm:

- **The form** — whether the gain multiplies all three terms (standard or ideal form) or the terms are independent (parallel form), or whether the terms are arranged in series — changes what a given set of numbers means.
- **The units** — proportional gain or proportional band; integral in seconds, minutes, or repeats per minute; derivative in seconds or minutes — differ between platforms and are sometimes reciprocals of one another.
- **The placement of proportional and derivative action** — on the error or on the measurement — changes the response to a setpoint change without changing the response to a disturbance. Derivative on error produces a large kick on every setpoint step; derivative on measurement does not.

**A tuning set is therefore only meaningful together with its controller form, its units and its term placement.** Copying numbers from an old controller to a new one without translating all three is a well-established way to produce a loop that has never worked and cannot be explained.

## The Process Decides What Is Achievable

Three characteristics of the process determine the performance envelope, and no amount of tuning moves the envelope.

**Process gain** is how far the measurement moves for a given change in controller output. It is rarely constant: the valve's installed characteristic, a nonlinear process relationship, and a changing load all move it. **A loop tuned at one operating point may be sluggish at another and unstable at a third**, and this is a process property rather than a controller defect.

**The time constant** is how quickly the process responds once it has begun to respond.

**The dead time** is how long it takes to begin responding at all. **The ratio of dead time to time constant is the single number that predicts how difficult a loop will be.** Where dead time is small relative to the time constant, tight control is straightforward. Where dead time dominates, the loop is fundamentally limited: the controller is always acting on information about a condition that has already changed, and no tuning removes that. Loops of this kind can be made stable or made fast, but not both, and pretending otherwise produces years of alternating complaints.

**Self-regulating and integrating processes need different philosophies**, and treating an integrating process as if it were self-regulating is a common and consequential error.

- A **self-regulating** process settles at a new steady value after a step in the output — flow through a valve, temperature with a fixed heat input and losses.
- An **integrating** process ramps and never settles — level in a vessel with an independent outflow, pressure in a closed volume being filled. **The process already integrates**, which means the controller needs very little integral action of its own. Too much produces a slow, persistent hunting that looks like instability and is often "fixed" by adding more integral, which makes it worse.

**Open-loop-unstable processes** — some exothermic reactors, some pressure systems — accelerate away from their operating point without control. They are a specialist design problem with safety implications, and they are outside the scope of general loop tuning.

## Reading a Step Response

The three process numbers are obtained by observation, not by theory.

**Perform the test in manual**, so the controller is not fighting the experiment. Step the output by a known amount, record the measurement at adequate resolution, and read the result off the curve: the eventual change gives the process gain, the delay before movement begins gives the dead time, and the shape of the rise gives the time constant.

The discipline that makes the test worth doing:

- **Test at a representative operating point.** A test at 20% throughput describes the process at 20% throughput.
- **Test in both directions.** A response that differs going up and going down is evidence of a nonlinearity, a valve characteristic problem or stiction — and this asymmetry is one of the most useful free diagnostics available.
- **Make the step large enough to exceed noise and stiction**, and small enough to be operationally acceptable. A step that fails to break stiction measures nothing.
- **Record it.** A step test performed once and remembered is worth much less than one that can be compared against next year's.

**The shape itself carries diagnosis:**

- A response that initially moves the *wrong way* before correcting is an inverse response, which places a hard limit on achievable performance and is a process property.
- A response that never settles indicates an integrating process.
- A response whose delay depends on throughput indicates **transport dead time**, and this deserves emphasis: on processes where the delay is a material transit time, **dead time is inversely related to flow**. A loop tuned at full rate faces roughly twice the dead time at half rate. This is the mechanism behind a very large number of "it only oscillates at low load" complaints.

## A Tuning Philosophy Rather Than a Formula

**There is no universal tuning formula, and published rules are starting points rather than answers.** Each published rule encodes an assumed process form and an assumed objective — some minimise settling time, some minimise overshoot, some minimise an integrated error criterion — and two engineers applying "the" rule to the same loop legitimately obtain different numbers because they are optimising different things.

**State the objective before touching a parameter:**

- **Setpoint tracking or disturbance rejection?** Most loops exist to reject disturbances, and most tuning is verified with setpoint steps. A loop can look excellent on a setpoint change and reject disturbances poorly.
- **Tight regulation or a smooth manipulated variable?** These are in direct tension. A valve that strokes continuously wears; a loop cascaded into another transmits its own activity downstream.
- **Does tight control even serve the plant?** A surge vessel exists to absorb variation. Controlling its level tightly passes every upstream disturbance straight through to the downstream unit and defeats the vessel's purpose. **Averaging level control is a deliberate engineering choice, not a badly tuned loop.**

**A defensible sequence, independent of which published rule is used as a starting point:**

1. Establish the process dynamics by test, at the operating point that matters.
2. Decide the objective and write it down.
3. Start conservatively and increase proportional action until the response is acceptable, watching the manipulated variable as well as the measurement.
4. Add integral action only as fast as required to remove offset in a useful time.
5. Consider derivative only where dead time is small relative to the time constant and the measurement is clean, and treat its filter as part of the tuning.
6. **Verify with a disturbance, not only with a setpoint step.**
7. Record the parameters, the controller form, the units, the operating point and the date.

## Saturation and Windup: A Structural Fault

**Windup is not a tuning error and cannot be tuned away.** When the controller output reaches a limit, the loop is open: further integral accumulation cannot produce any additional action. If the integral term continues to accumulate anyway, then when the error finally reverses, the output remains saturated until that accumulation unwinds — producing a large, slow overshoot that has nothing to do with the gains.

**Anti-windup is a controller feature.** It must be present, enabled and correctly configured, and modern controllers provide it; the failure is usually that the controller's idea of the limit does not match reality.

**That mismatch is the practically important part.** The limits that matter are not only 0 and 100%:

- A valve that is fully open at 70% of the output range is saturated at 70%, and a controller that believes its limit is 100% will happily wind up over the remaining 30%.
- An output driving a secondary controller that is itself at a limit is effectively saturated.
- A drive at a torque or current limit is saturated regardless of what its speed reference says.

**In cascade arrangements, windup propagates.** If an inner loop is in manual, at a limit, or otherwise unable to follow, the outer loop is open-loop and will wind up unless it is told. **External reset, back-calculation and equivalent mechanisms exist precisely to communicate "I cannot follow you" from the inner loop to the outer one**, and a cascade built without one of them has a windup problem waiting for its first inner-loop excursion.

**The diagnostic signature is specific:** a loop that behaves acceptably in normal operation and overshoots badly *only after a period at a limit* has a windup problem. Retuning it makes normal operation worse in order to address a condition that only exists at saturation.

## Derivative, Noise and Filtering

Differentiation amplifies high-frequency content. Measurement noise is high-frequency content. The consequences follow directly.

**Derivative action is therefore always used with a filter**, and the filter time constant is a tuning parameter with a trade-off, not a hidden default. **The filter is not free**: it adds lag, which is precisely what derivative action was added to compensate for.

**Fix the noise before filtering it.** If a measurement is noisy because of a signal-integrity problem — a common-mode issue, a shield policy failure, an inappropriate scan rate — then filtering in the controller is treating a symptom in the wrong place and destroying evidence at the same time. The instrumentation architecture and loop articles cover the mechanisms; the point here is that a filter added to make a trend look calmer removes the information that would have identified the actual fault.

**And the distinction that matters diagnostically:**

| | **Measurement noise** | **Process oscillation** |
| --- | --- | --- |
| Frequency | High, often near the scan rate | At a period related to the loop dynamics |
| Relationship to output | Uncorrelated | Correlated, with a consistent phase relationship |
| In manual | Still present | Usually disappears — unless the cause is external |
| Effect of detuning | None | Amplitude and period change |

## The Differential Diagnosis of an Oscillating Loop

This is the core of the article. **Start by putting the loop in manual and holding the output constant.**

| Cause | Signature | Discriminating evidence |
| --- | --- | --- |
| **Proportional action too aggressive** | Oscillation at a period set by the loop dynamics; grows with gain | Stops in manual; amplitude responds directly to gain changes |
| **Integral action too fast** | Slower hunting, larger overshoot after disturbances | Stops in manual; responds to integral time, not to gain |
| **Valve stiction** | Limit cycle where output ramps smoothly and measurement moves in jumps | **Detuning slows the cycle but does not remove it**; output and measurement have different shapes |
| **Actuator saturation with windup** | Large overshoot only after a period at a limit | Output trace sits at a limit before the excursion |
| **Dead time larger than assumed** | Oscillation with a period related to the dead time | Step test reveals the true dead time; detuning stabilises |
| **Dead time varying with throughput** | Stable at one production rate, oscillates at another | Step test at both rates; delay differs |
| **External disturbance or loop interaction** | Oscillation with a period unrelated to this loop's dynamics | **Continues in manual**; correlates with another loop or unit |
| **Measurement noise** | High-frequency, unrelated to output | Present in manual; visible at the transmitter |
| **Process gain changed with operating point** | Was fine, now is not, after a rate or composition change | Step test now versus the original commissioning record |
| **Nonlinearity** | Oscillates in one direction or in part of the range only | Step tests up and down, at several operating points |

**Two rules extracted from this table are worth more than any tuning method.**

**If it continues in manual, it is not the controller.** The loop is then a disturbance-rejection problem, an interaction problem or an instrumentation problem, and no parameter change will help.

**If detuning slows the oscillation without removing it, suspect the final element.** A tuning-induced oscillation disappears as the loop is detuned. A stiction limit cycle persists at a longer period and smaller amplitude, which looks like improvement and is not — it is the same defect, running slower.

## Valve Stiction and the Final Element

Stiction is the most misattributed cause of poor control, and it deserves recognition on sight.

**The mechanism:** static friction means the valve does not move until the signal change exceeds a threshold, and then it jumps past the intended position. The controller sees the resulting error and reverses, the valve sticks again, and the loop enters a self-sustaining limit cycle.

**The recognisable signature** is the difference in shape between the two traces: **the controller output ramps smoothly while the measurement moves in steps.** No tuning problem produces that pattern, and no amount of retuning removes it — the loop is oscillating because the final element is discontinuous, and the controller is doing exactly what it should.

**Other final-element faults produce their own symptoms:**

- **Hysteresis or backlash** produces a dead band on reversal, so the loop responds asymmetrically to disturbances in different directions.
- **An oversized valve** does all of its useful control in the first small fraction of its travel, which means the effective process gain is very high and the loop is difficult or impossible to control at low flow — a sizing problem presented as a tuning problem.
- **An undersized valve** saturates, and the loop simply cannot reach the setpoint.
- **A mismatched inherent characteristic** relative to the installed pressure drop produces a process gain that changes substantially across the range, so no single tuning works everywhere.
- **The positioner is itself a control loop.** A badly tuned or failing positioner produces overshoot, slow response or hunting that appears to be a process problem, and it is diagnosed by comparing the positioner's demand with its position feedback rather than by watching the process.
- **Air supply problems** produce slow strokes and incomplete travel, often intermittently and often correlated with other consumers.

## Cascade Control and Feedforward

**Cascade exists to hide a disturbance from the outer loop.** The classic arrangements — flow control inside temperature control, valve position inside flow control — put a fast inner loop around the variable that is disturbed most often, so the outer loop sees a manipulated variable that behaves predictably.

**The requirement is a separation of speed.** The inner loop must be substantially faster than the outer one. When they have similar dynamics they interact, and the result is an oscillation that neither loop's tuning explains.

**The tuning order is fixed: inner loop first, then the outer loop with the inner in automatic.** Tuning the outer loop against an inner loop in manual produces parameters that describe a system that will not exist in operation.

**The failure modes are few and predictable:**

- The inner loop is left in manual, so the outer loop is open and winds up.
- The inner loop saturates, and the outer loop keeps demanding.
- The two loops have similar response times and fight.
- The outer loop is retuned to fix a problem that lives in the inner loop.

**Feedforward acts on a measured disturbance before its effect appears in the measurement.** It is the correct answer to a large, measurable disturbance on a process with significant dead time, because feedback cannot react to something it has not yet seen. It requires a model of the disturbance's effect, it degrades as that model drifts, and **it never replaces feedback** — it is added to it, and the feedback loop remains responsible for everything the model does not capture.

## Commissioning

- Record the controller form, units, term placement and the parameter set — a tuning without its structure cannot be reproduced or transferred.
- Perform and record step tests at the operating points the plant actually uses, in both directions.
- Verify the output limits and confirm the controller's saturation handling matches the physical reality of the final element.
- Confirm anti-windup behaviour by driving the loop to a limit deliberately and observing the recovery.
- In cascades, confirm the inner loop's status is communicated to the outer loop, and test the inner loop in manual to see what the outer loop does.
- Verify disturbance rejection, not just setpoint response.
- Check the final element: full stroke, response to small steps in both directions, positioner feedback against demand.
- Record the trend of setpoint, measurement and output together at a resolution that will support a future diagnosis.

## Failure Modes

**Every oscillation attributed to tuning.** Six of the eight causes are untouched by parameters.

**Retuning attempted before putting the loop in manual.** The one test that would have settled it in two minutes.

**Detuning treated as success on a stiction limit cycle.** Same defect, slower cycle.

**Tuning parameters copied between controllers of different form or units.** Numbers transferred, meaning lost.

**Integral action increased to cure the slow hunting of an integrating process.** The opposite of the required change.

**Tight level control applied to a surge vessel.** Disturbances passed downstream by design.

**Loop verified only with setpoint steps.** Excellent tracking, poor rejection, and the loop exists for rejection.

**Derivative enabled on a noisy measurement.** Noise transferred to the valve.

**Filter added to hide noise that is a signal-integrity defect.** Symptom treated in the controller, evidence destroyed.

**Anti-windup limits that do not match the physical limits.** The controller winds up over a range the valve does not have.

**Cascade tuned with the inner loop in manual.** Parameters for a system that will not exist.

**Inner-loop status not communicated to the outer loop.** Windup on every inner-loop excursion.

**Oversized valve diagnosed as a tuning problem.** All the control happens in the first part of the travel.

**Positioner problems diagnosed as process problems.** An inner control loop nobody looked at.

**One tuning set used across a wide throughput range with transport dead time.** Stable at one rate, oscillating at another, by construction.

**Step test performed only in one direction.** Nonlinearity and stiction both invisible.

**Tuning changed without recording what it was or why.** No baseline, and no way to tell improvement from drift.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A temperature loop on a continuous process is stable and well behaved at full production rate. At reduced rate it oscillates persistently. Over two years the loop has been retuned four times; each time the gain has been reduced a little further. The plant now reports that low-rate operation is acceptable but that the loop is sluggish at full rate and recovers slowly from disturbances.

```text
Symptom:
A temperature loop that oscillates at reduced production rate and is
sluggish at full rate, after repeated reductions in controller gain.

Evidence:
- the measurement is taken downstream of the heating point, with a material
  transit distance between them
- step tests at full rate show a short delay before the measurement begins
  to move; step tests at half rate show a delay roughly twice as long
- the process gain measured at the two rates is similar; only the delay
  differs materially
- the oscillation period at reduced rate is consistent with the longer delay
- the oscillation stops when the loop is placed in manual
- the controller output trace and the measurement have the same shape during
  the oscillation; the output does not ramp while the measurement steps
- the valve strokes smoothly and responds symmetrically to small steps in
  both directions
- the original commissioning record documents a step test performed at full
  production rate only
- each successive retuning reduced gain and left integral time unchanged

Reasoning:
The delay between the heating point and the measurement is a transport delay:
material has to travel from one to the other. Its duration is therefore set by
throughput, and at half rate it is roughly double. Dead time is not a constant
of this process — it is a function of the operating rate.

The loop was commissioned against a step test performed at full rate, so its
parameters were correct for the shortest dead time the process ever exhibits.
At reduced rate the controller is acting on information that is twice as old
as its tuning assumes, which is the classic condition for sustained
oscillation. The fact that the oscillation stops in manual confirms the
controller is participating; the fact that output and measurement share a
shape rules out a stiction limit cycle; the symmetric valve response and the
similar measured process gain rule out the final element and a gain change.

The four retunings addressed the symptom at the worst-case operating point by
detuning for it, which necessarily degraded performance at every other
operating point. Each step was locally rational and the sequence produced a
loop tuned for a condition the plant rarely runs at.

Next investigations:
- characterise the delay across the full operating range rather than at two
  points, and confirm it scales as transport delay would
- decide the control objective explicitly: acceptable at all rates with one
  parameter set, or best achievable at each rate
- evaluate the available options against that objective — tuning for the
  worst-case dead time and accepting the resulting sluggishness, scheduling
  parameters against throughput, using a control structure intended for
  dead-time-dominant processes, or relocating the measurement closer to the
  heating point to reduce the transport delay itself
- re-baseline with step tests at several rates and record them with the rate
  at which each was taken
```

**Two transferable lessons.** First, **dead time is a process variable on any loop whose delay is a transit time**, and a single tuning set cannot serve a wide throughput range unless it is tuned for the worst case or scheduled. Second, **a sequence of locally reasonable retunings produced a globally poor result** because each step optimised for the condition being complained about that week, and nobody re-tested the process. The step test at two rates — twenty minutes of work — would have identified the mechanism before the first retuning.

## Recommended Practice

- Put the loop in manual before changing any parameter; if the oscillation continues, stop looking at the controller.
- Record the controller form, units and term placement alongside every parameter set, and translate all three when moving tuning between platforms.
- Establish process gain, dead time and time constant by step test, at the operating points that matter, in both directions, and keep the records.
- Judge achievability from the ratio of dead time to time constant, and accept the limit rather than tuning against it.
- Treat integrating processes differently: they need little integral action, and adding more makes slow hunting worse.
- State the objective — tracking or rejection, tight or smooth — before tuning, and verify with a disturbance rather than only a setpoint step.
- Use averaging control where the vessel exists to absorb variation, and record that as a deliberate choice.
- Treat windup as structural: verify anti-windup, and confirm that the controller's limits match the final element's actual limits.
- In cascades, tune inner first, communicate inner-loop status to the outer loop, and confirm the speed separation.
- Add derivative only with a clean measurement and a deliberately chosen filter, and fix noise at its source before filtering it.
- Recognise a stiction limit cycle by the difference in shape between output and measurement, and do not accept detuning as a cure.
- Check the final element — stroke, symmetry, sizing, characteristic, positioner, air supply — before accepting a tuning diagnosis.
- Re-test the process after any change of throughput, feedstock or equipment that could alter gain or delay.
- Log every tuning change with its date, its reason and the operating point at which it was validated.

## Conclusion

PID tuning is a small part of PID engineering. The parameters matter, but they operate inside a system whose dynamics, final element, measurement quality and structure have already determined most of what is achievable — and the great majority of loops described as badly tuned are in fact correctly tuned controllers responding rationally to a process, a valve or a measurement that is not what the tuning assumed.

The discipline is therefore diagnostic rather than numerical. Put the loop in manual. Compare the shapes of the output and the measurement. Step-test the process at the rate it actually runs, in both directions. Ask what the loop is for before deciding whether it is behaving. Most of the time the answer arrives before anyone has changed a parameter, and when a parameter change genuinely is the answer, it is made once and holds.
