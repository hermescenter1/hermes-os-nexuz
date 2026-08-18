# Industrial Transformer Selection and Protection

## Executive Summary

A transformer is one of the few pieces of industrial plant selected once and then operated, largely unchanged, for decades. That asymmetry — minutes of specification, decades of consequence — is why the selection decisions deserve more scrutiny than they usually receive, and why a transformer replaced "like for like" on the basis of its nameplate power rating is one of the more reliable ways to introduce a problem that appears years later.

Three ideas organise this article.

**The rating is a thermal statement, not a capability.** A transformer rated for a given power is rated under stated conditions of ambient temperature, cooling arrangement and waveform. Change the ambient, obstruct the cooling, add harmonic loading or impose a cyclic duty, and the number on the plate no longer describes what the unit can do.

**Impedance voltage is the widest-reaching number on the datasheet.** It sets the fault level the downstream switchgear must withstand, the voltage regulation the plant experiences, the dip when a large motor starts, and whether the unit can share load with another. It is routinely treated as a manufacturer's detail.

**Protection is layered, and which layers are physically available depends on how the transformer was built.** This is where specifications most often go wrong: gas-accumulation protection exists only on certain liquid-immersed constructions, and specifying it generically produces either a non-compliant order or, worse, a plant that believes it has a protection function it does not have.

**Safety boundary.** What follows is specification and assessment guidance. A transformer holds stored energy, high fault energy, hot surfaces, insulating liquid and — in some constructions — gas under pressure. Every routine mentioned below, from liquid sampling to electrical testing to internal inspection, carries its own authorisation, isolation and qualification requirements set by the applicable standards and the operator's procedures, and none of them should be attempted outside those. No task described here is work on energised equipment.

## The Ratings That Are Actually Design Decisions

**Rated power and the loading profile.** The rating assumes a defined cooling class and a defined ambient. Cooling classes are expressed by letter codes describing the internal medium, its circulation, the external medium and its circulation — a liquid-immersed unit with natural liquid and natural air circulation behaves very differently from one with fans, and the fan-assisted rating is only available when the fans work. **A cyclic load profile is a different question from a peak load**, because thermal mass allows a transformer to exceed its continuous rating for a limited time and then recover; that capability is real, it is governed by loading guides, and it depends on the preceding load and the ambient. It should be engineered rather than assumed.

**Ambient, altitude and enclosure.** Ratings are stated for reference conditions. A hot plant room, an enclosure that restricts airflow, or an installation at altitude — where reduced air density degrades both cooling and external insulation withstand — all require the rating to be re-examined. **The most common version of this error is a transformer that meets its specification on the test floor and is then installed in a room that cannot remove the heat.**

**Harmonic loading.** Harmonic current increases losses disproportionately, so a transformer feeding substantially distorted load must be specified with that in mind. The mechanism and its measurement are covered in the companion article on power quality; the specification consequence is that the harmonic spectrum belongs in the enquiry, not in a later investigation.

**Voltage ratio and taps.** Off-circuit taps are adjusted only with the transformer de-energised and isolated; they are set once, usually at commissioning, and then forgotten — which makes them a commissioning decision that deserves a record. An on-load tap changer is a different proposition: it brings voltage regulation under load, and with it a mechanism, a control scheme, its own maintenance regime and its own protection.

**Vector group and connection.** The connection determines the phase relationship between windings and the path available to zero-sequence current. A delta–star arrangement is the industrial norm for distribution because the delta winding circulates zero-sequence current rather than passing it through, and the star winding provides the neutral point for the low-voltage system's earthing arrangement. **That neutral point is a system-earthing decision, not an incidental feature** — how it is earthed determines the earth-fault current available and therefore what protection can detect an earth fault, a subject developed in the companion article on earthing.

