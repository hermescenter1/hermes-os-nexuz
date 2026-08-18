# Industrial AI for Fault Diagnosis and Decision Support

## Executive Summary

Learned models are genuinely useful in industrial diagnosis, and the useful part is narrower and more specific than the promise usually implies. Three boundaries define the territory, and all three should be settled before any model is deployed.

**AI proposes; deterministic logic and people dispose.** Safety instrumented functions and protection systems are deterministic, independently verified and testable, and **no learned output actuates them**. This is not a statement about the current state of the technology that will change as models improve — it is a design principle, because a safety function must be provable in advance and a learned model's behaviour on an input it has never seen cannot be proved in advance.

**A model's confidence is a statement about the model, not about the world.** A model asked about a plant state unlike anything in its training data will usually produce an answer, and frequently a confident one. That is the characteristic failure of learned systems in industry, and it is invisible unless something outside the model checks whether the question is one the model is entitled to answer.

**The value is in the evidence, not in the verdict.** A system that reports "these five tags deviated together in this sequence, unlike the previous two hundred starts, and the closest historical match is this date" has produced something an engineer can act on and an investigator can audit. A system that reports "bearing failure, 87%" has produced something that can only be believed or disbelieved.

This article covers where learned models beat deterministic methods and where they do not, what industrial data does to models, why confidence and evidence sufficiency are different questions, what explainability has to deliver to be useful, the layered architecture that keeps safety deterministic, how to make human validation real rather than ceremonial, and the governance without which a model becomes an undocumented plant modification.

The maintenance programme that a diagnostic capability serves is the subject of the companion article on predictive maintenance; the underlying engineering reasoning — which applies whether or not any model is involved — is the subject of the companion article on evidence-based diagnostics.

## Where a Learned Model Helps, and Where It Does Not

| Task | Better approach | Reason |
| --- | --- | --- |
| Threshold exceedance, interlock, protection | **Deterministic** | Provable in advance, testable, auditable, does not drift |
| Relationships governed by known physics — mass balance, efficiency, expected pressure drop | **First-principles calculation** | Explainable, generalises outside the observed data, and its assumptions are inspectable |
| Detecting subtle multivariate deviation from normal operation | **Learned model** | The normal region is high-dimensional and correlated; no engineer can write it down |
| Classifying a fault into known categories from labelled history | **Learned model, if labels exist and are trustworthy** | Labels are the scarce resource, not the algorithm |
| Finding patterns across a large alarm and event corpus | **Learned model or statistical mining** | The volume defeats manual review, and the patterns are real |
| Retrieving relevant history, documentation and previous cases | **Learned retrieval** | Low risk: output is read by a human who judges relevance |
| Diagnosing a genuinely novel failure | **Neither** | Nothing learned from history covers a mechanism that has not occurred |

**The rule that follows: reach for a learned model when the relationship is real but not writable.** If a competent engineer can state the rule, state the rule — it will be more accurate, permanently auditable, and it will not need retraining when the plant changes. Learned models earn their place where the pattern exists in the data but cannot be expressed as a manageable set of conditions.

**And the last row is the honest limit.** A model built from history cannot recognise a failure mechanism that has never occurred, and the failures that hurt most are frequently the novel ones. An anomaly detector may notice that *something* is different — which is valuable — but it cannot say what, and it will be no better than an alert engineer looking at the same trend.

## What Industrial Data Does to Models

The difficulties here are not the ones familiar from consumer machine learning, and each of them has produced deployed systems that failed in a specific way.

**Labels are scarce and unreliable.** Failure events are rare in a well-run plant — that is the point of it — so the positive class is small. Worse, labels usually come from work orders, which are written for cost allocation and completion tracking rather than for training data. **The recorded date is typically the repair date, not the onset**, so a model trained on it learns to predict the maintenance schedule rather than the failure.

**Class imbalance makes accuracy a meaningless metric.** A model that predicts "normal" always will score extremely well on accuracy and detect nothing. The relevant measures are detection rate and false alarm rate at a chosen operating point, and they must be quoted together — either alone is uninformative.

**Non-stationarity is the norm, and it is mostly deliberate.** The plant changes: product grade, feedstock, throughput, ambient season, an overhaul, a control retune, a modified operating procedure. **A model trained on last year's plant has learned a configuration the site has since moved on from.** In consumer applications drift is usually gradual; in industry the largest drift events are engineering changes made on purpose by people who were not told a model depended on the old behaviour.

