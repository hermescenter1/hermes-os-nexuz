# Predictive Maintenance Architecture for Industrial Equipment

## Executive Summary

Predictive maintenance programmes rarely fail for technical reasons. The sensors work, the analysis is competent, and the degradation is genuinely detectable. What fails is the architecture around the detection.

Three claims organise this article.

**Maintenance strategy is selected per failure mode, not per asset.** A single pump has failure modes that justify condition monitoring, failure modes that are cheaper to address on a time basis, failure modes with no detectable precursor at all, and failure modes that should be engineered out. **Predictive maintenance does not replace preventive maintenance** — it displaces the portion of it that addresses failure modes with detectable, slowly developing degradation, and it leaves the rest exactly where it was.

**Lead time is the product.** A detection that arrives reliably but two days before failure, in a plant whose planning cycle is two weeks, has produced an alarm rather than a prediction. The useful question is not "can we detect this?" but "can we detect it far enough ahead to do something other than react?"

**The programme runs on a credibility budget.** Every alert that leads to an inspection finding nothing spends some of it. Once spent, genuine detections are discounted by the people who have to act on them, and the programme dies of disbelief long before anyone cancels it formally.

This article covers how to choose strategy per failure mode, where to spend monitoring effort, what each technique can and cannot see, why data quality and operating context dominate everything downstream, how baselines and thresholds should be set, and — at the centre — the workflow from a detection to a completed work order with its findings fed back.

## Strategy Is Chosen Per Failure Mode

| Strategy | Appropriate when | Inappropriate when |
| --- | --- | --- |
| **Run to failure** | Consequence is low, repair is cheap, redundancy exists, or no warning is obtainable | Failure has safety, environmental or major production consequence |
| **Preventive / time- or cycle-based** | Wear-out is age- or cycle-related and predictable, intervention is cheap, or detection is impractical | Failure is random with respect to age — intervention then adds risk without reducing it |
| **Condition-based / predictive** | Degradation is detectable, develops over a usable interval, and the consequence justifies the effort | The precursor is undetectable, or develops faster than the organisation can respond |
| **Design out** | The same failure recurs and its cause is a design or application choice | The failure is inherent to a process that cannot change |

**The concept that makes this rigorous is the P-F interval** — the time between the point at which an impending failure first becomes detectable and the point at which the item ceases to perform its function. Condition monitoring is viable only if two conditions hold:

- **The monitoring interval is comfortably shorter than the P-F interval**, so that the developing condition is seen at least once, and preferably several times, before functional failure.
- **The P-F interval is longer than the organisation's response time** — detect, validate, diagnose, plan, obtain parts, schedule a window, execute.

**Where either condition fails, the answer is not more sensors.** A failure mode whose P-F interval is measured in hours cannot be managed by a monthly route, and cannot be managed by continuous monitoring either if the plant needs a week to act. The correct response is a different strategy: redundancy, a protective trip, a time-based replacement, or a design change.

**And the claim that has to be stated plainly, because it is oversold constantly: predictive maintenance does not eliminate preventive maintenance.** Statutory inspections remain. Failure modes with no detectable precursor remain time-based. Interventions that cost less than the monitoring remain scheduled. Lubrication, cleaning and calibration remain. A mature programme has *less* time-based work than an immature one and never has none, and any proposal claiming otherwise is describing a subset of the plant's failure modes as if it were all of them.

## Criticality Decides Where the Effort Goes

**A programme that monitors everything monitors nothing well.** Coverage costs acquisition hardware, route time, analysis time, and — most scarcely — attention.

Criticality assessment combines the consequence of failure (safety, environment, production loss, repair cost, lead time on spares) with the likelihood and with the mitigations already in place. **Redundancy and spares availability belong in the assessment**, because a duplicated pump with a spare on the shelf has a very different failure consequence from a single-line machine with a six-month lead time, even if the machines are identical.

The output is a tiered coverage decision:

- **Continuous, permanently instrumented monitoring** for the small number of assets whose failure is unacceptable or whose P-F interval is short.
- **Periodic route-based monitoring** for the larger population where the interval permits it.
- **Process-data monitoring** — using measurements the plant already has — for anything whose degradation shows up as efficiency, temperature rise, throughput loss or increased energy consumption.
- **No condition monitoring** for assets where run-to-failure or time-based maintenance is the correct answer, recorded as a decision rather than an omission.

