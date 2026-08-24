# Industrial Low-Voltage Distribution System Design

## Executive Summary

An industrial LV system is usually designed by summing a load list, selecting a transformer, and distributing outward. That sequence produces a network that works and quietly locks in several decisions nobody made deliberately: the fault level every downstream device must withstand, the voltage the plant will see when its largest motor starts, and how much of the plant stops when one board is isolated for maintenance.

**The architecture is a set of trades, and the useful discipline is making each of them explicitly.** The most consequential is rarely discussed: a lower-impedance transformer gives better voltage regulation and a higher fault level, and those two properties cannot be optimised independently.

**Safety note.** LV switchgear carries a serious arc-flash and shock hazard. Isolation, lock-off, proof of dead and observance of the site's safe-working rules apply to all work described here; nothing in this article is guidance for working on energised equipment.

## The Architecture Before the Equipment

```text
Utility / MV network
        |
   MV switchgear
        |
  MV/LV transformer(s)
        |
+---------------------------------------------+
|          Main LV switchboard                |
|   incomer A  ──[bus section]──  incomer B   |
+---------------------------------------------+
     |            |            |          |
   MCC-A        MCC-B     Distribution  Essential
     |            |          boards      board
   motors       motors      lighting,     |
                            small power  standby
                                         generator
```

Four questions decide the shape, and they are process questions before they are electrical ones:

- **What must keep running when one source is unavailable?** This defines whether there are two sources and a bus section, and what sits on each side.
- **What must keep running when the utility fails entirely?** This defines the essential board and the standby generator interface.
- **What must be maintainable without stopping production?** This is usually the stronger argument for a bus section — maintenance happens far more often than source failure.
- **What will exist here in ten years?** Spare ways, spare capacity and physical space are the three items most often removed during cost reduction and most often needed later.

**A bus section with a coupler requires an interlocking scheme.** The common arrangement permits any two of the three devices — incomer A, incomer B, coupler — to be closed, but never all three, unless the sources are designed to be paralleled. Where that interlock is absent or defeatable, a switching error can parallel two supplies that were never intended to run together.

## Load Estimation and Diversity

**Connected load is not maximum demand**, and treating it as such produces an oversized transformer that runs at poor loading, has a higher fault level than necessary, and costs more than it needed to.

The honest method:

- Build the load schedule from actual equipment, separating continuous, intermittent and standby loads.
- Apply diversity that reflects how the plant is operated — which machines genuinely run together, which are duty/standby, which are seasonal.
- **Record the diversity assumptions with the design.** A diversity factor that exists only in a spreadsheet cell is a number the next engineer cannot check and will not trust.
- Add growth allowance as a stated figure rather than as a hidden safety margin inside the diversity.

**The two failure directions are symmetrical.** Designing to the sum of nameplates gives a transformer that never loads properly. Designing to optimistic diversity gives a transformer with no headroom, and the first expansion becomes a transformer replacement.

## Voltage Drop: The Constraint That Usually Governs

Two different limits apply, and they are frequently confused.

**Steady-state drop** determines whether equipment sees acceptable voltage in normal running. **Transient drop during motor starting** determines whether the plant rides through a start without dropping out contactors, disturbing drives, or dimming lighting.

For a three-phase circuit, the working relationship is:

```text
ΔU ≈ √3 × I × L × (R·cosφ + X·sinφ)

  ΔU   = line-to-line voltage drop (V)
  I    = load current (A)
  L    = one-way circuit length (km, matching the units of R and X)
  R    = conductor resistance per unit length (Ω/km)
  X    = conductor reactance per unit length (Ω/km)
  cosφ = load power factor, sinφ its corresponding sine

Assumptions and limits:
  - balanced three-phase load
  - R and X taken at the conductor's operating temperature, not at 20 °C;
    resistance rises appreciably when the cable is hot
  - reactance matters on larger conductors and can dominate over resistance;
    ignoring X on large cross-sections understates the drop
  - this is the drop in the cable only; source and transformer impedance
    must be added for the voltage actually seen at the load
```

**During a direct-on-line motor start, the current is several times running current and the power factor is low.** Both terms in the expression change unfavourably, which is why a feeder that is comfortable thermally can still produce an unacceptable dip. On long motor feeders it is normally the starting dip, not the thermal rating, that sets the conductor size.

**The dip is not local.** It appears across the whole board, because the current flows through the transformer and the busbar as well as the feeder. That is why a motor start on one MCC can disturb equipment on another — and why the investigation belongs at the source impedance rather than at the motor.

