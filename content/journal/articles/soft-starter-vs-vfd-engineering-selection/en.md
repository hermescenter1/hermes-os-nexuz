# Soft Starter vs VFD: Engineering Selection Criteria

## Executive Summary

The choice is usually framed as a budget question and answered as a fashion question. It is neither. It rests on one physical asymmetry, and once that asymmetry is stated the majority of cases decide themselves.

**A soft starter reduces starting current by reducing applied voltage, and torque falls with the square of voltage. A drive reduces starting current by reducing frequency and voltage together, so the motor keeps its flux and can produce full torque at a fraction of the line current.**

That is why a soft starter cannot start every load a drive can, why it is nevertheless the better engineering answer for a large share of fixed-speed machines, and why "the drive is more capable" is a true statement that leads to bad decisions when it is used as the whole argument.

**Safety note.** Both devices contain power semiconductors and, in the case of a drive, a charged DC bus that remains hazardous after supply disconnection. All work requires isolation, lock-off, proof of dead and observance of the equipment's stated discharge time, by competent personnel under the site's procedures.

## The Physics That Decides Most Cases

For an induction motor at a given slip, the relationships that matter here are simple and worth stating precisely, because everything else follows from them.

```text
I_start ∝ V                       stator current scales with applied voltage
T_start ∝ V²                      torque scales with the square of applied voltage

  V       = voltage applied to the motor terminals
  I_start = starting current drawn at that voltage
  T_start = torque produced at that voltage, at a given slip

Assumptions: constant supply frequency; motor operating on its normal
V/f relationship; slip unchanged at the instant compared. These are the
conditions under which a reduced-voltage starter works.
```

**The practical consequence:** reducing the start current to roughly half of the direct-on-line value leaves roughly a quarter of the direct-on-line starting torque. A load whose breakaway torque exceeds that will simply not move, and the motor will sit at standstill drawing high current until the protection intervenes.

A drive is not subject to this trade because it is not reducing voltage at fixed frequency. It supplies a low frequency with a correspondingly low voltage, keeping the flux and therefore the torque capability, and the current it draws from the line is set by the power actually delivered rather than by the motor's locked-rotor characteristic.

**This is the whole basis of the selection.** Everything below is either a consequence of it or a practical cost that sits alongside it.

## What the Load Demands

The load's speed-torque characteristic determines whether reduced voltage is even viable.

| Load | Breakaway torque | Inertia | Reduced-voltage start viable? |
| --- | --- | --- | --- |
| Centrifugal pump, valve throttled or closed | Low | Low | Yes, comfortably |
| Centrifugal fan, damper closed | Low | Moderate to high | Usually, but inertia sets acceleration time |
| Centrifugal fan, damper open | Low | High | Marginal; long acceleration |
| Loaded belt conveyor | High | High | Often not — this is the classic failure |
| Positive-displacement pump | High | Low | Usually not without unloading |
| Reciprocating compressor | High, cyclic | Moderate | Only if started unloaded |
| Crusher or mill, loaded | Very high | Very high | No |
| Crusher or mill, empty | Moderate | Very high | Sometimes, with long acceleration |

**Two entries deserve comment.** Compressors and positive-displacement pumps are frequently started *unloaded* — an unloader valve, a bypass, or a discharge valve left open — and that mechanical decision, not the starter, is what makes reduced-voltage starting possible. Where an unloading arrangement exists and is reliable, a soft starter becomes viable on a machine that would otherwise require a drive.

**And the counter-intuitive one:** a high-inertia fan starting against a closed damper has low torque demand but takes a long time to reach speed, and that duration is the constraint.

## Acceleration Time Is a Thermal Budget, Not a Comfort Setting

The most common misconception about soft starters is that a longer, gentler ramp is easier on the motor. It is easier on the *mechanics* and harder on the *motor*.

