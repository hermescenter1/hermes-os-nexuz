# SCADA Historian Architecture and Industrial Time-Series Data

## Executive Summary

A historian is not a relational database that happens to store timestamps. It is a system optimised for one shape of question — *what was this value doing between these two times* — across a very large number of signals, for years, with acquisition that must not stop when the consumer does.

The decisions that determine whether it can answer that question are made at configuration time: how a value is deemed worth recording, whose clock the timestamp came from, and what happens to data during the minutes when the archive is unreachable. All three are set long before anyone asks the question the archive exists to answer.

## What a Historian Is, and What It Is Not

Four systems are routinely conflated, and the consequences of picking the wrong one are structural rather than cosmetic:

| System | Optimised for | Characteristic question | Poor fit for |
| --- | --- | --- | --- |
| Historian | Dense time-series over long horizons | "What did TI-401 do last Tuesday?" | Transactions, relational joins |
| Transactional database | Consistent multi-row writes | "Which work order covers this asset?" | Millions of samples per tag |
| Event / message store | Discrete ordered records | "What sequence of events occurred?" | Continuous analogue trends |
| Analytics platform | Modelling across large datasets | "Which variables predict this failure?" | Being the system of record |

The two errors this table prevents:

**Using a transactional database as a historian.** It works at pilot scale and degrades as sample count grows, because row-per-sample storage and general-purpose indexing are not what the workload needs.

**Treating the analytics platform as the archive.** Analytics stores are frequently rebuilt, re-modelled and migrated. If the authoritative record lives there, plant history has been made dependent on a system whose lifecycle is driven by data-science tooling rather than by plant record-keeping obligations.

**Events belong with the trend but are not the same thing.** A trend answers "what was the pressure"; an event record answers "when did the valve command change and who issued it". Reconstructing an incident needs both, correlated on a shared timebase, which is the strongest practical argument for a single time-source hierarchy.

## Collection Strategy

The most consequential configuration decision is when a sample is worth recording at all.

**Periodic sampling** records at a fixed interval regardless of change. It is predictable in storage and simple to reason about, and it is wasteful on stable signals and blind to fast changes between samples.

**Exception (deadband) collection** records only when a value moves more than a configured amount from the last recorded value. Quiet signals cost almost nothing; active signals record at their natural rate.

Deadband is where archives are quietly ruined. Set too tight, the archive fills with noise and storage growth becomes unmanageable. Set too loose, **real process behaviour is discarded and cannot be recovered** — the data was never written.

The engineering rule that avoids both: **deadband should be derived from the measurement's own noise band and the smallest change that would matter to an engineer**, not chosen as a round percentage applied to every tag. A pressure whose sensor noise is ±0.02 bar and whose smallest meaningful excursion is 0.1 bar has a defensible deadband. A default 1% applied plant-wide is a guess that will be wrong in both directions on different tags.

A related caution: **a deadband large enough to suppress a transient makes that transient invisible forever.** If an archive is expected to support trip investigations, the tags involved in trips deserve tighter deadbands than the general population — or periodic collection at a rate matched to the process.

## Timestamp Fidelity

The timestamp is the part of a sample most often wrong in a way nobody notices.

Three places a timestamp can be applied, in descending order of fidelity:

1. **At the device**, when the measurement was taken. Highest fidelity; requires device support and a disciplined time hierarchy.
2. **At the collector**, when the value was polled. Carries the poll time, not the event time — an error equal to the poll interval.
3. **At the historian**, on write. Carries the storage time, including any queueing and network delay. This is the worst option and, unfortunately, sometimes the default.

The practical consequence: **an archive whose timestamps come from write time cannot support sequence-of-events reasoning**, because the ordering it records is the ordering of arrival rather than of occurrence. During a plant upset — exactly when ordering matters — arrival ordering is most distorted, because that is when queueing is heaviest.

Two supporting decisions:

- **Store UTC and render local.** Local-time storage creates one ambiguous hour and one missing hour per year at DST boundaries, and an archive spanning years will contain both.
- **Preserve the source timestamp rather than overwriting it.** If a value arrives late through store-and-forward, it must be filed at the time it happened, not the time it arrived.

## Store-and-Forward

Store-and-forward is the mechanism that decides whether a historian outage becomes a permanent data gap.

The collector buffers locally when the historian is unreachable and forwards on recovery, filing each sample at its original timestamp. With it, a two-hour archive outage produces a two-hour delay. Without it, it produces a two-hour hole.

The engineering parameter is **buffer depth**, and it should be derived rather than defaulted: the longest realistic outage — including a planned server maintenance window or a weekend failure with Monday response — multiplied by the collection rate. A buffer sized for minutes will overflow during the first genuine incident.

The failure this prevents is the cruellest one in historian operation: **the data needed to explain an event is missing precisely for the duration of the event**, because whatever disturbed the plant also disturbed collection.

## Compression and Retention

Two mechanisms reduce stored volume, and they differ in reversibility:

**Lossless storage compression** reduces bytes without discarding samples. Always acceptable.

**Lossy archival reduction** — swinging-door style algorithms that keep only the samples needed to reconstruct the signal within a tolerance — discards data permanently. It is often the right choice, but it is a decision about what future questions can be answered, and it should be made as one.

Retention is a tiered decision, not a single number:

