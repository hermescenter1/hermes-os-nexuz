# Digital Twins for Industrial Assets and Automation Systems

## Executive Summary

The term "digital twin" has been stretched until it covers everything from a three-dimensional visualisation to a dashboard with live tags, and the stretching has cost the concept its engineering meaning. Recovering that meaning takes one distinction and one claim.

**The distinction is data flow.** A **digital model** has no automatic data exchange with the physical asset — someone updates it when they remember. A **digital shadow** has automatic one-way flow from the physical asset to the digital representation, which is what a live dashboard on a simulation is. A **digital twin** has automatic flow in both directions, so the digital representation both reflects the asset and influences it. **Most things called digital twins are digital shadows, and a substantial number are digital models with a live tag list attached.** This is not pedantry: the three have different costs, different risks and completely different governance requirements.

**The claim is that the value was never the picture.** A visualisation that mirrors the plant is impressive and diagnostically empty. **The engineering artefact of a twin is the residual — the difference between what the model predicted and what the plant actually did** — because that difference is where every insight lives: degradation, fouling, leakage, wear, a wrong assumption, or an instrument that has drifted.

And one further idea carries most of the practical value in this article: **in a physics-based model, an estimated parameter is a physically meaningful condition indicator.** A fouling coefficient, an isentropic efficiency or a discharge coefficient estimated continuously from operating data is not an anomaly score — it is a number an engineer already knows how to interpret, compare against design, and trend toward a cleaning date.

This article covers the three definitions and when each is appropriate, physics-based against data-driven against hybrid models, what synchronisation actually requires, the fidelity limits that a good visualisation conceals, virtual commissioning and what it does and does not prove, integration boundaries with control systems, and the governance without which a twin diverges from the plant silently and keeps producing confident numbers.

The learned-model considerations — confidence, applicability, explainability, safety boundaries — are set out in the companion article on industrial AI, and apply in full to any data-driven component of a twin.

## Model, Shadow, Twin

| | **Digital model** | **Digital shadow** | **Digital twin** |
| --- | --- | --- | --- |
| **Data flow** | Manual, occasional, both directions | Automatic, physical → digital | Automatic, both directions |
| **What it is good for** | Design studies, sizing, offline what-if | Monitoring, condition inference, residual analysis, prediction | Closed-loop optimisation, automated adaptation |
| **Divergence risk** | High, and obvious | Moderate, and detectable through residuals | Moderate, and consequential because it acts |
| **Governance burden** | Low | Moderate — it informs decisions | High — it is part of the operating system of the plant |

**Most industrial value sits in the middle column, and that is a genuinely useful place to be.** A well-maintained digital shadow that continuously compares prediction against measurement delivers condition inference, soft sensing and early warning without ever writing to the plant — and it carries a fraction of the assurance burden of anything that acts.

**The right question at the start of a project is therefore which of the three is being built**, because the answer determines the verification requirements, the security boundary, the change-management obligations and the cost. A project that says "digital twin" and builds a shadow has usually built the right thing and described it wrongly; a project that says "digital twin" and builds a model with live tags has built a dashboard.

## Physics-Based, Data-Driven and Hybrid

| Approach | Strength | Weakness | Right when |
| --- | --- | --- | --- |
| **Physics-based** | Explainable, extrapolates beyond observed data, parameters have engineering meaning | Requires the physics to be known and the effort to build it; sensitive to unmodelled effects | The governing relationships are known and matter |
| **Data-driven** | Captures behaviour nobody can write down; fast to build where data exists | Does not extrapolate; parameters mean nothing physically; needs retraining as the plant changes | The relationship is real, complex and not expressible |
| **Hybrid** | Physics provides the structure, data provides the parameters that cannot be known in advance | More engineering effort than either alone; needs both skill sets | Almost all industrial asset twins |

**The hybrid case deserves the emphasis because it is where the diagnostic value concentrates.** Take a heat exchanger. Its governing relationships are well known and can be written down; what cannot be written down is the fouling resistance, which changes continuously and is specific to this exchanger on this duty. **Estimate that parameter online from the measurements, and the estimate is the condition indicator** — with units, with a design value to compare against, with a physically meaningful trajectory, and with a clear operational decision attached to it.

**That is a categorically different output from an anomaly score**, and the difference matters in practice: an engineer can argue with a fouling coefficient. They can compare it against the last cleaning, against the design basis, against the other exchanger in the same service. An anomaly score offers none of that.

**The same pattern generalises.** Compressor isentropic efficiency, pump hydraulic efficiency, valve discharge coefficient, motor loss coefficient, insulation thermal resistance — each is a parameter with engineering meaning that can be estimated from routine operating data and trended as a health indicator.

**And it carries the warning that produces the scenario at the end of this article: an estimated parameter absorbs anything the model does not otherwise explain**, including instrument error. That property is exactly what makes it useful and exactly what makes it dangerous.

