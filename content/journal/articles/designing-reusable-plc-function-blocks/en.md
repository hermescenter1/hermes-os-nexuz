# Designing Reusable Function Blocks That Survive Reuse

## Executive Summary

Most blocks described as reusable are not. They are the first project's block with parameters added each time a second project needed something slightly different. The result accumulates inputs nobody can explain, behaviour that depends on which combination of them is set, and a growing reluctance to touch it — which is the opposite of reuse.

A genuinely reusable block is defined by its interface contract: what it guarantees, what it requires, and what it will never do. This article is about writing that contract deliberately.

## Why This Matters

The economics are the whole argument. A motor block instantiated four hundred times across a plant is four hundred opportunities for a single defect and one opportunity to fix it. The same logic copied four hundred times is four hundred independent defects, of which some subset will be fixed and nobody will know which.

But the economics only hold if the block is actually instantiable. A block that requires the caller to know its internals, or that behaves differently depending on undocumented input combinations, has the maintenance cost of copied code and the debugging difficulty of shared code — the worst of both.

## The Interface Contract

A block's interface is a promise. Writing it down changes what gets built.

**What the caller must provide.** Which inputs are mandatory, what their valid ranges are, and what happens when they are outside those ranges. A block that silently does something reasonable with an invalid input is harder to debug than one that reports the problem.

**What the block guarantees.** Under what conditions the outputs are meaningful. This is the most commonly omitted part of the contract, and it is why `Ready` matters.

**What the block will never do.** Usually: it will never write outside its own instance data and its declared outputs. A block that reaches into a global data area has broken the contract even if it works, because the caller can no longer reason about it in isolation.

### Every block needs a Ready output

`Ready` — or `Valid`, or whatever the project calls it — answers "can the caller rely on my outputs right now?" It is FALSE during initialisation, after a fault, and whenever the block cannot compute a meaningful result.

Without it, the caller cannot distinguish "the value is 0.0 because the process is at zero" from "the value is 0.0 because I have not calculated anything yet". Those are completely different situations and a single output cannot express both. The absence of `Ready` is the most common interface defect in industrial libraries, and it produces exactly the class of fault where a sequence acts on a default value during startup.

### Fault detail, not a fault bit

A single `Fault` boolean tells the caller that something is wrong and nothing else. A maintenance technician standing in front of the equipment needs to know *what* is wrong, and the block is the only thing that knows.

The workable pattern is a `Fault` boolean for logic to act on, plus a fault code or bit field for humans and diagnostics. The codes must be defined and documented — a code whose meaning lives only in the head of the author is not diagnostics.

## Instance State

A function block has memory, and this is exactly what makes it the right construct for equipment. Three properties of that memory need deliberate decisions.

**Instance data belongs to the instance.** The block never stores per-instance state in a global. This sounds obvious and is violated constantly, usually by a timer or a counter that "only one instance will ever need" — until a second instance exists.

**Initialisation is defined.** What is the state of the instance on first execution, and after a warm restart? A block whose behaviour on restart is whatever the retained memory happened to contain is not deterministic, and the resulting fault appears once every few months when the plant is restarted after a power event.

**Retentivity is a decision, not a default.** Most instance data should not survive a power cycle: a running-state variable that persists across a restart will believe equipment is running that is not. The small subset that genuinely must persist — accumulated hours, batch counters — should be explicitly declared and justified.

## Restart and Initialisation Behaviour

Restart behaviour is the property most often left undefined and most likely to produce a dangerous surprise.

Three questions a block's contract must answer:

1. **On first execution, what state does the block adopt?** The safe answer is almost always a defined idle state with `Ready` FALSE until inputs have been evaluated at least once.
2. **After a warm restart, does the block resume or reinitialise?** Both can be right; only one can be correct for a given block, and the choice must be recorded.
3. **Does the block ever command an output on the first scan?** It should not. Commanding on the first scan means the plant's behaviour on restart depends on execution order and on whatever the inputs happened to be at that instant.

The failure this prevents is severe: a block that resumes a `RUNNING` state from retained memory after a power failure, and therefore does not re-verify that the equipment is actually running before allowing a sequence to proceed.

## Composition and Layering

Reusable blocks compose, and the composition rules matter as much as the individual blocks.

**A block calls downward only.** A valve block may call a generic digital-output block. It may not call the sequence that uses it. Upward calls create a cycle, and a cyclic dependency means neither block can be understood, tested or reused independently.

**Generic layers stay generic.** The moment a "generic motor block" contains logic that mentions a specific product, line or plant, it has stopped being generic. The usual pressure is a one-off requirement from one project; the correct response is an input on the interface, not a special case inside the block.

**The interface is narrower than the implementation.** A block should expose the minimum its callers need. Every additional exposed element is something a future version must keep compatible.

## Parameterisation Without Parameter Sprawl

The commonest degradation path is a block that grows an input for every variation encountered. After several projects it has thirty inputs, most of which are usually left at defaults, and the combinations are untested.

Three techniques keep this under control:

| Technique | Use when | Effect |
| --- | --- | --- |
| Structured parameter input | Many related settings | One input carrying a typed structure |
| Sensible defaults | Most callers want the same value | Callers only set what differs |
| Separate block variant | Behaviour differs fundamentally | Two clear blocks beat one with a mode switch |

The third row is the judgement call and the one most often avoided. A block with a mode input that changes its fundamental behaviour is two blocks wearing one name; splitting it makes both testable, and the caller's choice becomes visible in the code rather than buried in a parameter.

## Testability

A block that cannot be tested independently will not be trusted, and untrusted blocks get copied and modified rather than reused.

Two properties make a block testable:

**All inputs come through the interface.** A block that reads a global — a plant-wide enable, a shared mode word — cannot be tested without constructing that global state. Pass it in.

**Behaviour is a function of inputs and instance state only.** No dependence on scan order relative to other blocks, and no dependence on being called from a particular place.

Given those two properties, a block can be exercised on a test bench, or against a simulated I/O layer, before the plant exists. The value of this shows up during commissioning, when the difference between "we tested the block" and "we will find out on site" is measured in shifts.

## Versioning

A library without versions is not a library; it is a folder.

**Every block carries a version.** Not a comment — a value the project can read, so the running program can report which version of a block it contains. During a fault investigation, the first useful question is often "which version is this plant running", and it must be answerable without opening the project.

**Compatibility rules are explicit.** Adding an optional input with a safe default is compatible. Changing the meaning of an existing input, changing the units of an output, or altering restart behaviour is not — those require a new major version, and the projects using the old one must decide when to move.

**Projects pin a version.** A plant does not silently acquire a new block because someone updated the library. It takes the new version deliberately, with testing.

Without these, "we fixed it in the standard block" is a statement about a file on someone's laptop, not about the plants that have the defect.

## Failure Modes

**Missing `Ready`.** The caller acts on an output that has not yet been computed. Appears at startup, intermittently, and is often misdiagnosed as a field problem.

**State in a global.** Works with one instance, fails silently with two, because both instances share the timer or counter.

**Resumed run state after restart.** The block believes equipment is running that is not, and a sequence proceeds on that belief.

**Parameter sprawl.** Thirty inputs and untested combinations. Nobody can say what the block does without reading it, so nobody reuses it.

**Silent input clamping.** An out-of-range input is quietly limited rather than reported. The block behaves plausibly and the configuration error is never found.

**Version drift.** Four projects have four variants of "the standard block", and a fix applied to one never reaches the others.

## A Worked Example

*The following is an illustrative engineering example.*

Consider a generic valve block used for both on/off and modulating valves. Under pressure from a project needing modulation, an input `Mode` is added: 0 for on/off, 1 for modulating.

The block now has two behaviours, two sets of relevant inputs, two sets of meaningful outputs and two fault definitions. Every caller must know which mode it is in to interpret the outputs. Testing must cover both modes and their transitions. And the on/off callers — the large majority — now depend on a block containing modulation logic they never use.

The alternative is two blocks with a shared internal core for command supervision. Each has a narrow interface, each is independently testable, and the caller's intent is visible in which block it instantiated. The apparent duplication is smaller than it looks, because the genuinely shared part is factored out — and the diagnostic clarity is significantly better.

## Commissioning Considerations

- **Instantiate and test one instance before rolling out four hundred.** A defect found on instance one is a correction; found on instance four hundred it is a campaign.
- **Verify restart behaviour deliberately.** Power-cycle the controller with equipment in various states and confirm each block adopts the state its contract promises. This is rarely tested and is where the dangerous defects live.
- **Confirm fault codes are distinguishable in the field**, not just in the code. A technician should be able to read the code and know what it means without a lookup table that exists only in the design office.

## Safety Considerations

Blocks used in safety-related functions come from certified libraries and are engineered under the functional-safety standards applicable to the plant. They are not general-purpose blocks with extra care applied, and a standard block must never be pressed into a safety function because it "does the same thing".

The relevant discipline for standard blocks: where a block's outputs are consumed by anything credited as protection, the block's fault and `Ready` behaviour become part of what the protection depends on, and any change to them is a change to that dependency.

## Recommended Practice

- Write the interface contract before the implementation.
- Give every block a `Ready` output and fault detail beyond a single bit.
- Keep all instance state inside the instance; never in a global.
- Define first-execution and restart behaviour explicitly, and never command an output on the first scan.
- Pass everything through the interface so the block is testable in isolation.
- Prefer a second block over a mode input that changes fundamental behaviour.
- Version every block, make the version readable at runtime, and pin versions per project.
- Test one instance thoroughly before instantiating many.

## Conclusion

Reuse is not achieved by putting a block in a library folder. It is achieved by the block having a contract narrow enough to be understood, complete enough to be relied on, and stable enough that a second project does not need to modify it.

The properties that deliver that are unglamorous — a `Ready` output, state that belongs to the instance, defined restart behaviour, a readable version, and the discipline to split a block rather than add a mode. Each is cheap when the block is written and expensive to retrofit across four hundred instances.