**Operating context is essential and usually absent.** Without load, rate, product and mode, a model learns spurious correlations and then reliably "detects" the next product changeover. This is the same requirement the condition-monitoring article makes for human analysis, and models are less able to compensate for its absence than people are.

**Sensor faults look exactly like process faults.** A model trained on a period containing an undetected drifting transmitter learns the drift as legitimate behaviour, and then flags the correctly calibrated replacement as an anomaly.

**Data preparation quietly changes the answer.** Timestamp misalignment between sources, historian compression and deadbands, and resampling choices all create or destroy correlations. **A correlation that appears only after resampling is a property of the resampling.**

**And leakage has an industrial-specific form.** The classic version is a feature that is downstream of the outcome; the industrial version is including a signal that only changes because maintenance had already been scheduled — a valve lined up for isolation, a standby started, a rate reduced by an operator who had noticed the problem. The model then achieves impressive results by learning that people knew.

## Confidence, Uncertainty and Evidence Sufficiency

These are three different things and the distinctions carry the safety argument.

**A confidence score is a model output.** Unless it has been explicitly calibrated against outcomes, it is not a probability of being correct — and calibration is itself estimated on the training distribution, so it degrades exactly when the input moves away from that distribution.

**Two kinds of uncertainty behave differently, and only one is well handled by default:**

- **Uncertainty because the data is noisy.** Irreducible for a given measurement set; more data does not remove it. Models generally represent this reasonably.
- **Uncertainty because the model has not seen this before.** This is the dangerous one, because a model extrapolating outside its training region is not merely uncertain — it is frequently confident and wrong, and nothing in its own output reveals the difference.

**The architectural response is an applicability check as a first-class component**, evaluated *before* the model's answer is used: does this input resemble the region the model was trained on? A model asked about a state it has never seen should answer "I do not know", and most models cannot — **so the "I do not know" must be built around them**, as an explicit out-of-distribution test with its own threshold and its own escalation path.

**Evidence sufficiency is a separate question again, and it is not about the model at all.** It asks whether enough independent, valid evidence exists to support any conclusion. If three of the five signals a diagnosis depends on are unavailable, in manual, or of doubtful validity, then no confidence number is meaningful, however the model was trained. **"Insufficient evidence" must be a first-class result** — a distinct output, not a low score, because a low score invites the reader to act on the second-most-likely option.

The three questions, in the order they should be asked:

```text
1. Is this input within the region the model can speak about?      (applicability)
2. Is there enough valid, independent evidence to conclude anything? (sufficiency)
3. What does the model conclude, and how confident is it?           (model output)

Notes and limits:
  - answering (3) without (1) is the characteristic failure of deployed
    industrial models: a confident answer about an unfamiliar state
  - (2) is a property of the plant and its instrumentation at this moment,
    not of the model; a healthy model on degraded data still cannot conclude
  - a "low confidence" output and an "insufficient evidence" output demand
    different responses, and collapsing them into one number removes the
    distinction the operator needs
```

## Explainability That Is Actually Usable

The purpose of explanation in an industrial setting is practical, not philosophical: **an engineer must be able to decide whether to act, and an investigator must be able to audit the decision afterwards.**

**What actually helps:**

- **Which signals contributed, and in what temporal order.** Sequence is diagnostic in a way that a static importance ranking is not.
- **What is different from normal, expressed in engineering units.** Not "anomaly score 4.2" but "discharge temperature is above the band this machine has occupied at this load for two years".
- **Which historical episodes this resembles**, with dates, so the engineer can read what happened then.
- **What would change the conclusion** — which is the question that turns an output into an investigation plan.

**And the caution that matters: an explanation is not a justification.** A model can produce a plausible-looking attribution for a wrong conclusion, and attribution methods have their own assumptions and failure modes. **The explanation has to be checkable against physics and process knowledge**, and the practical test is simple: **can a competent engineer confirm or refute the finding from the supplied evidence, without re-running the model?** If not, the system has produced a verdict wearing an explanation.

## Deterministic Constraints and Safe Decision Boundaries

This is the section that determines whether a deployment is safe, and it is architectural rather than algorithmic.

**Layer the system, and be explicit about which layer is which:**