**During acceleration, the motor operates at high slip, and most of the energy absorbed goes into the rotor.** Rotor heating is driven by the current and by the time spent accelerating. A soft start that reduces current to 60 % of direct-on-line but takes four times as long to reach speed may put more heat into the rotor than the direct-on-line start it replaced.

This produces a specific and recognisable failure: a motor that started reliably on a direct-on-line contactor begins tripping on thermal overload after a soft starter is fitted "to be gentler on the machine".

**The engineering rule that follows: the ramp is bounded at both ends.** It must be long enough to limit mechanical shock and current, and short enough that the motor's permitted acceleration time and start regime are not exceeded. Both limits come from the motor and the load, not from the starter's parameter list.

**Where the load is high-inertia**, this is precisely the condition under which a drive earns its cost: it can produce full torque at low current for as long as the acceleration requires, because the thermal loading of the motor is no longer coupled to a locked-rotor characteristic.

## Where the Soft Starter Is the Better Engineering Choice

A soft starter is not a cheaper drive. It is a different machine with genuine advantages, and treating it as an inferior option produces over-engineered plants.

**When the process needs one speed.** If the machine runs at rated speed whenever it runs, and the only problem is the start, a drive adds capability that will never be used and costs that will be paid continuously.

**When mechanical shock is the actual problem.** Belt slip, gearbox shock loading, coupling wear, chain snatch and water hammer in a pipeline are all start-transient problems. A controlled voltage ramp addresses them directly, and a controlled *stop* ramp addresses water hammer on shutdown — which is often the stronger justification of the two.

**When continuous losses matter.** A soft starter with a bypass contactor is, after the ramp completes, electrically a contactor: essentially no continuous loss, no heat into the room, no harmonic contribution, no output-side effects on the motor. A drive dissipates a fraction of throughput permanently and puts that heat into the electrical room every hour the machine runs.

**When simplicity has operational value.** Fewer parameters, faster commissioning, simpler spares, no motor cable length constraint, no reflected-wave or bearing-current considerations, no harmonic study, and a maintenance technician can understand it at three in the morning.

> The output-side consequences a drive introduces — reflected-wave stress on motor insulation, common-mode current and bearing damage, cable length limits — are covered in the companion article on VFD harmonics, EMC and motor cable engineering. Every one of them is a cost a soft starter with bypass simply does not incur.

## Where the Drive Is Justified

**When the process benefits from variable speed.** This is the decisive case, and it is a process argument rather than an electrical one. Flow or pressure control by speed instead of throttling, matching a conveyor to downstream demand, controlling a fan to a measured condition — these are reasons a soft starter cannot address at all.

> Whether variable speed actually saves energy in a given system, and why the answer depends on the load curve rather than on the drive, is examined in the companion article on energy optimisation using variable-speed drives.

**When full torque is needed at low or zero speed**, or when the load simply cannot be accelerated at reduced voltage.

**When starting frequency is high.** Repeated starting is thermally expensive at the motor, and a drive's low-current, controlled acceleration is far gentler than repeated reduced-voltage starts. A machine that starts many times per hour is a drive application even at constant speed.

**When the supply is weak.** On a generator, a long feeder or a limited-capacity transformer, even a reduced-voltage start may cause an unacceptable voltage dip on the bus. The drive's line current during acceleration is a fraction of either alternative.

**When controlled deceleration or braking is required** beyond what a ramped voltage decay can do — overhauling loads, positioning, or a stopping time the process dictates.

## Bypass: A Design Decision With Consequences

Most soft starters run with a bypass contactor that shorts out the thyristors once the ramp completes.

| Property | With bypass | Without bypass (continuous conduction) |
| --- | --- | --- |
| Continuous losses | Essentially none | Semiconductor losses, continuously |
| Heat into the enclosure | Negligible after start | Significant; affects enclosure and room design |
| Harmonic contribution while running | None | Present, from phase-angle control |
| Soft stop available | Only if the bypass opens first | Yes |
| Additional failure mode | Bypass contactor | — |