**Impedance voltage — the trade-off, stated plainly.** A lower impedance gives better voltage regulation and a smaller dip when large motors start, and it produces a *higher* fault level on the secondary side. A higher impedance limits the through-fault current the downstream switchgear must withstand, and it produces poorer regulation and deeper starting dips. There is no universally correct choice; there is only a choice that has been made deliberately with the downstream equipment ratings and the motor starting behaviour in view.

**Paralleling.** Two transformers can be operated in parallel only if their phase displacement is compatible, their ratios match and their impedances are close enough for acceptable load sharing. **Impedance mismatch does not prevent parallel operation; it produces unequal load sharing**, so the unit with the lower impedance takes more than its share and reaches its thermal limit first. Paralleling also alters the fault level, which returns the question to the switchgear ratings.

## Liquid-Immersed and Dry-Type: A Real Comparison

This choice is often presented as a preference. It is an engineering decision dominated by fire risk, location and environment.

| | **Liquid-immersed** | **Dry-type (cast resin or impregnated)** |
| --- | --- | --- |
| **Insulation and cooling** | Insulating liquid plus solid insulation; liquid also transfers heat | Air plus solid insulation; heat leaves by air only |
| **Fire behaviour** | Depends strongly on the liquid; fluids differ substantially in fire point, and classification reflects this | No insulating liquid, but the materials still have a defined fire behaviour that must be specified |
| **Location** | Typically outdoors or in a dedicated room with liquid containment and fire separation | Can often be placed closer to the load and inside the building |
| **Short-term overload** | Substantial thermal mass gives useful short-term capability | Lower thermal mass; responds faster to overload and to ambient |
| **Environment sensitivity** | Sealed against moisture and contamination | Sensitive to humidity, condensation, dust and corrosive atmospheres; needs clean cooling air |
| **Condition monitoring** | The liquid itself is a diagnostic medium — dissolved gas, moisture, quality | No liquid diagnostic; relies on temperature, partial discharge and inspection |
| **Available protection** | Gas, pressure and liquid-temperature devices, depending on construction | Winding temperature sensing is the primary internal protection |
| **Routine maintenance** | Liquid sampling and quality, breather where fitted, gasket and seal integrity | Cleaning, ventilation, checking for surface contamination and tracking |

**The critical asymmetry is monitoring.** A liquid-immersed transformer carries its own diagnostic medium: incipient faults leave evidence in the liquid long before they become failures. A dry-type transformer offers no equivalent, which means its temperature monitoring is not a convenience but the principal means of knowing its condition. **Specifying a dry-type unit and then leaving its winding temperature device unconfigured removes essentially all of its condition information.**

**IEC 60076-11 defines classification classes for environmental conditions, climatic conditions and fire behaviour for dry-type transformers.** These are specification parameters chosen for the installation, not defaults that arrive automatically, and a dry-type unit intended for a humid or dirty industrial environment must be specified for it.

## Layered Protection, and What the Construction Allows

Transformer protection is a set of overlapping functions, each covering what the others cannot.

**Overcurrent and short-circuit protection** on the high-voltage side, set above the transformer's legitimate transient behaviour and below its withstand capability. **The complication is energising inrush**: switching a transformer onto the supply produces a high, offset, decaying current whose magnitude depends on the point on the voltage wave at which the switch closes and on the residual flux left in the core. This current is not a fault, and protection that trips on it will trip every time the unit is energised. It is distinguished from a fault by its characteristic decay and by its harmonic content — inrush is rich in second-harmonic current, and second-harmonic restraint is the standard means by which differential relays avoid operating on it.

**Differential protection** for larger units compares the current entering and leaving, and operates on the difference. Two configuration requirements are the classic source of misoperation: the phase displacement of the vector group must be compensated, and **zero-sequence current must be removed from the star-side measurement**, because an external earth fault otherwise produces zero-sequence current on the star side with no counterpart on the delta side, which the relay reads as a difference. A differential scheme that trips for external earth faults has almost always failed one of these two.

**Restricted earth fault protection** covers the star winding with high sensitivity, including faults close to the neutral where a differential scheme is inherently insensitive because the fault produces little current at the terminals.