| Layer | Character | Relationship to the AI layer |
| --- | --- | --- |
| **Safety instrumented functions, protection** | Deterministic, independently verified, testable, fail-safe | Completely independent; unaffected by, and unavailable to, the AI layer |
| **Basic process control and interlocks** | Deterministic, engineered, auditable | May be informed; not commanded without a deterministic gate |
| **Advisory and diagnostic layer** | Learned models, analytics, decision support | Consumes data, produces evidence and recommendations |

**The directionality rule:** information flows freely upward from control to the analytics layer; **commands do not flow downward without a deterministic gate, and anything consequential adds a human.**

**Engineering constraints act as hard filters on anything an AI layer proposes.** Rate limits, permissives, interlocks and operating envelopes reject an invalid recommendation without discussion. **A recommendation that violates a permissive is not a difficult judgement call; it is rejected by the permissive**, and the fact that it was generated at all is a finding about the model.

**The fail-safe boundary has a simple test.** If the AI layer becomes unavailable, slow, or wrong, the plant must continue to operate exactly as it would have done without it. **If losing the model degrades control, the model has become part of control** — and it must then satisfy control's requirements for determinism, testing, availability and change management, which most learned models cannot.

**Escalation is a designed behaviour, not a fallback.** When the applicability check fails, when evidence is insufficient, or when confidence is low in a consequential context, the correct output is an escalation to a human *with the evidence attached* — never a silent selection of the most likely option.

**And the advisory-to-autonomous spectrum should be traversed deliberately, one step at a time:**

- Advisory to an engineer, offline. Lowest assurance burden; the human has time and context.
- Advisory to an operator in real time, with a recommended action. Now the human is under time pressure, so evidence presentation becomes safety-relevant.
- Automatic action inside a bounded, reversible envelope with deterministic limits. Requires demonstrated performance, bounded consequences and a tested fallback.
- Safety functions. **No.**

## Human Validation That Is Not Theatre

**A human approving a recommendation they cannot evaluate is not a control; it is a transfer of liability.** Meaningful validation requires three things, and organisations routinely provide only the first: **the evidence**, **the time**, and **the standing to disagree without professional cost.**

**Automation bias is the specific mechanism that erodes this.** People accept recommendations from systems that are usually right, and the acceptance rate rises as the system's reputation improves — which means the human check weakens exactly as the system's remaining errors become rarer, stranger and more consequential. **A system that is right 95% of the time is checked; a system that is right 99.5% of the time is trusted, and its errors arrive unexamined.**

**The countermeasures are concrete:**

- **Present evidence, not verdicts.** A verdict invites acceptance; evidence invites judgement.
- **Make disagreement cheap and recorded**, with the reason captured. A recorded override is data; a silent one is nothing.
- **Audit accepted recommendations, not only rejected ones.** The failure mode is uncritical acceptance, and sampling only the rejections cannot detect it.
- **Measure the override rate and treat a rate near zero as a warning.** It is far more likely to indicate that the check has stopped functioning than that the model has become perfect.

## Model Governance and Lifecycle

**Reproducibility is the requirement everything else rests on.** If the system contributed to a decision that is later investigated, you must be able to reconstruct what it said and why. That means versioning the model, the training data, the feature definitions, the thresholds and the configuration together, and being able to state which version was live on a given date. **A system whose past outputs cannot be reconstructed cannot participate in an incident investigation** — and it will be involved in one eventually.

**Retraining is a change to a plant system.** It must go through change management, be recorded, and be validated against a held-out test set that was not used in training. **A model that retrains itself silently is an undocumented modification**, and the fact that it was intended by its designers does not make it documented.

**Monitor three things in production**, in increasing order of importance:

- **Input distribution drift** — is the plant still the plant the model was trained on?
- **Output distribution drift** — is the model's behaviour changing?
- **Outcome tracking against ground truth** — was it right? This is the only measure that matters, and it requires the feedback loop described in the predictive maintenance article: every alert eventually scored as confirmed, not confirmed, or not investigated.

**Benchmark against the simple approach, always and repeatedly.** A learned model that cannot be shown to outperform the threshold rule or the physics calculation it replaced should be withdrawn, and this comparison should be re-run periodically rather than once at procurement. Complexity that is not earning its keep is a liability with a maintenance cost.

**Plan for decommissioning.** Models degrade as the plant changes, product families are discontinued, and the person who understood the feature engineering moves on. A withdrawal plan is part of a deployment, not an admission of failure.

## Deployment Architecture

Keep it brief and decide it explicitly:

