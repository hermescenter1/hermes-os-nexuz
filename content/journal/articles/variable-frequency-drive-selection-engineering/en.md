# Variable Frequency Drive Selection and Engineering

## Executive Summary

Drive selection is routinely reduced to matching kilowatts on two nameplates. That works often enough to survive as a habit and fails in exactly the applications where a drive is most valuable: high breakaway torque, continuous low-speed operation, high inertia, and loads that push energy back.

A drive is a current source with a thermal limit and a defined overload capability, feeding a motor whose cooling depends on its own speed. Every consequential selection question follows from that sentence rather than from the power rating.

**Safety note.** This article covers selection, engineering and commissioning. Work on drives involves stored DC bus energy that persists after supply disconnection, and rotating equipment that may start under remote command. All work is for qualified personnel under the site's isolation and safe-working procedures.

## Start With the Load, Not the Motor

The load's torque-versus-speed characteristic determines almost everything downstream.

| Load type | Torque behaviour | Typical examples | Selection consequence |
| --- | --- | --- | --- |
| Variable torque | Torque rises with speed squared; power with speed cubed | Centrifugal pumps and fans | Lower overload duty acceptable; strong energy case |
| Constant torque | Torque roughly constant across speed | Conveyors, positive-displacement pumps, mixers, extruders | Higher overload duty; low-speed cooling is critical |
| Constant power | Torque falls as speed rises above base | Winders, spindles, some machine tools | Field-weakening behaviour and motor capability govern |

**For centrifugal machines the affinity relationships are the basis of the energy case**, and they are worth stating precisely because they are also the basis of the most common overestimate:

```text
Q2 / Q1 = N2 / N1              flow scales with speed
H2 / H1 = (N2 / N1)^2          head scales with speed squared
P2 / P1 = (N2 / N1)^3          shaft power scales with speed cubed

  Q = flow, H = head, N = speed, P = shaft power
  Subscript 1 = original condition, 2 = new condition
```

**The assumption that makes these valid is a system curve passing through the origin — friction-dominated, with no static head.** Where a pump lifts liquid to a fixed elevation or against a fixed pressure, part of the head is static and does not reduce with speed. The cube law then over-predicts savings, sometimes substantially, and a system with a high static component may have a narrow usable speed range before flow stops entirely.

**The engineering practice this implies: derive the energy case from the actual system curve and the duty profile, not from the cube law applied to a nameplate.** An installation justified on the cube law that turns out to be static-head dominated will underdeliver, and the drive will be blamed for a modelling error.

## Sizing: Current and Duty, Not Kilowatts

**Select on the motor's actual current under the worst-case duty, and confirm the drive's overload capability covers the required torque for the required time.**

The elements that decide it:

- **Continuous current** at the operating point, not the motor's rated current if the motor is oversized for the load — and not less than it if the motor will genuinely run near rating.
- **Breakaway and acceleration torque**, expressed as current and duration. Drives state an overload capability as a percentage of rated current for a stated period; the application's requirement has to sit inside it.
- **Duty cycle.** Repeated starts, repeated accelerations of a high-inertia load, or frequent reversals load the drive thermally in a way that a steady-state calculation misses.
- **Ambient and altitude derating**, applied before comparing with the requirement rather than after.
- **Switching frequency.** Raising it reduces audible noise and improves current waveform, and increases drive losses — which reduces the usable current rating. It is a selection parameter, not a commissioning preference.

**Two loads with the same motor kW can require different drives**, and the difference is the duty. A fan and a crusher of identical rating are not the same selection problem.

## Motor Cooling at Low Speed

This is the constraint most often discovered after installation.

A totally enclosed fan-cooled motor is cooled by a fan on its own shaft. **At reduced speed the cooling falls while the load torque — on a constant-torque application — does not.** A conveyor running continuously at a third of speed with full torque is a motor at full current with a fraction of its cooling airflow.