## What Synchronisation Actually Requires

"Synchronised with the plant" is easy to say and has four concrete requirements, all of which are commonly underestimated.

**The right state variables at the right rate.** The update interval must be short relative to the dynamics being represented. A model of a thermal process updated every few minutes may be adequate; the same interval applied to a fast hydraulic or electrical phenomenon represents nothing. **The requirement is set by the process, not by the convenience of the data pipeline.**

**Consistent initialisation.** A dynamic model must start from a physically consistent state. Initialising from a snapshot of measurements taken at slightly different times, or containing an inconsistent set of values, produces a model that begins with a transient nobody imposed and that is then interpreted as a residual.

**Time alignment across sources.** The same discipline the failure-investigation article demands of timelines applies here continuously: measurements arriving with different latencies and different timestamps will be compared against a model state, and any misalignment appears as a residual.

**Periodic re-anchoring for predictive runs.** A model run faster than real time to predict ahead accumulates error from its own approximations. **It must be re-initialised from measurements at a defined interval, or its prediction horizon must be short enough that the accumulated error stays acceptable** — and which of those applies is an explicit design decision with a stated horizon, not something to discover in operation.

## Data Fidelity and the Precision Illusion

**A twin can only be as good as what it is given, and a good visualisation conceals that.** This is the specific danger of the form: a smoothly rendered representation with values to three decimal places, built on a measurement whose uncertainty is a percent and whose calibration was last checked two years ago.

**Unmeasured states must be estimated or assumed**, and every assumption becomes a silent dependency exactly like the configured constants in the sensor selection article. Ambient conditions, compositions, unmeasured flows and physical properties are the usual candidates. **A twin's assumptions should be listed, owned and reviewed**, because a process change invalidates them without touching the model.

**The residual is only as trustworthy as the instrument.** If a measurement drifts, the residual moves, and the model will attribute the movement to whatever mechanism the model contains. This is why a twin does not remove the need for instrument maintenance — **it increases it**, because the twin now converts instrument error into apparent process findings.

**And state the uncertainty.** A residual smaller than the measurement uncertainty is not a finding. A twin that reports differences without reporting what difference is significant is inviting people to chase noise.

## Uses That Earn Their Cost

**Virtual commissioning** is the most mature and most defensible application. Control logic is tested against a simulated plant before the physical plant exists, which finds sequence errors, interlock mistakes, alarm floods and mode-transition faults at a stage where they are cheap. **The honest limit is that it validates the logic against the model, not against reality** — and the gap between them is precisely where the remaining faults live. Field device behaviour is the usual gap: valve stroke times, sensor filtering and response, dead time, drive ramp behaviour, and the physical delays that only appear on real equipment. **Virtual commissioning reduces the site commissioning effort; it does not replace it**, and treating it as a replacement produces a confident team meeting an unmodelled reality.

**Operator training** on a synchronised model, particularly for abnormal situations that cannot be created in the real plant.

**Evaluation before change.** Running a proposed operating change, a new setpoint strategy or a modified sequence against the model before applying it — with the model's fidelity limits explicitly acknowledged in the conclusion.

**Condition inference and soft sensing**, as described above: estimating what cannot be measured directly, either because there is no instrument or because the instrument is unreliable in that service.

**Performance comparison.** Comparing the asset against itself over time, against its design basis, and against sister assets in the same service — the last being unusually informative because it controls for many shared assumptions at once.

## Integration With PLC and SCADA

**The boundary discipline is the same one the industrial AI article sets out, and for the same reasons.**

- **In production, a shadow reads and does not write.** This is the default, and departing from it converts the project into something with a much larger assurance burden.
- **Any write path is explicitly designed, deterministically gated and justified.** A twin that adjusts setpoints is participating in control, and the plant's engineering constraints — permissives, interlocks, rate limits, envelopes — apply to its output exactly as they apply to anything else.
- **Safety functions remain deterministic and independent.** A twin does not participate in them.
- **Availability requirements follow from use.** A shadow that informs a weekly cleaning decision can be unavailable for a day. Anything the plant's operation depends on inherits the plant's availability requirements.

**For virtual commissioning specifically**, the connection is either software-in-the-loop (control code executing against a simulation) or hardware-in-the-loop (the real controller connected to a simulated plant). Hardware-in-the-loop tests more of the real system, including scan behaviour and communications, and is correspondingly more useful. **The essential rule in both cases: the simulation environment must not become a dependency of the production system**, and the transition from simulated to real I/O must be a deliberate, verified, documented step rather than a configuration flag someone might set wrongly.

## Model Drift, Lifecycle and Governance

**A twin diverges from its plant by default.** The plant is modified, re-rated, retrofitted, re-instrumented and re-tuned continuously. The twin is updated when someone remembers. **The divergence is silent, because a diverged twin still runs, still looks correct and still produces plausible numbers** — and its outputs remain confident all the way through.