- **Where inference runs.** At the edge: low latency, works when the link is down, limited compute, harder to update. Centrally: easier to manage and update, dependent on connectivity, adds latency. The choice follows from what happens when the connection fails.
- **The data path and its failure modes.** What happens when a tag stops updating, when a timestamp is wrong, when the historian is behind? **A model fed stale data will produce confident answers about the past** — staleness detection belongs in the data path, not in the model.
- **A read-only boundary to control systems** by default, with any write path explicitly designed, gated and justified.
- **Security** follows the plant's OT security architecture and the segmentation described in the companion articles; an analytics platform is a new system with new connectivity, and it is subject to the same zone and conduit discipline as anything else.

## Failure Modes

**A learned model used where a rule could have been written.** Less accurate, less auditable, and now requires retraining.

**Labels taken from work order dates.** The model learns the maintenance schedule.

**Accuracy quoted as the performance metric on imbalanced data.** A model that detects nothing scores well.

**No operating context in the features.** Spurious correlations, and reliable detection of product changeovers.

**Trained on a period containing an undetected sensor fault.** The fault is learned as normal and the correct replacement is flagged.

**Leakage from signals that changed because people had already noticed.** Impressive results that do not survive deployment.

**Confidence treated as probability of correctness.** Calibration assumed, and degraded exactly when it matters.

**No applicability or out-of-distribution check.** Confident answers about states the model has never seen — the characteristic industrial failure.

**"Insufficient evidence" collapsed into a low confidence score.** The operator acts on the second-most-likely option.

**Verdicts presented instead of evidence.** Nothing can be verified, refuted or audited.

**Attribution accepted as justification.** A plausible explanation for a wrong conclusion.

**A recommendation path into control without a deterministic gate.** The safety argument is now the model's behaviour.

**Plant behaviour degraded when the model is unavailable.** The model has become part of control without meeting control's requirements.

**Silent selection of the most likely option under uncertainty.** The escalation that should have happened, did not.

**Human approval without evidence, time or standing to disagree.** A liability transfer presented as a control.

**Override rate near zero, read as success.** The check has stopped functioning.

**Model retrained without change management.** An undocumented modification to a plant system.

**Past outputs not reproducible.** The system cannot participate in the investigation it is implicated in.

**Never benchmarked against the deterministic alternative.** Complexity with no demonstrated benefit and a permanent maintenance cost.

**Stale data consumed without detection.** Confident answers about the past.

## A Representative Scenario

*The following is an illustrative engineering example and not a report of a specific project.*

An anomaly-detection system is deployed on a compressor train, trained on a year of historical operation. For eight months it performs well: a small number of alerts, most of which correspond to something an engineer agrees is unusual. Then the plant changes feedstock, and the system produces a sustained burst of alerts. The team raises the anomaly threshold to restore usable behaviour. Three months later the train suffers a significant failure that the system did not flag.

```text
Symptom:
An anomaly detector that performed well for eight months, produced a burst of
alerts after a feedstock change, was desensitised in response, and then failed
to flag a genuine failure three months later.

Evidence:
- the training data covers one year of operation on the previous feedstock
  only
- the model's inputs are process and vibration signals; feedstock grade,
  throughput and operating mode are not among its inputs
- there is no out-of-distribution or applicability check: the model produces
  an anomaly score for any input it is given
- during the alert burst the model's scores were high and its internal
  confidence was high
- the threshold was raised once, immediately after the burst, with no
  recorded analysis and no test against historical failures
- the model was retrained once during the eight months; no record identifies
  the training data, the version or the date, and the earlier version cannot
  be reconstructed
- at the time of the missed failure, the operating state was still outside
  the range represented in any available training data
- no outcome tracking exists: none of the earlier alerts was ever scored as
  confirmed or not confirmed
- the deterministic protection on the train operated correctly and limited
  the damage

Reasoning:
Three architectural omissions, one organisational reflex, and no learning
loop.

The model had no operating context in its inputs, so it learned the previous
feedstock's behaviour as the definition of normal. When the feedstock changed,
the plant moved to a legitimately different operating region, and every point
in that region was correctly identified as unlike the training data — which
the system could only express as "anomaly", because it had no vocabulary for
"unfamiliar". The burst of alerts was, in a narrow sense, the model working
exactly as built and being asked a question it was not equipped to answer.

The absence of an applicability check is what made this dangerous rather than
merely noisy. With such a check the system would have reported that the input
had left the region it can speak about, which is an accurate and actionable
statement. Without it, the only available output was a confident anomaly score,
and the only available remedy appeared to be desensitisation.

Raising the threshold then silenced the symptom without addressing the cause,
and it did so at exactly the moment the model's coverage of the new operating
region was weakest. The missed failure occurred while the input was still
outside anything the model had been trained on, so the model was never capable
of detecting it — and nobody knew that, because nothing in the architecture
reported the model's own coverage.

Finally, no outcome tracking existed. None of the eight months of alerts had
been scored, so there was no evidence base from which the threshold change
could have been evaluated, and no way to notice that the model's useful
performance had ended.

Next investigations:
- determine the operating regions represented in the training data and compare
  them with the regions the plant has actually occupied since deployment
- add operating context — feedstock, throughput, mode — as model inputs, and
  re-establish what "normal" means per context
- implement an applicability check that reports "outside trained region" as a
  distinct output with its own escalation, separate from "anomalous"
- reconstruct which model version was live at each point, and record the gap
  as a governance finding
- introduce outcome scoring for every alert and re-derive the threshold from
  evidence rather than from the desire for silence
- benchmark the model against the deterministic limits already present on the
  train, since those operated correctly throughout
```