The available responses:

- **Forced ventilation** — a separately powered fan, which restores cooling independent of speed.
- **A motor rated for inverter duty over the required speed range**, whose thermal capability is stated for continuous low-speed operation.
- **Oversizing the motor** so that the reduced cooling still matches the reduced thermal loading — often the least elegant and sometimes the most practical.
- **Accepting a limited low-speed duty**, documented, with protection set to enforce it.

**Motor thermal protection must reflect this.** Overload protection based only on current does not know that cooling has fallen. Where continuous low-speed operation is intended, direct temperature measurement in the windings is the reliable answer, and it also gives the drive something better than a model to protect with.

## Braking, Regeneration and the Energy That Must Go Somewhere

Whenever a load drives the motor rather than the other way round — a decelerating flywheel, a descending hoist, a downhill conveyor, a fan windmilling — energy flows back into the drive and raises the DC bus voltage. The drive will trip on overvoltage unless the design has decided where that energy goes.

Four strategies, chosen by how much energy and how often:

| Strategy | Where the energy goes | Suited to |
| --- | --- | --- |
| Extended deceleration ramp | Dissipated in the load and motor losses over a longer time | Occasional stops where time is available |
| Dynamic braking resistor | Converted to heat in a resistor | Intermittent braking; duty cycle and resistor rating must be calculated |
| Regenerative / active front end | Returned to the supply | Continuous or frequent regeneration; higher cost, better efficiency |
| Mechanical brake | Friction, outside the electrical system | Holding rather than controlled deceleration |

**The braking resistor is the choice most often made without calculation.** Its rating is not just peak power; it is energy per braking event multiplied by the repetition rate, and a resistor sized for an occasional stop will overheat on a machine that stops every ninety seconds.

**Continuous regeneration is a different problem from stopping.** A conveyor that runs loaded downhill regenerates for its entire operating period. A resistor turns that energy into heat in the electrical room permanently — a cost in energy and in cooling — where an active front end returns it to the supply. The decision is an energy-and-cooling calculation, not a preference.

**A drive that trips on DC bus overvoltage during deceleration is not faulty.** It is reporting that the braking strategy was not part of the selection.

## Supply Conditions

The drive sees the supply through its rectifier, and several supply properties change what it can do.

- **Voltage tolerance and dips.** A drive's ride-through capability during a short dip depends on its stored DC energy and its configuration. Where dips are common, the desired behaviour — trip, ride through, or controlled deceleration using load inertia — is a design decision that has to be configured and tested.
- **Voltage unbalance** loads the rectifier unevenly and increases DC-link ripple. Where unbalance is significant, it belongs in the selection and may require additional line reactance.
- **Supply impedance.** A stiff supply gives lower distortion but higher fault current; a weak supply gives the opposite. Both matter, and both are properties of the installation.
- **Generator supplies** deserve explicit treatment: limited fault level, sensitivity to harmonic distortion, and — importantly — limited or no ability to absorb regenerated energy. A regenerative front end on a generator supply is a system-level question, not a drive option.

> Harmonic current, its effect on the installation, and the mitigation options are treated in depth in the companion article on VFD harmonics, EMC and motor cable engineering. For selection purposes, the point is that harmonic behaviour is a property of the drive's input stage and belongs in the specification rather than being discovered afterwards.

## Environment, Cooling and Physical Integration

Drives are efficient and still dissipate a meaningful fraction of their throughput as heat, all of it into the enclosure or room.

- **Ambient and altitude derating** apply before any other calculation.
- **Heat into the room is a design load.** Adding drives to an existing electrical room without recalculating cooling is a reliable way to derate every device in it.
- **Airflow paths, filters and their maintenance** are part of the design. A filter nobody owns will eventually be the reason a drive derates or trips.
- **Dust, corrosive atmosphere, humidity and condensation** drive the enclosure specification. Anti-condensation heating matters in unheated buildings and in equipment that is stopped for long periods.
- **Vibration** in material-handling and mobile installations affects mounting and connector choice.