**The single most important governance statement is therefore this: the twin must be inside the plant's management of change.** A modification that affects the asset must trigger a review of the twin, and the review must be recorded as complete or explicitly deferred. A twin outside change management becomes, over a few years, a confident liar.

**The supporting practices:**

- **A named owner** for each twin, with the responsibility to revalidate it.
- **Defined revalidation triggers**: physical modification, re-rating, instrument replacement or recalibration, control retuning, product or feedstock change, and a periodic review regardless.
- **Versioning of the model, its parameters, its assumptions and its data mapping**, with the ability to state which version produced a given historical output — the same reproducibility requirement that applies to learned models.
- **A documented assumption register**, reviewed on the same triggers.
- **Validation evidence**: how well does the model match the plant, over what operating range, and with what uncertainty? **Stated once at handover and never revisited is not validation** — it is a snapshot of a relationship that decays.
- **A decommissioning plan.** Twins outlive their usefulness, and one that is no longer maintained but still displayed is worse than none.

## What a Twin Cannot Do

Stating the limits plainly prevents most disappointments:

- **It cannot represent phenomena that are not in its equations or its training data.** A model that does not include a mechanism will attribute that mechanism's effects to something it does include.
- **It cannot predict a novel failure**, for the same reason a learned model cannot.
- **It cannot substitute for measurement.** A soft sensor is an inference from other measurements plus assumptions, and it degrades when either changes.
- **It cannot validate itself.** Agreement between a model and the plant proves the model matches over the observed range; it says nothing about the range not observed, which is where the interesting questions are.
- **It cannot make an unmeasurable quantity observable** if nothing in the measurement set is sensitive to it. If two different physical conditions produce identical measurements, no model can distinguish them.

## Failure Modes

**A digital model with live tags described as a twin.** Different assurance, different cost, different expectations.

**Visualisation treated as the deliverable.** The residual — the actual engineering output — is never computed or displayed.

**Update rate set by the data pipeline rather than the process dynamics.** A model that represents nothing about the fast behaviour it appears to show.

**Dynamic model initialised from an inconsistent snapshot.** A transient nobody imposed, read as a residual.

**Predictive runs never re-anchored to measurements.** Accumulated approximation error presented as a forecast.

**Precision displayed far beyond the underlying measurement uncertainty.** People chase differences smaller than the noise.

**Assumptions undocumented and unowned.** A process change invalidates the model without touching it.

**Instrument drift absorbed by an estimated parameter.** The twin reports a process finding that is actually a calibration error.

**Residual significance never stated.** No way to distinguish a finding from noise.

**Virtual commissioning treated as a replacement for site commissioning.** A confident team meets unmodelled field-device behaviour.

**Simulation environment left as a dependency of the production system.** A test tool inside the operational path.

**Write path added without deterministic gating.** The twin is now part of control, without control's requirements.

**Twin outside management of change.** Silent divergence, confident output.

**Validation performed once at handover.** A snapshot of a relationship that decays.

**No owner.** The twin is maintained by whoever is interested, until they are not.

**A twin used to distinguish conditions the measurements cannot separate.** No model can, and the output is arbitrary.

**Obsolete twin still displayed.** Worse than none, because it is believed.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A hybrid digital shadow of a heat exchanger has been used for two years to schedule cleaning. It estimates the fouling resistance continuously from flow and temperature measurements and has produced a smooth, physically sensible trend that has matched the observed condition at each cleaning. After a plant outage, the trend continues to look smooth and sensible, and the next cleaning is scheduled against it. When the exchanger is opened, the fouling is substantially heavier than the model reported.