**Thermal protection** is the layer that determines service life rather than survival. For liquid-immersed units this is typically a top-liquid temperature measurement together with a winding temperature image; for dry-type units it is temperature sensors embedded in the windings. In both cases the alarm and trip stages are engineering decisions, and both must be configured, tested and trended. **An installed temperature device whose contacts are not wired, not configured or not trended is not protection.**

**Gas and pressure protection — and its applicability.** This is the point at which specifications most often assert something that cannot be delivered.

- **A Buchholz relay is mounted in the pipework between the tank and the conservator.** It therefore exists only on **liquid-immersed transformers of conservator construction**. It has two distinct functions: a gas-accumulation function responding to slowly evolving gas from an incipient fault, conventionally used for alarm, and a surge or flow function responding to the rapid movement of liquid produced by a major internal fault, conventionally used for tripping.
- **A hermetically sealed liquid-immersed transformer has no conservator, and therefore cannot have a Buchholz relay.** Sealed units are protected instead by devices designed for that construction — pressure relief arrangements, sudden-pressure or gas-pressure detection, and combined devices that sense gas accumulation, tank pressure and liquid temperature together.
- **A dry-type transformer has no insulating liquid and therefore no gas-accumulation protection of any kind.** Its internal protection is thermal, supported by inspection and, where justified, partial discharge measurement.

**The rule that follows is simple and frequently broken: do not specify gas protection generically.** Establish the construction first, then specify the devices that construction can carry. A specification that requires Buchholz protection on a sealed or dry-type unit is either rejected at order stage — the good outcome — or quietly satisfied with something else while the plant's protection schedule continues to list a function that does not exist.

**One further point about gas that is routinely wasted: accumulated gas is evidence.** Gas collected by a gas-accumulation device can be sampled and analysed to indicate what kind of fault produced it. Resetting the device and returning the transformer to service without sampling discards the most direct diagnostic information the event will ever offer.

**Neutral earthing and its own protection.** Where the star point is earthed through an impedance, that impedance limits the earth-fault current — which is usually the intention — and it becomes a component whose integrity matters. **A neutral earthing resistor that has failed open is invisible during normal operation and converts the system into an unearthed one at the moment of the first fault**, so its continuity deserves monitoring rather than assumption.

**Surge protection** at the transformer terminals where the exposure justifies it, coordinated with the rest of the installation's surge arrangements.

## Condition Monitoring: What Each Construction Permits

**For liquid-immersed transformers, dissolved gas analysis is the most informative routine diagnostic available on any item of electrical plant.** Different internal fault mechanisms — thermal faults at different severities, partial discharge, arcing — generate characteristically different mixtures of gases dissolved in the liquid, and interpretation frameworks such as IEC 60599 exist to relate the observed mixture to a probable mechanism.

Three practical points determine whether it is worth doing:

- **Trend beats snapshot.** A single sample without history supports weak conclusions. A series of samples taken consistently supports strong ones, because the rate of change is more diagnostic than the absolute value.
- **Sampling technique dominates result quality.** Contamination, air ingress and inconsistent sampling points produce results that describe the sampling rather than the transformer.
- **The tap changer compartment is interpreted differently.** A diverter switch arcs as part of its normal operation, so gas in its separate compartment is expected and must not be read against main-tank expectations. Confusing the two produces either false alarm or false reassurance.

**Other liquid diagnostics** address the insulation system rather than active faults: moisture content, dielectric strength and acidity describe the condition of the liquid and, indirectly, the ageing of the solid insulation, and furan analysis is used as an indicator of paper degradation.

**For dry-type transformers the picture is narrower and the discipline therefore stricter.** Winding temperature trending is the primary indicator, and it is only useful if it is recorded rather than merely alarmed. Partial discharge measurement addresses insulation condition where the application justifies it. Visual inspection matters more than on a sealed unit, because contamination, moisture and surface tracking are the dominant degradation mechanisms and they are visible.

