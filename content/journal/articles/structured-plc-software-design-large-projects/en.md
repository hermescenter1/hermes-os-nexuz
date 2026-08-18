# Structured PLC Software Design for Large Projects

## Executive Summary

Large control programs rarely fail because a network was written badly. They fail because nobody decided what the program's structure was, so it acquired one by accretion — and the resulting structure has no rule about where a given piece of logic belongs, no rule about who may write to an output, and no boundary that a change can be confined to.

This article is about the small set of structural decisions that determine whether an application remains modifiable after the engineers who wrote it have moved on.

## Why This Matters

The symptom of unstructured control software is specific and recognisable: a change that should be local is not. Adding an interlock to one machine requires reading four unrelated blocks to find out what else writes to the same output. Commissioning a new line means re-testing an existing one because they share a data block nobody documented. A fault in one area cannot be reasoned about without understanding the whole program.

None of that is a coding-skill problem. Every individual routine may be clear. The defect is architectural, and it is introduced early — usually in the first week of a project, by someone solving an immediate problem without a rule to follow.

## Layering by Responsibility

The most useful structure separates the program by *what a layer is responsible for*, not by which machine it belongs to. Four layers cover most industrial applications:

```text
Coordination / sequencing
    orchestrates equipment to make product
        |
Equipment control
    one module per physical asset: motor, valve, drive
        |
Safety and interlock evaluation
    conditions that restrict what equipment may do
        |
I/O abstraction
    raw signals mapped to named, scaled, validated values
```

The rule that gives the layering its value: **a layer may call downward and read upward, but it may not write upward.** Sequencing tells equipment what to do; equipment does not reach into the sequence and change it. When this rule is broken — a device block that sets a step number because it was convenient — the sequence's behaviour is no longer determined by the sequence, and reasoning about it requires reading everything.

### The I/O abstraction layer earns its place immediately

Raw signals should be converted once, into named engineering values with validity, and nothing else should touch the raw address. That single layer delivers three things at once:

- a hardware change becomes a change in one place
- signal validity — station status, wire-break, range — is evaluated once and consistently
- simulation becomes possible, because the layer below the abstraction can be substituted

The third point is what makes serious testing possible before the plant exists.

## One Owner Per Output

This is the single most valuable rule in industrial software, and the one most often violated.

**Every physical output is written by exactly one block.** That block is the output's owner. Anything else that wants the output to change requests it, through the owner's interface.

The failure it prevents is the one that costs the most commissioning time: two pieces of logic writing the same output in the same scan. The last writer wins, the behaviour depends on execution order, and the symptom is a device that "flickers" or "ignores" a command under conditions nobody can reproduce. Because both writers are individually correct, code review does not find it — only the ownership rule does, and it finds it at design time.

The rule has a corollary worth stating explicitly: **an equipment module owns its own outputs, and no sequence writes them directly.** A sequence sets a request; the equipment module decides, considering its own interlocks and mode, whether to act on it.

## Equipment Modules

An equipment module is the software object for one physical asset. It has an interface, internal state, and no dependence on which sequence happens to be using it.

A workable interface shape:

| Interface element | Purpose |
| --- | --- |
| Command request | What the caller wants (start, stop, open, close) |
| Mode | Auto, manual, maintenance, out of service |
| Permissive input | Conditions that must hold to act |
| Interlock input | Conditions that force a safe state |
| Status output | Running, stopped, transitioning, faulted |
| Fault detail | Enough to distinguish causes, not a single bit |
| Ready output | Whether the caller can rely on it right now |

Two properties matter more than the field list.

**The module owns its timing.** Start feedback supervision, command pulse duration, retry logic and the fault condition for "commanded but never confirmed" belong inside the module. If each caller implements its own supervision, the plant has as many definitions of "failed to start" as it has sequences.

**The module is instantiable.** Forty motors should be forty instances of one module, not forty copies of similar code. The distinction is not aesthetic: with instances, a defect is fixed once; with copies, it is fixed thirty-nine times, or more realistically, fixed in the copies somebody remembered.

## State Machines Instead of Accumulated Conditions

Sequential behaviour written as a growing set of independent conditions becomes unanalysable. The same behaviour written as an explicit state machine stays analysable regardless of size, because at any moment the equipment is in exactly one defined state and the legal transitions out of it are enumerated.

A minimal, honest state set for most equipment:

```text
OUT_OF_SERVICE  -> IDLE            (returned to service)
IDLE            -> STARTING        (command accepted)
STARTING        -> RUNNING         (feedback confirmed)
STARTING        -> FAULTED         (feedback timeout)
RUNNING         -> STOPPING        (command, or interlock)
RUNNING         -> FAULTED         (feedback lost, trip)
STOPPING        -> IDLE            (confirmed stopped)
FAULTED         -> IDLE            (fault cleared AND reset)
```

Three details in that diagram do real work.

**`STARTING` is a state, not an instant.** It is where feedback supervision lives, and having it explicitly is what makes "commanded but never started" a diagnosable condition rather than an invisible one.