## Fault Levels Are a Consequence of the Source

Transformer impedance sets both voltage regulation and fault level, and it sets them in opposite directions:

| Transformer impedance | Voltage regulation | Prospective fault current | Consequence |
| --- | --- | --- | --- |
| Lower | Better — less drop under load and during starts | Higher | Downstream equipment needs higher ratings |
| Higher | Worse — larger drop, deeper starting dips | Lower | Cheaper downstream equipment, more starting trouble |

**This trade is the core of LV source selection**, and it has to be made against both constraints at once: a transformer chosen purely for starting performance may impose fault ratings that are expensive across hundreds of downstream devices, and one chosen purely to limit fault level may make large motors unstartable.

**Two further contributors are frequently omitted:**

- **Running motors contribute to a fault.** During the first cycles after a fault, motors act briefly as generators and feed current into it. On a motor-heavy industrial board this contribution is significant and belongs in the study.
- **Parallel operation raises fault level.** Two transformers running in parallel through a closed coupler produce a fault level higher than either alone — which is one of the principal reasons the interlock exists.

> The calculation itself, the difference between maximum and minimum fault current, and what each is used for, are treated in the companion article on short-circuit analysis in industrial electrical networks. The point at architecture level is that fault level is chosen when the source is chosen, and every downstream rating follows from it.

## Cable Sizing: Three Independent Criteria

A conductor must satisfy all three, and the largest result governs. Checking one and assuming the others is a recurring source of latent defects.

1. **Thermal current-carrying capacity**, derated for the actual installation: ambient temperature, grouping with other circuits, installation method, thermal insulation contact, and soil conditions for buried routes. A cable rated from a table without derating is rated for a laboratory.
2. **Voltage drop**, checked for both the steady state and the starting transient as described above.
3. **Fault withstand** — the conductor must survive the fault current for the time the protection takes to clear it, which is checked by comparing the energy the protective device lets through against what the conductor can absorb without exceeding its permitted temperature.

**The third criterion depends on the protection settings**, which is why cable sizing and protection design cannot be completed independently — and why changing a protection setting later can invalidate a cable that was correctly sized at the time.

**The protective conductor deserves the same three checks**, and is frequently sized by convention instead. Its fault withstand is a safety function, not an economy.

## Segregation, Essential Loads and Standby Supply

**Essential and non-essential separation** should follow consequence rather than convenience. The essential board carries what must survive a utility outage — emergency lighting, safe-shutdown systems, instrument supplies, critical cooling, and whatever the process needs to reach a safe state.

Two design points that are often deferred and should not be:

- **The generator interface.** Transfer arrangement, whether transfer is open or closed transition, what the plant does during the transfer gap, and which loads may be re-energised automatically. Unexpected restart of rotating equipment on supply restoration is a hazard, and the anti-restart behaviour belongs in the design rather than in commissioning.
- **Generator fault level and motor starting.** A generator is a much weaker source than the utility. Motors that start acceptably on mains may not start on the generator, and protection that discriminates on mains fault levels may not discriminate on the generator's much lower fault current. This is a study case, not an assumption.

**Physical segregation matters where redundancy is claimed.** Two supplies routed through the same duct, the same cable tray or the same fire compartment are two supplies with a common failure mode. Redundancy that survives on the single line diagram and not in the building is a documentation exercise.

## Metering, Expansion and Maintainability

**Metering placement determines what can be answered later.** Energy at the incomers tells the site its bill; energy and power at each MCC tells it where consumption lives; a recorded load profile is the input to every future capacity, tariff and variable-speed decision. Adding metering at construction is inexpensive; retrofitting it into a live board is not.

**Expansion capacity is three separate things**, and all three must be provided deliberately:

- **Spare ways** in boards and MCCs.
- **Spare capacity** in transformer, busbar and cable routes.
- **Physical space** to extend the line-up, including the switchroom door and access route.

**Maintainability** comes down to whether a section can be isolated and worked on while the plant runs, which the bus section provides, and whether anyone can tell what is what: labelling that matches the drawings, an as-built single line diagram, and a protection setting record.

## Commissioning

- **Verify phase sequence** throughout, before any rotating equipment is coupled.
- **Prove the interlocking scheme** by attempting the prohibited combinations under safe conditions — reading the drawing is not proof.
- **Verify protection settings against the study**, and record them. A study that was never applied is a document.
- **Measure the actual voltage at the far end of long feeders**, under load and during the largest motor start, and compare with the calculation.
- **Confirm anti-restart behaviour** on supply restoration, and the generator transfer sequence.
- **Thermographic baseline of the energised board**, taken once the plant has reached a representative load. Its value is not only the defects it finds now but the reference it leaves for the next survey.
- **Record the as-built network** — transformer impedance, cable types and lengths, protection settings. These are the inputs to every future fault study, and reconstructing them years later is expensive and inaccurate.