**For both constructions**, the connections at the bushings and terminals are a distinct concern from the transformer itself: a deteriorating termination generates heat at the joint, not in the winding, and it is found by inspection of the connection rather than by any device measuring the transformer's internal condition.

## Installation, Environment and the Slow Failures

**Cooling is a system, not a component.** For a dry-type unit that means room ventilation, unobstructed airflow, clean intakes, and an ambient the specification actually assumed. For a liquid-immersed unit it means radiator surfaces, fan operation where fitted, and clearance. **Cooling is degraded by ordinary housekeeping decisions** — a store built against a transformer enclosure, a blocked louvre, a room whose extract fan failed months ago — and none of these appears in an electrical record.

**Liquid containment and fire separation** are part of the installation design for liquid-immersed units, and the requirements depend on the liquid, the location and the applicable rules.

**Loading changes.** Plants grow. Drives are added, processes are extended, and the transformer selected for the original load is asked to supply something else with a different magnitude and a different waveform. **The transformer's suitability is therefore not a permanent finding**, and a plant that adds significant converter load without revisiting the transformer has made a decision without knowing it.

## Failure Modes

**Replaced like-for-like on kVA alone.** Different impedance, so a different downstream fault level and different regulation.

**Impedance chosen by the supplier.** The fault level the switchgear must withstand determined by default.

**Dry-type unit installed in a room sized for the thermal behaviour of the oil-filled unit it replaced.** Runs hot from day one.

**Ambient and ventilation not verified against the rating conditions.** A compliant transformer in a non-compliant room.

**Harmonic loading not stated in the enquiry.** Additional losses that were never specified for.

**Off-circuit taps never set or never recorded.** Voltage wrong across the plant, and no record of what was selected.

**Buchholz protection specified for a sealed or dry-type transformer.** Either a rejected order or a protection schedule listing a function that does not exist.

**Gas-accumulation device reset without sampling the gas.** The best available evidence discarded.

**Differential scheme without vector-group compensation or zero-sequence removal.** Trips for external earth faults.

**Protection set below inrush.** Trips on energising, then gets desensitised until it no longer protects.

**Winding temperature device installed but not wired, configured or trended.** No thermal protection, and no condition information at all on a dry-type unit.

**Neutral earthing impedance not monitored.** A failed-open resistor discovered by the first earth fault.

**Transformers paralleled with mismatched impedance.** Unequal load sharing; one unit reaches its thermal limit while the other is underused.

**Dissolved gas analysis performed once, years apart, with inconsistent sampling.** A number without a trend, and a trend without validity.

**Tap changer compartment gas interpreted against main-tank expectations.** False alarm, or false reassurance.

**Plant load grown substantially since selection, transformer never reassessed.** A specification that describes a plant that no longer exists.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A dry-type transformer feeding a production area fails after a few years of service, well short of any reasonable expectation. It replaced a liquid-immersed unit of the same nameplate power rating, installed in the same substation room, and the replacement was approved on the basis that the ratings matched. After the failure, the maintenance review asks why the gas relay did not give warning.