## Motor Insulation, Cables and Bearings

The drive's output is a series of fast voltage transitions rather than a sine wave, and that has three consequences worth deciding at selection time:

- **Motor insulation stress.** Fast-rising edges stress the first turns of the winding. Motors intended for inverter supply are built for it; older or general-purpose motors on long cables may not be.
- **Cable length and reflected waves.** Long motor cables can cause the voltage at the motor terminals to overshoot substantially above the drive's output. The manufacturer states a maximum cable length; exceeding it — or approaching it with a motor of ordinary insulation — is where output reactors or filters become part of the design.
- **Bearing currents.** Common-mode voltage can drive current through bearings, producing progressive damage. Insulated bearings, shaft grounding and correct cable and earthing practice are the mitigations.

These belong in selection because they change what is bought: the motor, the cable type, and whether an output filter is required.

## Control, Communication and Safety Functions

**Communication** brings the same benefit and the same rule as elsewhere in the plant: speed reference, status, current, thermal state and fault codes over a fieldbus are genuinely valuable, and **the drive must behave safely and predictably when the network is absent**. Stop functions and interlocks that matter should not depend on it.

**Integrated safety functions** — most commonly a safe torque off input that removes the drive's ability to produce torque — are useful and frequently misunderstood.

**Safe torque off prevents the drive from generating torque. It is not an isolation, and it does not remove the supply.** The DC bus remains charged, terminals remain live, and a discharge time applies after disconnection. Maintenance work requires isolation and lock-off under the site's procedures; a safety function is part of the machine's operational safety design, not a substitute for that.

Where such functions are used, their category, wiring, response and reset behaviour belong to the machine safety assessment, and their correct operation must be proved at commissioning.

## Parameter Sets as Configuration Items

A drive's behaviour lives in a parameter set of considerable size, and in most plants it exists in exactly one place: the drive.

**The consequences of treating it casually are predictable.** A drive fails, a spare is fitted with factory defaults or with parameters copied from a different machine, and the replacement behaves differently — different ramps, different current limits, different protection settings — in ways that may not be obvious until a heavy load or a fault.

The practice that prevents it:

- **Back up the parameter set after commissioning and after every change**, with the drive identified and the date recorded.
- **Store it where a maintenance engineer can find it at night**, not only on an engineer's laptop.
- **Record deliberate deviations from the standard set** and why they exist.
- **Verify the spare strategy end to end** — including whether the stored file can be loaded into the specific spare model and firmware version held in stores.

> The wider discipline of backing up configurations, verifying restores and keeping tool versions available is covered in the companion article on industrial cybersecurity; drives are one of the asset classes most often missing from those backups.

## Commissioning

- **Enter motor data accurately** and perform the drive's identification or autotune routine where provided; a drive controlling a motor from wrong data is guessing.
- **Confirm direction of rotation** before mechanical coupling where practicable.
- **Set ramps from the process requirement and the braking strategy**, and verify deceleration under the worst realistic load.
- **Verify current limits and motor thermal protection**, including the low-speed case if continuous low-speed running is intended.
- **Prove the safety function** and the behaviour on loss of communication, loss of control supply and supply dip.
- **Confirm anti-restart behaviour** — the drive must not restart automatically after a fault or a supply interruption unless that has been specifically designed and assessed.
- **Measure temperatures under sustained load** in the enclosure and the room.
- **Save and archive the parameter set**, and record it in the maintenance system.

## Failure Modes

**Selected on kW alone.** Adequate for a fan, inadequate for a crusher with the same rating.

**Overload duty not checked.** The drive trips during starting on a load it was expected to handle.

**Continuous low-speed operation without forced cooling.** The motor overheats at a current the protection considers normal.

**Braking strategy absent.** DC bus overvoltage trips during deceleration, blamed on the drive.