## Failure Modes

**Transformer chosen on rating alone.** Fault level or starting performance is discovered afterwards.

**Diversity assumed rather than recorded.** Nobody can check the design, and the next expansion has no basis.

**Feeder sized on thermal current only.** The motor starts, and the board dips.

**Cable fault withstand not checked against the actual protection settings.** A later settings change silently invalidates it.

**Protective conductor sized by convention.** A safety function decided by habit.

**Redundant supplies sharing a route.** Redundancy exists on paper only.

**Bus coupler interlock absent or defeatable.** A switching error parallels two sources.

**Generator case not studied.** Motors will not start, or protection does not discriminate, on standby supply.

**No spare capacity or space.** The first expansion becomes a switchboard replacement.

**As-built data not recorded.** The next fault study starts with a site survey.

## A Representative Scenario

*The following is an illustrative engineering example, not an account of a specific project.*

A manufacturing plant adds a large fan to an existing production area, fed from the same LV board as the rest of the line. The feeder is sized on thermal current with margin, and the installation passes inspection. On the first production start, other equipment on the board misbehaves: contactors drop out on two smaller machines and a drive on an adjacent line reports an undervoltage event.

```text
Symptom:
Main LV bus voltage dips during motor start.

Evidence:
- source transformer loading normal before start
- dip begins with motor acceleration
- current peak corresponds to start event
- adjacent feeders show same voltage disturbance
- no upstream protection operation

Reasoning:
This is a system-voltage-drop event driven by starting current, not a local
motor-terminal defect. The disturbance appearing on adjacent feeders shows
the drop is occurring upstream of the feeder — in the transformer and busbar
impedance — rather than in the new cable alone.

Next investigations:
- source impedance
- transformer impedance
- cable impedance
- motor starting method
- acceleration time
```

The evidence separates three candidate remedies, and they are not equivalent:

- **Increase the feeder cross-section.** Reduces the cable's share of the drop only. Where the transformer dominates, this is expensive and largely ineffective.
- **Change the starting method** — soft starter or drive — reducing the current that causes the dip. This addresses the cause and is examined in the companion article on soft starter versus VFD selection.
- **Change the source** — a lower-impedance transformer, or supplying the new load from a different board. Effective, and it raises the fault level that every device on that board must withstand.

**The transferable point is that the correct answer depends on where the impedance is, and that is a measurement rather than an opinion.** A design that had recorded the source impedance and checked the starting dip at the design stage would have chosen between these three before the cable was pulled.

## Recommended Practice

- Start from what must keep running — during maintenance, during a source outage, and during a utility failure — and derive the architecture from that.
- Provide a bus section where maintenance or source redundancy justifies it, and prove its interlocking at commissioning.
- Build demand from a real load schedule with recorded diversity and a stated growth allowance.
- Select transformer impedance against both voltage regulation and fault level, knowing they trade against each other.
- Include motor contribution and parallel-operation cases when establishing fault levels.
- Size every conductor against all three criteria — derated thermal capacity, voltage drop, and fault withstand at the actual protection settings.
- Check voltage drop for the starting transient, not only steady state, and expect it to govern long motor feeders.
- Apply the same rigour to protective conductors as to phase conductors.
- Route redundant supplies physically apart, including through fire compartments.
- Study the standby generator case explicitly for both motor starting and protection discrimination.
- Provide spare ways, spare capacity and physical space as three separate, stated allowances.
- Meter at incomers and at each MCC, and keep the load profile.
- Verify phase sequence, interlocks, settings, anti-restart behaviour and far-end voltage at commissioning, and take a thermographic baseline at representative load.
- Record as-built impedances, lengths and settings as the input to every future study.

## Conclusion

Low-voltage distribution design is mostly the business of making implicit decisions explicit. The load list does not choose the transformer; the required voltage behaviour and the acceptable fault level do, and they pull in opposite directions. The feeder size is not set by its thermal rating; it is set by whichever of three independent criteria demands the most, and one of those criteria depends on protection settings that may change later.

Get those relationships written down — with the diversity assumptions, the impedances, the settings and the growth allowance recorded — and the network remains understandable and extensible for decades. Leave them implicit and the plant inherits a system whose behaviour nobody can predict and whose next expansion begins with a survey.