**Three transferable lessons.** First, **a model that cannot say "I have not seen this before" will say something else instead**, and the something else will be confident. Second, **the threshold increase was the same organisational reflex that quietly kills condition-monitoring programmes** — it silenced an inconvenient output without evidence — but here it was applied to a system whose coverage had genuinely lapsed, which converted a manageable situation into a blind one. Third, **the deterministic protection did its job.** That layer was independent, testable and unaffected by everything above it, which is exactly why the boundary is drawn where it is.

## Recommended Practice

- Write the rule where the rule can be written; reserve learned models for relationships that are real but not expressible.
- Draw the layer boundary explicitly and record it: safety and protection are deterministic and independent, and no learned output actuates them.
- Allow information to flow upward from control freely, and never allow commands downward without a deterministic gate and, for consequential actions, a human.
- Apply engineering constraints — permissives, interlocks, rate limits, envelopes — as hard filters on anything the analytics layer proposes.
- Test the fail-safe boundary: confirm the plant operates identically when the model is unavailable, and treat any degradation as evidence that the model has become part of control.
- Include operating context in the model's inputs, and define "normal" per context rather than globally.
- Treat labels as the scarce resource: verify what the recorded dates actually mean, and never train on repair dates as if they were onset dates.
- Quote detection rate and false alarm rate together at a stated operating point; never quote accuracy on imbalanced data.
- Build an applicability or out-of-distribution check as a first-class component evaluated before the model's answer is used.
- Make "insufficient evidence" a distinct output with its own escalation, separate from low confidence.
- Present evidence in engineering units — which signals, in what order, differing from what, and what would change the conclusion — rather than scores and verdicts.
- Require that a competent engineer can confirm or refute a finding from the supplied evidence without re-running the model.
- Give human validation the evidence, the time and the professional standing to disagree, and record overrides with reasons.
- Audit accepted recommendations as well as rejected ones, and treat an override rate near zero as a warning.
- Version model, data, features, thresholds and configuration together, and be able to reconstruct any past output.
- Put retraining through change management, validate against held-out data, and record every version with its live dates.
- Monitor input drift, output drift and — above all — outcomes against ground truth, with every alert eventually scored.
- Detect stale data in the pipeline rather than relying on the model to notice.
- Benchmark against the deterministic alternative at deployment and periodically afterwards, and withdraw models that cannot demonstrate an advantage.
- Plan decommissioning as part of deployment.

## Conclusion

The engineering question is not whether learned models are useful in industrial diagnosis. They are, in a defined set of tasks where the pattern is real and cannot be written down, and they are being under-used for alarm-corpus analysis and history retrieval while being over-used for problems a threshold would solve.

The engineering question is what the system does when it is outside its competence — and that question is answered by architecture, not by model quality. A deployment that checks applicability before it answers, that reports insufficient evidence as a distinct result, that presents evidence a person can check, that escalates rather than guessing, that keeps every safety function deterministic and independent, and that can reconstruct what it said last March, is a system an engineer can work with for years.

A deployment without those properties produces confident answers indefinitely, including about states it knows nothing about, and its most dangerous period is the one immediately after everyone has learned to trust it.