```text
Symptom:
Premature failure of a dry-type transformer, no prior alarm, replaced a
liquid-immersed unit of identical nameplate rating in the same room.

Evidence:
- there is no gas relay: the unit is dry-type and contains no insulating
  liquid, so no gas-accumulation protection can exist on it
- the winding temperature sensors are installed and terminated, but their
  outputs were never wired into the control system and no temperature has
  ever been recorded
- the room's mechanical ventilation was specified for the previous unit and
  one extract fan has been out of service for an extended period
- pallets and stores have been placed against the transformer enclosure,
  restricting the airflow path
- the room ambient measured during production is well above the reference
  ambient assumed by the transformer specification
- several converter-fed drives were added to the area after the transformer
  was ordered; the harmonic spectrum was not stated in the enquiry
- the failure signature is consistent with prolonged thermal ageing rather
  than an electrical fault event

Reasoning:
Three compounding causes, none of which is a defect in the transformer. The
replacement was justified on nameplate power alone, but a dry-type unit has
far less thermal mass than the liquid-immersed unit it replaced and relies
entirely on air to remove heat — so identical ratings did not mean identical
behaviour in that room. The room then delivered less cooling than the
specification assumed, through degraded ventilation, obstruction and elevated
ambient. And the load acquired harmonic content that was never declared, which
adds loss beyond the sinusoidal assumption. Any one of these would have been
survivable; together they produced continuous operation above the thermal
design point. The absence of warning is not a protection failure in the
conventional sense: the only device capable of giving that warning was the
winding temperature sensing, and it was never connected. The expectation of a
gas relay reveals the underlying error — the protection philosophy was carried
over from the previous unit along with the rating.

Next investigations:
- record the actual room ambient and airflow across a full production cycle
- measure the harmonic spectrum at the transformer secondary under
  representative load
- reconstruct the loading profile, including the added converter load
- restore the ventilation and remove the obstructions before any replacement
  is energised
- specify the replacement against the measured ambient, the measured harmonic
  content and the actual loading profile, and wire, configure and trend its
  winding temperature devices before it is put into service
```

**The transferable lesson has two parts.** A nameplate rating is a thermal statement made under conditions, and matching the number across two different constructions matches almost nothing. And the protection a transformer can carry is determined by how it is built — a dry-type unit will never have gas protection, which makes its temperature monitoring the whole of its early warning, and leaving that unconnected is not a wiring omission but the removal of the unit's only condition indicator.

## Recommended Practice

- Treat the rating as conditional: state the ambient, the enclosure, the altitude, the cyclic duty and the harmonic content in the enquiry, and re-check them against the installed location.
- Choose the impedance voltage deliberately against the downstream switchgear ratings and the motor starting behaviour, rather than accepting a default.
- Establish the vector group and the star-point earthing arrangement as system decisions, because they determine what earth-fault protection can detect.
- Where units are to be paralleled, verify phase displacement, ratio and impedance compatibility, and evaluate the resulting fault level.
- Select between liquid-immersed and dry-type on fire risk, location, environment and monitoring needs — not on price alone, and never by assuming equivalence at equal kVA.
- Specify the environmental, climatic and fire-behaviour classification of a dry-type unit for the actual installation conditions.
- Establish the construction before specifying gas protection: conservator-type units can carry a Buchholz relay, sealed units use pressure and combined gas-pressure-temperature devices, and dry-type units have no gas protection at all.
- Where a gas-accumulation device operates, sample and analyse the gas before resetting it.
- Set overcurrent protection above energising inrush and rely on second-harmonic restraint in differential schemes rather than on desensitisation.
- Verify vector-group compensation and zero-sequence removal in any differential scheme, and test it against an external earth fault condition.
- Provide restricted earth fault protection for the star winding where sensitivity near the neutral matters.
- Wire, configure, test and trend the winding temperature devices — on a dry-type unit they are the only condition information available.
- Monitor the integrity of any neutral earthing impedance rather than assuming it.
- Establish a dissolved gas analysis programme with consistent sampling and a trend, and interpret the tap changer compartment separately from the main tank.
- Treat cooling as a maintained system: ventilation, clean intakes, unobstructed clearance and a verified room ambient.
- Reassess the transformer whenever the plant load grows or acquires significant converter content, because the specification described the plant as it was.

## Conclusion

Transformers fail slowly and for unglamorous reasons. Very few of the failures in industrial service originate in the transformer's electrical design; most originate in a specification that described conditions the installation did not provide, in a protection scheme assembled from habit rather than from the construction in front of it, or in condition information that was available and never collected.

Specify against measured conditions rather than assumed ones. Decide the impedance rather than inheriting it. Confirm what the construction can physically carry before writing the protection schedule. And connect and trend the devices that already exist — on many units, the difference between a planned replacement and an unplanned failure is a temperature signal that was installed, terminated and never once looked at.