**The bypass introduces a failure mode worth recognising.** If the bypass contactor does not close — welded, mis-wired, or its control circuit failed — the thyristors continue to carry full load current indefinitely, in a device rated for intermittent conduction. The result is overheating minutes to hours after a start that appeared entirely normal.

The diagnostic signature is specific: **a starter that runs hot, or trips on device overtemperature, some time after a successful start, with the motor drawing normal current.** Checking bypass contactor operation is a five-minute confirmation that resolves it.

## Harmonics, Losses and What the Installation Sees

**A soft starter distorts the supply only during the ramp.** Phase-angle control produces a distorted current waveform for the duration of the start — seconds — after which the bypass restores a clean sinusoidal path. For a machine starting a few times a day, the installation-level harmonic contribution is negligible.

**A drive distorts the supply continuously**, because its rectifier draws current in pulses whenever the machine runs. That is a permanent property of the installation and belongs in a power quality assessment rather than in a starting discussion.

**The comparison that matters is therefore not "which produces more harmonics" but "for how long".** A plant converting fifty fixed-speed pumps to drives has acquired a continuous harmonic source of fifty times the individual contribution; the same fifty on soft starters have acquired essentially nothing after the first few seconds of each start.

> The mechanisms, the resonance risk with power factor capacitors, and mitigation options are treated in the companion articles on VFD harmonics and on power factor correction. The point here is only that the two starting methods occupy different categories in that assessment.

## Comparison Summary

| Criterion | Soft starter | VFD |
| --- | --- | --- |
| Start current reduction | Yes, at the cost of torque (∝ V²) | Yes, without the torque penalty |
| Full torque at low speed | No | Yes, within rating |
| Continuous speed control | No | Yes |
| Controlled deceleration | Ramped voltage decay only | Yes, including braking strategies |
| High-inertia / high-breakaway loads | Often unsuitable | Suitable |
| High starting frequency | Limited by device and motor thermal duty | Well suited |
| Continuous losses | None after bypass | Permanent fraction of throughput |
| Harmonics while running | None after bypass | Continuous rectifier contribution |
| Motor insulation and bearing stress | None beyond normal supply | Requires assessment |
| Motor cable length constraint | None beyond normal | Manufacturer-stated limit applies |
| Commissioning complexity | Low | Substantial |
| Spares and skills | Simple | Parameter sets, firmware, tooling |
| Weak supply / generator | Helps, but current still elevated | Strongest option |

**No row in that table settles the question alone.** The selection is: does the process need speed control (drive), can the load be accelerated at reduced voltage within the motor's thermal limits (soft starter viable), and does the supply tolerate the resulting current?

## Commissioning

**Soft starter.**

- Set the current limit and ramp from the load's measured or calculated breakaway and acceleration requirement — not from a default.
- Verify acceleration **under worst-case load**, not on an empty machine. A conveyor that starts empty in commissioning and fully loaded in production is the classic surprise.
- Confirm the achieved acceleration time is within the motor's permitted value and the start regime.
- Verify bypass operation, and confirm the starter returns to a cool state after the ramp.
- Where soft stop is used, verify the stop ramp achieves the intended mechanical outcome — the point is usually pipeline pressure or belt tension behaviour, and it should be observed rather than assumed.

**Both.**

- Verify the motor's thermal protection settings reflect the actual start duty, including repeated starts.
- Confirm anti-restart behaviour after a supply interruption; unexpected restart of rotating equipment is a hazard, not a convenience.
- Record the parameter set and store it where maintenance can retrieve it.

## Failure Modes

**Soft starter selected for a high-breakaway load.** The motor stalls at reduced voltage; protection operates; the ramp is lengthened, which makes the thermal problem worse.

**Ramp lengthened to reduce mechanical shock.** Rotor heating increases; the motor trips on a duty it previously handled.

**Acceleration verified on an unloaded machine.** Production load reveals the shortfall.

**Bypass contactor not closing.** Thyristors conduct continuously; overtemperature some time after a normal start.

