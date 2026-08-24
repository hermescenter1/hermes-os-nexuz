# PLC Scan Cycle, Determinism and Response Time

## Executive Summary

Ask an engineer how fast a PLC responds and you will usually get the scan time. That number is real, and it is almost never the dominant term. The time between a physical event and a physical response is a chain of four contributions, and the controller's execution is frequently the smallest of them.

This article treats response time as a budget with named terms, distinguishes determinism from speed, and explains why jitter — variation between cycles — breaks sequencing long before mean scan time does.

## The Process Image: What the Program Actually Sees

The cyclic execution model is the foundation, and misunderstanding it produces a specific class of bug.

```text
1. Read inputs into the process image
2. Execute the program against the image
3. Write the output image to the physical outputs
4. Housekeeping (communication, diagnostics)
   -> repeat
```

The consequence that matters: **the program does not see the field; it sees a snapshot.** An input that changes and changes back within one cycle never existed as far as the program is concerned. A pulse shorter than the cycle time is not "sometimes missed" — it is systematically invisible.

This is not a defect. It is what makes the model deterministic: the logic evaluates against a consistent set of values that cannot change underneath it mid-scan. But it means that any event shorter than the cycle needs different treatment — a hardware interrupt, a fast task, or latching in the device itself. Deciding "the PLC will catch it" without checking the pulse width against the cycle time is one of the most common timing errors in industrial control.

## The Latency Budget

The response time to a field event is:

```text
t_response = t_input_detect      (device + input filter)
           + t_io_update         (station update rate)
           + t_network           (transport + jitter)
           + t_scan              (up to a full cycle before the input is read,
                                  plus execution)
           + t_output_update     (output write + station update)
           + t_actuator          (relay, valve, drive response)
```

Two properties of this chain are consistently underestimated.

**A signal can wait almost a full cycle before being read.** If an input becomes true just after the input image was read, it waits until the next read. That is why worst-case input latency is roughly one cycle beyond the average, not zero.

**The mechanical and electrical terms often dominate.** An input filter set to a few milliseconds, or a valve that takes tens of milliseconds to stroke, can exceed the entire controller contribution. Optimising the scan when the actuator is the limit produces no measurable improvement and consumes engineering time.

The discipline is simply to write the budget down with the real numbers from the device datasheets and the actual station configuration — not to reason about the scan alone because it is the term the tool displays.

## Determinism Is Not Speed

These are independent properties and conflating them causes real design errors.

**Speed** is how long a cycle takes on average.
**Determinism** is how tightly bounded that time is.

A controller with a 10 ms mean cycle and ±0.2 ms variation is far more useful for coordinated motion than one with a 4 ms mean and ±6 ms variation, despite being slower on average. The second controller is faster and cannot be relied on to do anything at a predictable moment.

**Jitter is what breaks sequencing.** Logic that computes a duration by counting cycles, or that assumes two events separated by a known interval will be seen in a particular relationship, fails when the interval between cycles varies. The failure is intermittent and load-dependent, which is the hardest kind to diagnose.

The engineering conclusion: **measure and record minimum, maximum and current cycle time — not just current.** The current value tells you almost nothing. The maximum tells you the worst case your sequences must tolerate, and the spread tells you whether the system is deterministic at all.

## Task Structure and Priority

Modern controllers execute several tasks at different priorities. The application decisions:

| Task type | Typical use | Design caution |
| --- | --- | --- |
| Cyclic (main) | Most application logic | Grows silently over project lifetime |
| Cyclic interrupt / timed | Closed-loop control, fast supervision | Every ms of content costs the main scan |
| Hardware interrupt | Events shorter than the main cycle | Keep the handler minimal |
| Startup | Initialisation | Never leave outputs undefined |
| Error tasks | Fault handling | Absence changes controller behaviour |

The single most common structural error is **using a fast cyclic task as a general-purpose "important logic" container.** A 10 ms task runs a hundred times per second. Logic placed there that does not need that rate consumes CPU that the main scan then lacks, and — because it interrupts the main scan — it also increases the main scan's jitter.

The rule worth applying: content goes in a fast task only when a stated requirement demands that rate. "It felt safer there" is not a requirement, and it has a measurable cost.

**Interrupt handlers stay short.** A long handler blocks lower-priority execution for its whole duration, which converts an interrupt intended to improve responsiveness into a source of jitter for everything else.

## Where the Time Actually Goes

When a cycle is longer than expected, the usual contributors, in rough order of frequency:

- **Communication load.** Acyclic traffic — HMI clients polling, diagnostic tools connected, data logging — competes with cyclic execution. A cycle time measured on a quiet bench is not the cycle time in production with six HMI clients connected.
- **Loops with data-dependent bounds.** A loop whose iteration count depends on process data means the cycle time depends on process data. Bound every loop explicitly.
- **Blocking instructions.** Some communication and file operations take multiple cycles or block. Their behaviour must be known, not assumed.
- **Accumulated logic.** The commonest cause and the least dramatic: three years of additions, none of which individually mattered.

## Failure Modes

**The pulse that is never seen.** A proximity sensor produces a signal shorter than the cycle time. The program misses it systematically, but only at high production speed — so it presents as a speed-dependent intermittent fault and gets blamed on the sensor.

**Cycle-time creep to a time error.** Logic accumulates until the monitoring time is exceeded. The controller's response is a configured behaviour, and if the time-error handling was never engineered, the outcome may be a controller stop.

**Counting cycles as a clock.** Logic that counts scans to measure a duration produces a time that varies with load. It works during commissioning and drifts in production.

**Order-dependent logic.** Two blocks whose correctness depends on which executes first. Works until someone reorders the calls, or until a fast task interrupts between them.

**Fast-task overrun.** A cyclic interrupt whose content does not fit its interval. The behaviour on overrun is platform-specific and never benign — and the condition can persist unnoticed if nothing evaluates it.

## Diagnostics: Investigating a Timing Fault

*The following is an illustrative engineering scenario.*

**Symptom:** A packaging line rejects product intermittently, more often at higher line speed. The reject decision is based on a sensor reading correlated with an encoder position.

**Evidence to gather:**

- minimum, maximum and current cycle time, under production load
- the configured I/O update rate for the station carrying the sensor
- the sensor's actual pulse duration at the speeds where it fails
- the input filter setting on the module
- whether the failure rate correlates with line speed, HMI client count, or both
- network port statistics for that station

**Reasoning:** If the pulse duration at the failing speed is shorter than the I/O update interval, the signal is being missed before the program ever sees it — no amount of program optimisation will help, and the fix is a faster station update, a hardware interrupt, or latching in the device. If the pulse is comfortably longer but the maximum cycle time spikes when HMI clients connect, the problem is communication load inflating jitter. If neither, the encoder correlation logic itself is the suspect.

The three findings have three unrelated remedies. Measuring first is what separates them; changing the program first is what wastes the shift.

## Commissioning Considerations

- **Measure cycle time under realistic load** — HMI clients connected, diagnostics active, at production rate. A bench measurement is not a baseline.
- **Record minimum, maximum and mean at handover.** This is the only way a future performance question can be answered.
- **Verify every fast pulse against the actual I/O update rate**, not against the scan time. The station update is usually the binding constraint.
- **Leave real headroom.** A controller commissioned near its cycle monitoring limit has no room for the diagnostics that a future fault investigation will require.
- **Test the time-error path deliberately** rather than assuming it will behave.

## Safety Considerations

Where a response time is part of a safety function, that time is a property of the entire chain — sensor, logic, final element — and is engineered and verified under the functional-safety standards applicable to the plant. The safety response time is not the scan time, and a safety function's timing is never established by measuring the standard controller.

The practical point for standard control: protective interlocks implemented in the standard system have a response time that must be known and stated, because someone will eventually ask what it is, and "about a scan" is not an answer that survives a review.

## Recommended Practice

- Write the latency budget with real device and station numbers before optimising anything.
- Treat determinism and speed as separate requirements; specify the tolerable jitter.
- Record minimum, maximum and mean cycle time — never current alone.
- Check every fast signal's pulse width against the I/O update rate.
- Put logic in a fast task only when a stated requirement demands that rate.
- Keep interrupt handlers minimal.
- Bound every loop explicitly; never let iteration count depend on process data.
- Never measure time by counting cycles; use a real timer.
- Engineer the time-error and overrun behaviour rather than inheriting it.

## Conclusion

Response time in a control system is a chain, and the controller's scan is one link — often not the longest. Engineering it well means writing the budget down with real numbers, distinguishing the average from the worst case, and treating jitter as a specified property rather than something discovered later.

The most valuable habit is also the cheapest: measure minimum, maximum and mean under realistic load, and record them. Almost every difficult timing investigation begins with someone asking whether the timing has changed, and almost none of them can answer it.