**Leaving `FAULTED` requires two things** — the condition gone *and* a deliberate reset. Automatic recovery on condition-clear means a plant can restart itself after a fault that nobody investigated.

**`OUT_OF_SERVICE` is modelled explicitly.** Equipment isolated for maintenance is not "stopped"; it must not respond to an automatic start, and a sequence needs to know the difference so it can report why it cannot proceed.

## Mode Handling

Mode is where structure most often degrades, because modes accumulate: auto, manual, semi-auto, maintenance, simulation, commissioning. Each is added for a real reason and rarely removed.

Three rules keep it tractable:

- **Mode is owned by the equipment module**, and there is exactly one mode variable per asset. Two places tracking mode independently is a guaranteed inconsistency.
- **The transition rules are explicit**, especially the dangerous ones. What happens to a running motor when its module goes from auto to manual? Continue, or stop? Both are defensible; only one can be correct for a given plant, and it must be decided rather than inherited from whatever the code happened to do.
- **Simulation mode is a first-class design decision or it is absent.** Retrofitting "pretend the feedback is true" into a program that was not designed for it produces exactly the failure where simulation is accidentally left enabled in production.

## Naming and Structural Conventions

Naming is not cosmetic in a program that will be read by strangers under time pressure. A workable convention encodes area, equipment and function so that a name found in a fault message is enough to locate the logic:

```text
Area_Equipment_Function
CDU_P101_StartCmd
CDU_P101_RunFbk
CDU_P101_Fault
```

The property that matters: someone reading an alarm at 3 a.m. can find the owning block from the tag alone, without a cross-reference tool and without knowing the project.

## Version Control and Library Management

Two practices separate maintainable projects from unmaintainable ones, and neither is exotic:

**Reusable modules live in a versioned library**, with a defined version per project. When a defect is found in a motor block, the fix goes into the library, and each project decides when to take the new version. Without this, "the standard motor block" is a fiction — there are as many variants as there are projects.

**The project is under real version control**, with meaningful commit granularity. The specific value during commissioning is being able to answer "what changed between the run that worked and the run that did not" — a question that is otherwise unanswerable and that consumes entire shifts.

## Failure Modes

**Two writers on one output.** Behaviour depends on execution order and appears intermittent. Prevented entirely by the ownership rule; nearly impossible to find afterwards.

**Shared state with no owner.** A data block written by several areas becomes a coupling nobody documented, discovered when a change in one area breaks another.

**Copy-paste equipment logic.** A defect found in one instance exists in the other thirty-nine, and no mechanism guarantees they all get fixed.

**Implicit mode.** Mode inferred from a combination of conditions rather than stored explicitly produces states nobody designed — for example, equipment that is neither auto nor manual after a specific fault sequence.

**Sequence logic inside equipment blocks.** A device block that knows which product is being made cannot be reused, and the coupling only becomes visible when someone tries.

## Commissioning Considerations

Structure pays for itself during commissioning more than at any other time:

- **Equipment modules can be commissioned individually**, in manual mode, before any sequence exists. This is the single largest schedule benefit of the architecture.
- **The I/O abstraction layer allows loop checking against named values** rather than raw addresses, which is both faster and less error-prone.
- **Explicit states make partial commissioning safe** — equipment left `OUT_OF_SERVICE` is unambiguously excluded rather than merely "not started yet".

Record the measured cycle time and CPU load at handover. Without that baseline, no future question about performance regression can be answered.

## Safety Considerations

Safety functions are engineered under the functional-safety standards applicable to the plant and are not part of the application-layering discussion: a safety function's integrity is a property of its whole chain, and it belongs in the safety system with the independence its risk reduction was credited on.

The structural point that does belong here is the distinction between an interlock that is part of a safety function and an operational interlock that protects equipment or product. Both restrict what the plant may do; only one is credited as risk reduction. Conflating them in the application — so that nobody can tell which conditions are safety-credited — is a documentation failure with real consequences during a safety review. Keep them visibly separate.

## Recommended Practice

- Layer by responsibility, and enforce "call down, read up, never write up".
- Give every physical output exactly one owning block.
- Build equipment modules with explicit interfaces, and instantiate rather than copy.
- Model sequential behaviour as explicit state machines, including `STARTING` and `OUT_OF_SERVICE`.
- Require a deliberate reset to leave a faulted state.
- Keep one mode variable per asset and define the transition behaviour explicitly.
- Abstract I/O once, with validity evaluated in the abstraction.
- Version reusable modules in a library; pin the version per project.
- Name so that a tag in an alarm locates its owning logic.

## Conclusion

The structure of a control program is decided in its first week and lived with for a decade. The decisions that matter are few and cheap at the start: what the layers are, who owns each output, what an equipment module's interface looks like, and how states and modes are represented.

Programs that made those decisions explicitly can absorb a new line, a replaced drive or an added interlock as local changes. Programs that did not will absorb the same work as a project-wide risk — and the difference has almost nothing to do with how well any individual routine was written.