**The third tier is the most underused resource in most plants.** The data that would reveal a fouling exchanger, a wearing pump, a blocked filter or a degrading compressor is usually already being collected by the control system and stored in a historian. It is not analysed because nobody owns the question.

## What Each Technique Detects, and What It Cannot

| Technique | Detects well | Blind to | Character of lead time |
| --- | --- | --- | --- |
| **Vibration** | Imbalance, misalignment, looseness, bearing and gear degradation, resonance | Faults with no mechanical signature; slow thermal or chemical degradation | Long for rolling-element bearing wear; short for some abrupt mechanisms |
| **Temperature and thermography** | Degraded electrical connections, cooling loss, friction, blockage | Internal conditions with no surface signature; anything at low load | Variable; often short once visible |
| **Motor current analysis** | Rotor and some stator conditions, load-side mechanical problems seen through the machine, supply conditions | Faults that do not modulate the current | Moderate; non-intrusive acquisition |
| **Lubricant analysis** | Wear metals identifying which component is wearing, contamination, additive depletion, water ingress | Sudden mechanical events; anything outside the lubricated system | Often the longest of all |
| **Ultrasound** | Pressure and vacuum leaks, early bearing distress, electrical discharge | Bulk mechanical conditions | Early, but requires disciplined acquisition |
| **Process data** | Fouling, restriction, efficiency loss, capacity decline, increased energy per unit | Localised mechanical faults with no process effect | Usually long; data usually already available |

**Two structural points follow from this table.**

**A programme built on one technique has the failure coverage of that technique.** Vibration monitoring is excellent and it will not detect a degrading electrical termination, a contaminated lubricant, or a fouling heat exchanger. Coverage is a design decision, and stating which failure modes are *not* covered is as important as stating which are.

**Thermography deserves a specific caution because it is so widely misapplied.** A thermal survey detects a difference in temperature, which depends on load. **A survey conducted during low production finds far less than the same survey at full load**, and a clean report from a quiet Sunday morning is close to worthless. The load at the time of survey is part of the result.

## Data Quality and Context

Everything downstream depends on this section, and it is where most programmes quietly fail.

**Comparability is the whole game.** A trend is a comparison across time, and a comparison is only valid if the conditions were the same. **A measurement taken at a different point, with a different mounting method, at a different speed, or at a different load is not comparable with its predecessor** — and treating it as if it were produces both false alarms and missed detections.

The specific disciplines:

- **Fixed acquisition points**, marked physically, so the same location is used every time.
- **A fixed mounting method** — the accelerometer article makes the point that mounting sets the usable frequency range, so a trend that switches from stud to magnet is two trends spliced together.
- **Defined operating conditions for acquisition**: a stated speed, load and process state, recorded with the reading.
- **Correct and synchronised timestamps**, without which no correlation with events, process changes or other measurements is possible.
- **An adequate sampling rate and honest storage.** A historian configured with aggressive compression or a wide deadband discards exactly the small early changes a predictive programme exists to see. **Compression settings are a data-quality decision made by whoever configured the historian, usually without knowing what the data would be used for.**

**And the item most often missing: operating context.** Load, speed, product grade, ambient temperature, running hours and recent maintenance history are what allow a change in a signal to be attributed to the equipment rather than to operation. **Without context, most anomalies are indistinguishable from a production change**, and a programme without context spends its credibility budget on alerts explained by "we changed product last Tuesday".

**Master data is a data-quality problem too.** Measurements attached to the wrong asset, duplicated tags, machines swapped without updating the register, and points renamed during a system migration all corrupt trends invisibly. A programme's most confusing data problems are frequently asset-register problems.

## Baselines, Trends and Thresholds

**A baseline is a deliberate measurement of a known-good state under defined conditions.** It is not "the first reading we happened to take", which may be a measurement of an already-degraded machine — and a machine baselined while degraded will never trigger, because its degradation is now its normal.

Establish baselines after commissioning, after overhaul, and after any change that alters the machine or its installation, and record the operating conditions with them.

**Trend beats absolute value, and rate of change beats both.** A machine sitting steadily at a moderate level is usually less interesting than one rising steadily from a low level, and the rate of rise is what converts a detection into a lead time estimate.

**Published severity classifications are population statistics.** Vibration severity zones, for example, classify machines by type and mounting and describe what is typical for that population. They are a useful sanity check and a poor substitute for the machine's own history. **A machine can be within the published zone and clearly degrading relative to itself.**