```text
Symptom:
A heat exchanger fouling model that tracked reality well for two years began
under-reporting fouling after an outage, with no visible break in the trend.

Evidence:
- the fouling resistance is estimated from measured inlet and outlet
  temperatures and flows, with the exchanger geometry and duty as fixed model
  inputs
- during the outage, a thermowell on one of the temperature measurements was
  replaced; the replacement has a shorter insertion length than the original
- the temperature measured through the replacement reads slightly low, in a
  manner consistent with a stem conduction error
- there is no step in the fouling trend at the date of the outage; the curve
  is smooth throughout
- the model's residual — the difference between predicted and measured outlet
  temperature — is small throughout and shows no deterioration
- the twin's assumption register does not exist; the instrument configuration
  it depends on is not recorded as a model dependency
- the site's management-of-change process covered the thermowell replacement
  as a maintenance task; nothing in it referenced the model
- a sister exchanger in the same service, whose instrumentation was not
  touched, shows a fouling trajectory that has diverged from this one since
  the outage
- no revalidation of the model was performed after the outage

Reasoning:
The mechanism is a property of parameter estimation rather than a defect in
the model's physics. The estimator has one free parameter — the fouling
resistance — and it adjusts that parameter until the model's predicted outlet
temperature matches the measured one. When the measurement began reading
slightly low, the estimator did the only thing available to it: it moved the
fouling resistance to whatever value reproduced the new measurement. The
residual therefore stayed small, which is exactly why nothing looked wrong.

This is the general hazard of an estimated physical parameter: it absorbs
everything the model does not otherwise explain, including instrument error.
The property that makes the parameter a useful condition indicator — that it
collects the unmodelled difference between prediction and reality — is the
same property that makes it silently wrong when the measurement is the thing
that changed.

Three governance gaps allowed it to persist. The model's dependency on a
specific instrument installation was never recorded, so the thermowell
replacement was not visible as a change affecting the model. The twin was
outside management of change, so nothing triggered a revalidation. And no
validation had been repeated since handover, so the only check on the model's
continued accuracy was the residual — which, by the mechanism above, could not
detect this class of error.

The sister exchanger's divergence is the discriminating evidence and was
available throughout: two units in the same service, one with modified
instrumentation, whose trends separated at the outage date.

Next investigations:
- verify the replacement thermowell's immersion depth against the requirement
  and quantify the temperature offset
- re-estimate the fouling history from the outage date using a corrected
  temperature, and compare against the condition found at opening
- build and own an assumption and dependency register for the model,
  including every instrument it relies on and its configuration
- add model revalidation to the triggers in management of change, so that
  instrument replacement, re-rating and retuning all prompt a review
- establish a periodic validation against independent evidence — the
  condition found at cleaning, and the sister unit — rather than relying on
  the residual alone
- review every other estimated-parameter model on the site for the same
  exposure
```

**Three transferable lessons.** First, **a small residual is not evidence that the model is right**; it is evidence that the estimator found a parameter value that fits, and with enough freedom it always will. Second, **an estimated physical parameter absorbs instrument error indistinguishably from process change**, which means a twin of this kind raises rather than lowers the importance of instrument integrity. Third, **the twin's dependency on a specific instrument installation was a real engineering dependency that appeared in no document**, and that omission is what allowed a routine maintenance task to invalidate a model that everybody was relying on.

## Recommended Practice

- Decide and record at the outset whether you are building a digital model, a digital shadow or a digital twin, and size the verification, security and change-management obligations accordingly.
- Make the residual the deliverable, and display it alongside the statement of what residual is significant given the measurement uncertainty.
- Prefer hybrid models for asset twins: physics for structure, estimated parameters for what cannot be known in advance.
- Choose estimated parameters that have engineering meaning, units and a design value to compare against.
- Remember that an estimated parameter absorbs everything unexplained, including instrument error, and design an independent check accordingly.
- Set the update rate from the process dynamics, not from the data pipeline.
- Initialise dynamic models from a consistent state, and align timestamps across sources.
- Re-anchor predictive runs to measurements at a defined interval, or bound the prediction horizon explicitly.
- Maintain an assumption and dependency register, including every instrument the model relies on and its configuration.
- State the model's validated operating range and its uncertainty, and repeat the validation rather than treating handover as permanent.
- Validate against independent evidence — the condition found at intervention, a sister asset, an offline measurement — not only against the residual.
- Use virtual commissioning for logic, sequences, interlocks and alarms, and state explicitly that field-device behaviour remains to be proven on site.
- Keep the simulation environment out of the production dependency path, and make the transition from simulated to real I/O a verified, documented step.
- Keep production shadows read-only; design, gate and justify any write path, and apply the plant's engineering constraints to the twin's output.
- Keep safety functions deterministic and independent of the twin.
- Put the twin inside management of change, with named revalidation triggers: modification, re-rating, instrument replacement or recalibration, retuning, feedstock or product change, and a periodic review.
- Version model, parameters, assumptions and data mapping together, and be able to reconstruct any historical output.
- Give every twin an owner and a decommissioning plan, and withdraw twins that are no longer maintained rather than leaving them on display.

## Conclusion

A digital twin is not a picture of a plant and it is not a dashboard. It is a model that runs alongside an asset, is fed by it, and is judged by the difference between what it predicts and what the asset does. Everything valuable follows from that difference: condition inference, soft sensing, early warning, and — in the hybrid case — a physically meaningful health parameter that an engineer can interpret without a data scientist present.

The discipline required is unglamorous and mostly organisational. Say which of the three things you are building. Compute and display the residual and its significance. Write down what the model assumes and what it depends on, including the instruments. Validate more than once. Put the whole thing inside management of change, because the plant will keep changing and the twin will not follow on its own.

Do that and a modest model earns its cost for years. Skip it and you build something that looks increasingly impressive and becomes, quietly and without any visible failure, less and less true.