**Drive fitted where only the start was a problem.** Continuous losses, harmonic contribution, cable and bearing considerations, and a parameter set to maintain — all for a machine that runs at one speed.

**Drive specified without a harmonic assessment on a plant with capacitors.** The interaction is discovered later, at the capacitor bank.

**Start regime ignored.** Either device is fitted, the process restarts the machine repeatedly after trips, and the motor's permitted starts per hour are exceeded.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A mining site fits soft starters to two loaded belt conveyors, replacing direct-on-line contactors. The stated objective is to reduce mechanical shock on the gearboxes and to limit the voltage dip on the local bus during starting. Commissioning is performed during a maintenance window with the belts empty, and both machines start smoothly.

In production, one conveyor repeatedly fails to start when fully loaded.

```text
Symptom:
Loaded conveyor does not accelerate; motor overload operates after several seconds.

Evidence:
- current rises immediately to the configured limit and stays there
- shaft speed remains at or near zero throughout
- the same machine starts normally when the belt is empty or lightly loaded
- the second conveyor, on the same bus and same starter type, starts loaded
- supply voltage at the starter terminals is within tolerance during the attempt
- no upstream protection operates

Reasoning:
Current at the limit with no rotation is a torque shortfall, not a supply
problem and not a starter fault. At the reduced voltage produced by the
current limit, available torque is approximately the square of the voltage
ratio, and it is below the loaded breakaway requirement of this conveyor.
The second conveyor differs in loading profile or incline, which is why it
succeeds under the same settings.

Next investigations:
- loaded breakaway torque of each conveyor, from the mechanical design
- motor speed-torque curve at the applied voltage
- permitted acceleration time and start regime of the motor
- whether the belt can be started partially unloaded as an operating procedure
```

The resolution is a selection decision rather than a setting. Raising the current limit until the conveyor accelerates returns the starting current toward direct-on-line values, which defeats the reason the soft starter was installed and may exceed the bus's tolerance. Extending the ramp increases rotor heating on a start that is already thermally demanding.

**Where a loaded high-inertia belt must start reliably, the load characteristic is asking for torque that reduced voltage cannot supply, and the correct answer is a drive — or a mechanical arrangement that allows the belt to start unloaded.**

The transferable point: the soft starter did not fail. It was applied to a load whose torque demand was never compared against what reduced voltage can deliver, and the empty-belt commissioning test could not reveal that.

## Recommended Practice

- Decide first whether the process needs speed control; if it does, the comparison is over.
- If it does not, compare the load's breakaway and acceleration torque demand against what the intended reduced voltage can produce, remembering the square-law relationship.
- Treat acceleration time as a thermal budget bounded at both ends by the motor's permitted start duty.
- Consider mechanical unloading arrangements, which can make a soft starter viable on machines that otherwise could not use one.
- Count starts per hour; high starting frequency favours a drive regardless of speed requirements.
- Assess the supply: a weak bus or generator may not tolerate even a reduced-voltage start.
- Specify bypass unless soft stopping requires continuous conduction, and account for the bypass as a failure mode.
- Include continuous losses, enclosure heat and harmonic contribution in the comparison, not just purchase price.
- Verify acceleration under worst-case load at commissioning, never on an empty machine.
- Set motor thermal protection for the actual start duty, and verify anti-restart behaviour.
- Where a fleet is being converted, evaluate the aggregate harmonic and heat consequences before standardising on drives.

## Conclusion

The honest summary is that these are not competing products at different price points. A soft starter manages the start of a fixed-speed machine and then removes itself from the circuit. A drive takes permanent control of the motor, gaining speed control and full torque at any speed, and accepting continuous losses, continuous harmonics, output-side stress on the motor and a configuration item to maintain.

Where the process needs speed, the drive is not optional. Where it does not, the question is whether the load can be accelerated at reduced voltage within the motor's thermal limits — and if it can, the simpler machine is very often the better engineering answer, not a compromise.