**Threshold setting is a business decision wearing technical clothing.** Every threshold trades false positives against missed detections, and where that trade should sit depends on the consequence of the failure and the cost of an unnecessary intervention:

| Threshold approach | Strength | Weakness |
| --- | --- | --- |
| **Fixed level** | Transparent, auditable, easy to explain | Wrong for atypical machines; ignores the machine's own history |
| **Statistical, derived from history** | Adapts to the individual machine | Learns whatever state existed during the learning period, including degradation |
| **Adaptive / continuously relearning** | Tracks legitimate operational change | Can slowly relearn a developing fault as normal |
| **Rate-of-change** | Detects developing conditions early regardless of level | Sensitive to noise and to operational transients |

**Anomaly detection detects difference, not fault.** An anomaly says that the current behaviour is unlike the learned behaviour. It does not say what changed, whether it matters, or whether the cause is the equipment at all. **In a real plant, most anomalies are operational**, and converting an anomaly into a fault diagnosis requires engineering knowledge of the machine and its context. That step is not optional and it is not automatable by the detector that raised the anomaly.

## From Detection to Decision: The Workflow That Actually Fails

This is where programmes die, and the failure is organisational rather than technical.

**The full chain:** detection → validation → diagnosis → work identification → planning → parts → scheduling → execution → verification → **feedback**.

**The points at which it breaks:**

- **The alert has no owner.** It appears on a dashboard that is nobody's job, and it stays there.
- **There is no validation step.** Alerts pass straight to work orders, so operational changes become inspections, and the credibility budget drains.
- **There is no route into the work management system.** The condition-monitoring tool and the maintenance system do not talk, so a detection becomes an email, and an email becomes nothing.
- **The work order carries no evidence.** The technician receives "check bearing" without the trend, the diagnosis or the expected finding, and cannot confirm or refute anything.
- **The finding is never fed back.** The work is done, the machine is fixed, and nobody records whether the diagnosis was right. **This is the single most damaging omission**, because it is the only mechanism by which thresholds, models and technique selection improve. A programme without feedback has the accuracy it had on its first day, permanently.

**On the interface with the maintenance system**, two directions are needed and most integrations implement one. Condition data should be able to raise a work request *with its evidence attached*. And the completed work order's findings — what was found, what was replaced, what the actual condition was — should return to the condition record so the detection can be scored. **An integration that only pushes alerts into the CMMS automates the easy half.**

**And the lead-time arithmetic that decides whether any of this is worth doing:**

```text
required_lead_time = validation + diagnosis + planning + parts + scheduling window

usable = ( P-F interval  >  required_lead_time )   AND
         ( monitoring interval  <  P-F interval, with margin )

Notes and limits:
  - P-F interval is a property of the failure mode and the detection technique
    together; the same failure has a different P-F interval when detected by
    oil analysis than by vibration
  - required_lead_time is a property of the ORGANISATION, and it is the part
    most often left unmeasured
  - if the inequality fails, adding sensors does not fix it; either detect
    earlier with a different technique, or change the maintenance strategy
  - parts lead time frequently dominates and is the cheapest term to reduce
```

## The Credibility Budget

**Every programme has a finite stock of belief, and false positives spend it.**

A **false positive** — an alert whose investigation finds nothing — costs the inspection, the disruption, and a measure of trust. A **false negative** — a failure the programme did not detect — costs the failure itself, plus the much more damaging conclusion that the programme does not work.

**They are traded against each other by the threshold**, and the correct trade differs by criticality. A machine whose failure stops the plant justifies a sensitive threshold and the false positives that come with it. A machine with a standby and a spare on the shelf does not.

**The asymmetry that quietly destroys programmes is this: false positives are visible, immediate and attributed to the programme; false negatives are invisible until the failure and are attributed to bad luck.** The organisational pressure therefore runs in one direction only, thresholds are raised after each unproductive inspection, and the programme drifts toward silence. Nobody decides to stop detecting; it happens one threshold adjustment at a time.

**The countermeasures are unglamorous and effective:**