| Tier | Typical horizon | Fidelity | Serves |
| --- | --- | --- | --- |
| Online / hot | Recent operating period | Full collected resolution | Operations, troubleshooting |
| Nearline | Medium term | Full or lightly reduced | Engineering analysis, trending |
| Archive | Long term | Reduced or aggregated | Compliance, long-horizon analysis |

Two constraints must be reconciled explicitly rather than by default: what the plant's regulatory and contractual obligations require to be retained, and what engineering investigations realistically need. Where they disagree, the longer requirement governs — and where a lossy reduction is applied before the regulatory horizon, that is a compliance decision, not a storage optimisation.

## Data Quality

A historian that stores only values discards the information needed to interpret them. A stored sample should carry its quality, and consumers should respect it.

The distinction that matters most: **a gap and a flat line are different facts.** A period where collection failed is unknown data; a period where the value genuinely did not change is known data. If both are stored as "no samples", an analyst three years later cannot tell whether the process was stable or the collector was down — and will usually assume the former.

The same applies to aggregation. An average computed over a window containing a collection gap is an average of the samples that exist, presented as though it described the whole window. Aggregates should carry a completeness indication, or the gap should be visible in whatever consumes them.

## OT/IT Integration

The integration pattern that holds up is replication into a DMZ, not direct enterprise access to the OT-resident historian:

```text
Enterprise / IT
      |
  Firewall
      |
Industrial DMZ -- historian replica, reporting, analytics feed
      |
  OT firewall     (one-directional replication)
      |
OT zone -- primary historian, collectors, SCADA
      |
PLC / RTU / field devices
```

Three reasons this is worth the additional component:

- **Availability isolation.** A business reporting query cannot affect plant-side collection.
- **Lifecycle independence.** Analytics tooling changes far more often than process control systems, and it can do so without a control-network change conversation.
- **Zone integrity.** The OT zone has no inbound business traffic — the practical expression of IEC 62443's zone-and-conduit thinking.

For the interface itself, OPC UA and OPC Historical Access are the common standards-based routes, with the same caveat that applies anywhere: publish a deliberate, documented subset rather than exposing the internal tag structure, or internal naming becomes an external contract.

The ISA-95 layering is the useful mental model for what belongs where — the historian sits at the boundary where plant-floor data becomes something the business consumes, and that boundary deserves an explicit interface rather than a shared credential.

## Failure Modes

**Deadband too loose.** Real process behaviour was never recorded. Discovered during an investigation, and unrecoverable — the samples do not exist.

**Deadband too tight.** Storage grows faster than planned; retention gets cut to compensate; long-horizon analysis becomes impossible for reasons unrelated to its value.

**Write-time timestamps.** Sequence-of-events reasoning silently invalid, and most distorted during the upsets where it is needed.

**No store-and-forward, or a buffer sized by default.** Gap exactly where the event was.

**Gap indistinguishable from flat line.** An analyst concludes the process was stable when the collector was down.

**Historian used as the transactional system.** Work orders, batch records or configuration stored in a time-series engine, which is neither its access pattern nor its consistency model.

**Analytics platform treated as the record.** Plant history rebuilt or lost during a tooling migration.

## A Representative Scenario

*The following is an illustrative engineering example.*

A pumping station investigates a recurring overload trip on a transfer pump. The archive is consulted and shows motor current as a nearly flat line at each occurrence, with no visible excursion.

Two configuration facts explain it. Motor current was collected on a 5% deadband — chosen as a plant-wide default — and the trip is caused by a short current spike well below that threshold in relative terms but well above the mechanical limit in absolute terms. Second, the trip event itself is in the event log with a device timestamp, but the current samples carry collector poll times, so the two cannot be aligned closely enough to see which preceded which.

Nothing is wrong with the historian. Both defects are configuration decisions made years earlier, and neither is repairable retrospectively: the samples were never written, and the timestamps cannot be improved after the fact.

The remedy is forward-looking — tighten the deadband on trip-relevant tags, move to device timestamping where supported — and the general lesson is the uncomfortable one: **an archive's value is determined by decisions taken before anyone knew what would be asked of it.**

## Recommended Practice

- Choose the storage technology to match the question shape; do not use a transactional database as a historian or an analytics store as the record.
- Derive deadband per tag from measurement noise and the smallest meaningful change; never apply one percentage plant-wide.
- Tighten collection on tags involved in trips and protective actions.
- Timestamp at the device where supported; never rely on write-time stamping.
- Store UTC; preserve source timestamps through store-and-forward.
- Size the collector buffer from the longest realistic outage, not a default.
- Store quality with the value, and keep gaps distinguishable from steady values.
- Define tiered retention against both regulatory obligation and engineering need.
- Replicate to a DMZ for enterprise consumers; publish a deliberate interface, not the internal tag structure.

## Conclusion

Historians fail quietly. They do not crash during the incident you need them for; they simply turn out never to have recorded the thing you now want, or to have recorded it with a timestamp that cannot be aligned to anything else.

That makes historian engineering unusual: almost all of its value is decided at configuration, and almost none of the resulting defects are repairable later. The decisions worth spending time on are therefore the boring ones — per-tag deadband, timestamp source, buffer depth and retention tiers — because those are the ones that determine whether the archive can answer a question nobody has asked yet.