**Braking resistor sized on peak, not on duty cycle.** It overheats on a frequently stopping machine.

**Regeneration onto a generator supply.** A system-level problem discovered at commissioning.

**Cable length beyond the stated maximum.** Motor insulation stress and unexplained failures years later.

**Drives added to an electrical room without recalculating heat load.** Every device in the room is derated.

**Safe torque off treated as isolation.** A serious safety misunderstanding.

**Parameter set held only in the drive.** The spare behaves differently and nobody can say how.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A material-handling installation replaces a fixed-speed downhill conveyor drive with a variable speed drive, sized on the motor's kilowatt rating. The objectives are controlled starting and speed matching with the downstream process, both of which are achieved.

The conveyor runs loaded downhill. During commissioning it works: the belt is run empty and at partial load, and the drive behaves correctly. Once production load is applied, the drive begins tripping on DC bus overvoltage, initially during stops and later during sustained running.

The evidence is straightforward once the question is framed correctly. The trips occur when belt loading exceeds a threshold — that is, when the load's gravitational component exceeds the friction losses and the belt begins driving the motor. The drive is not failing to control the belt; it is being fed energy it has nowhere to put. During stops the deceleration adds the stored kinetic energy of the loaded belt on top.

Nothing about the drive is defective, and the kilowatt rating was correct in the sense in which it was checked. The selection omitted the load's fundamental characteristic: **it is an overhauling load that regenerates continuously in normal operation, not just during deceleration.**

The remediation depends on the energy involved. Where regeneration is continuous and substantial, a braking resistor is the wrong answer — it converts the plant's potential energy into heat in the electrical room every hour of every shift, adding both an energy cost and a cooling load. An active front end that returns the energy to the supply is the appropriate solution, and it is a different piece of equipment with different cost, footprint and supply requirements.

**The transferable lesson is the one that separates drive selection from drive purchasing: the question "how much energy does this load return, and how often?" has to be asked before the equipment is chosen, because its answer changes what equipment is chosen.**

## Recommended Practice

- Start from the load's torque-versus-speed characteristic and duty profile; classify the load before looking at products.
- Derive energy savings from the real system curve; treat the cube law as valid only where static head is negligible.
- Size on current and overload duty for the required time, not on nameplate kilowatts.
- Apply ambient, altitude and switching-frequency derating before comparing with the requirement.
- Address motor cooling explicitly for continuous low-speed operation; prefer direct winding temperature measurement.
- Decide the braking or regeneration strategy from energy per event and repetition rate; size resistors on duty cycle.
- Treat regeneration onto a generator supply as a system-level question.
- Specify supply behaviour during dips and unbalance, and test it.
- Include drive heat in the room's cooling calculation, and assign ownership of filters and airflow.
- Check cable length against the stated maximum and specify motor insulation, output filters, bearing insulation and shaft grounding accordingly.
- Keep stop functions and interlocks independent of the communication network.
- Never treat safe torque off as isolation; require isolation and lock-off for maintenance, respecting DC bus discharge time.
- Back up parameter sets after commissioning and after every change, store them where maintenance can reach them, and verify the spare can be loaded from the archive.
- Verify anti-restart behaviour, safety functions, thermal protection and deceleration under realistic load at commissioning.

## Conclusion

A variable speed drive is bought as a component and behaves as part of a system that includes the load's mechanics, the motor's cooling, the supply's stiffness, the room's temperature and the cable between them. Every one of the failures described here comes from selecting the component and inheriting the system by accident.

The discipline is modest and consistent: classify the load, size on current and duty, decide where the braking energy goes, protect the motor for the speed range it will actually run at, and treat the parameter set as an engineering record rather than as a setting inside a box. Done that way, a drive is one of the most reliable pieces of equipment in a plant. Selected on nameplate power alone, it becomes the component that appears to fail whenever the application does something the specification never described.