- **Human validation before action.** An engineer reviewing an alert against operating context removes most operational-change false positives in minutes and at very low cost. This is the highest-return step in the whole workflow.
- **Track and publish both error types.** A programme that does not know its own hit rate cannot be managed or defended, and cannot justify its thresholds.
- **Review thresholds against the record**, deliberately and periodically, rather than adjusting them reactively after each embarrassment.
- **Report what the programme prevented**, in the plant's own terms — avoided downtime, avoided secondary damage, converted breakdowns into planned work. A programme that cannot describe its value in those terms will eventually be cut regardless of its technical quality.

## Governance and Lifecycle

- **Ownership.** The programme needs an owner, each alert needs an owner, and the arrangement must survive people leaving. Programmes frequently depend entirely on one enthusiast and end when that person moves.
- **Competence.** Technology without the capability to interpret it produces data nobody converts into decisions. Building or buying the analysis capability is part of the programme, not an afterthought.
- **Configuration management of the monitoring itself.** A changed threshold, a moved sensor, a re-scaled channel, a new mounting method — each of these invalidates comparability, and each must be recorded **as an event on the trend** so that a step change in the data can be attributed correctly. Otherwise a maintenance action on the monitoring system becomes an apparent fault on the machine.
- **The history is the asset.** Years of trend data are the programme's accumulated value, and they are routinely lost in system migrations, tag renaming and platform changes. Data retention and migration are a governance obligation, not an IT detail.
- **Periodic review of the criticality assessment.** Assets change criticality as processes, redundancy and production plans change, and a coverage decision made five years ago may now be pointed at the wrong machines.

## Failure Modes

**Strategy chosen per asset rather than per failure mode.** Some modes are monitored, others are silently uncovered, and nobody knows which.

**Predictive presented as a replacement for preventive.** Statutory, random-failure and low-cost-intervention work is quietly dropped.

**P-F interval never estimated.** Monitoring at an interval that cannot see the development.

**Organisational response time never measured.** Detection achieved, action impossible.

**Everything instrumented.** Attention spread until nothing is analysed properly.

**Process data ignored.** The cheapest coverage in the plant, already collected, never examined.

**Thermographic survey conducted at low load.** A clean report that means nothing.

**Acquisition point, mounting or operating condition varied between readings.** Two trends spliced together and read as one.

**Baseline taken from an already-degraded machine.** Its degradation becomes its normal, permanently.

**Historian compression discarding early small changes.** The programme's entire signal removed by a configuration setting.

**Operating context not recorded with the measurement.** Every anomaly indistinguishable from a production change.

**Measurements attached to the wrong asset.** Confusing data caused by the asset register.

**Published severity zones used as the only threshold.** Population statistics substituted for the machine's own history.

**Adaptive thresholds relearning a developing fault as normal.** The detector adapts to the failure.

**Anomaly treated as diagnosis.** Difference reported as fault, and the engineering step skipped.

**Alerts with no owner.** A dashboard nobody is accountable for.

**No route from detection into the work management system.** A detection becomes an email.

**Work order raised without the evidence.** The technician cannot confirm or refute the diagnosis.

**Findings never fed back.** The programme's accuracy frozen at day one.

**Thresholds raised reactively after each unproductive inspection.** Drift toward silence, one adjustment at a time.

**Hit rate never measured.** A programme that cannot be defended when budgets are reviewed.

**Trend history lost in a system migration.** Years of accumulated value destroyed by a project that did not know what it was carrying.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

A site has run a route-based vibration programme for six years. In that time it has not demonstrably prevented a single failure, several significant machine failures have occurred with no prior alert, and the programme is now under review for cancellation. The measurement hardware is sound and the analyst is competent.

```text
Symptom:
A six-year vibration monitoring programme with no demonstrable prevented
failures and several undetected machine failures, despite sound hardware and
a competent analyst.

Evidence:
- route readings have been taken by several different technicians over the
  years, with no photographic record of measurement points
- some machines have permanent studs, others are measured with a magnet, and
  a few points have changed method partway through the history
- no operating condition is recorded with the readings; machines are measured
  at whatever load they happen to be running
- three of the failed machines are variable-speed and were measured at
  different speeds on different visits
- the baseline for two machines was established after they had already been
  in service for several years
- alarm thresholds were raised twice, in both cases following an inspection
  that found nothing
- the historian holding the trend data applies a deadband that suppresses
  small changes
- one genuine early detection exists in the record: an alert was raised, an
  email was sent, and no work order was ever created — the machine failed
  eleven weeks later
- no record exists of any completed work order's findings being compared with
  the diagnosis that prompted it
- the site's average time from work request to scheduled execution is longer
  than the P-F interval assumed by the monitoring interval for several of the
  covered failure modes

Reasoning:
The programme has four independent defects and none of them is the technology.

The data was never comparable. Different technicians, different mounting
methods, unrecorded and varying load and speed, and a deadband suppressing
small changes together mean that a trend on this site is not a measurement of
machine condition over time — it is a mixture of machine condition,
acquisition method and operating point. Two of the baselines describe already
degraded machines, so those machines could not trigger against themselves.

The workflow had no route to action. The one detection the programme
genuinely achieved died between an email and a work order, which is the most
informative single fact in the record: the detection capability existed and
the organisation could not convert it.

The thresholds were managed reactively. Both increases followed unproductive
inspections, which is the asymmetry that pushes every unmanaged programme
toward silence.

And there is no feedback loop at all, so none of these defects could have been
discovered by the programme itself. Six years of operation produced no learning
because nothing was ever scored.

Next investigations:
- audit the acquisition standard: fix and photograph measurement points,
  standardise mounting, and define the operating condition required for a
  valid reading
- re-baseline every covered machine under defined conditions and record the
  conditions
- review the historian's compression and deadband settings against what the
  programme needs to see
- measure the organisation's actual detection-to-execution time and compare it
  against the P-F interval for each covered failure mode
- define an alert owner, a validation step and a route into the work
  management system that carries the evidence
- introduce outcome recording so every alert is eventually scored as
  confirmed, not confirmed, or not investigated
- re-examine coverage: identify which failure modes on critical assets are not
  addressed by vibration at all
```

**The transferable lesson is that this programme's technical detection worked and everything around it did not.** It found a real developing failure eleven weeks ahead — a genuinely useful lead time — and the organisation had no mechanism to act on it. Buying better sensors would have changed nothing. The remedies are an acquisition standard, a defined workflow with an owner, and outcome recording, none of which requires new hardware.

## Recommended Practice

- Select a maintenance strategy per failure mode, not per asset, and record which modes are covered and which are deliberately not.
- State explicitly that predictive work displaces part of the preventive programme rather than replacing it, and keep statutory, random-failure and low-cost interventions on their existing basis.
- Estimate the P-F interval for each monitored failure mode and set the monitoring interval comfortably shorter than it.
- **Measure the organisation's own response time** — validation, diagnosis, planning, parts, scheduling — and compare it with the P-F interval before committing to a technique.
- Drive coverage from a criticality assessment that includes redundancy and spares lead time, and review it periodically.
- Exploit existing process data as a coverage tier before buying new instrumentation.
- Match the technique to the failure modes, and state which modes remain uncovered.
- Survey thermally under representative load, and record the load with the result.
- Fix acquisition points physically, standardise the mounting method, and record the operating condition with every reading.
- Establish baselines deliberately on known-good machines after commissioning or overhaul, with conditions recorded.
- Check historian compression, deadband and aggregation against what the analysis actually needs.
- Record operating context alongside every measurement, because without it an anomaly cannot be attributed.
- Set thresholds as an explicit trade between false positives and missed detections, differentiated by criticality, and review them against the record rather than after each embarrassment.
- Treat an anomaly as a signal that something changed, and require an engineering diagnosis before it becomes work.
- Give every alert an owner and a validation step before it becomes a work order.
- Build a route into the work management system that carries the evidence with the request, and a return path that carries the findings back.
- Score every alert as confirmed, not confirmed or not investigated, and publish the hit rate.
- Record changes to the monitoring system as events on the trend, so configuration changes are never read as machine faults.
- Protect the trend history through migrations; it is the programme's accumulated value.
- Report the programme's results in plant terms — avoided downtime, avoided secondary damage, breakdowns converted to planned work.

## Conclusion

Condition monitoring is a mature and effective engineering discipline, and the reason so many programmes disappoint has almost nothing to do with the discipline. It has to do with strategy chosen at the wrong granularity, with data that was never comparable, with a lead time nobody measured against an organisational response time nobody measured either, and above all with the absence of a path from a detection to a completed job with its findings recorded.

The technology is the cheap part. The programme is the part that requires an owner, an acquisition standard, an explicit threshold policy, a workflow with a route into work management, and a feedback loop that lets the programme learn what it got right. Build those and modest instrumentation delivers real value for decades. Skip them and the best sensors available will produce six years of trends that nobody could act on.
