# Ladder Logic vs Structured Text: Choosing per Function

## Executive Summary

The ladder-versus-text argument is usually conducted as a matter of taste, generation or vendor allegiance. It is none of those. IEC 61131-3 defines several languages precisely because different classes of control logic have different needs, and the useful engineering question is not "which language is better" but "which language makes *this* function correct, and diagnosable by the people who will have to diagnose it".

That second clause decides more real cases than any argument about expressive power.

## Why This Matters

Two failure patterns come from getting this wrong, and they are mirror images.

**Algorithmic logic forced into ladder.** A calculation with conditional branches, iteration and intermediate results, expressed as forty rungs of contacts and move instructions. It works. It is unreadable, unreviewable, and every modification risks an error that no reviewer will catch because nobody can hold forty rungs of arithmetic in their head.

**Machine interlocking written entirely in text.** A conveyor's start conditions expressed as a boolean expression spanning several lines. It is compact and correct. At 3 a.m., a maintenance technician needs to know *which* condition is blocking the start, and a text expression evaluated online shows them a single FALSE.

Both defects are invisible at commissioning, when the author is present and remembers everything. Both surface later, at the worst time, in front of the person least equipped to deal with them.

## The Argument That Actually Decides Most Cases

Online diagnosability is the deciding property far more often than expressiveness.

Ladder's genuine engineering advantage is not that it "looks like a relay diagram". It is that **the online view shows the state of every element simultaneously**, laid out spatially. A technician looking at a rung sees which contact is open. That is the answer to "why did it not start", delivered without reading, without a debugger and without understanding the program.

Structured Text has no equivalent. Monitoring a boolean expression online typically shows the result, not the term that produced it. To find the blocking condition, the maintainer must either read and mentally evaluate the expression, or the programmer must have anticipated the need and written the intermediate terms to named variables.

That last point is the practical resolution, and it is worth stating as a rule: **if interlock logic is written in text, the individual conditions must be assigned to named, monitorable variables — not left as terms inside one expression.** Doing that recovers most of ladder's diagnostic advantage at a small cost in verbosity.

## Where Each Language Wins

| Logic class | Better language | Why |
| --- | --- | --- |
| Interlocks, permissives, trip conditions | Ladder | Online state visible per condition |
| Motor/valve start-stop with feedback | Ladder | Maintenance audience, simple boolean |
| Arithmetic, scaling, engineering units | Structured Text | Expressions are unreadable as rungs |
| Loops and iteration over arrays | Structured Text | Ladder has no natural iteration |
| Recipe and parameter handling | Structured Text | Structured data manipulation |
| State machines | Structured Text (`CASE`) | One construct expresses the whole machine |
| Communication and protocol handling | Structured Text | Byte and string manipulation |
| Analogue signal validation | Structured Text | Comparison chains and hysteresis |
| Timing and sequencing of physical steps | Either — decide by audience | Both work; maintenance skill decides |

The final row is the one that requires judgement rather than a rule. Which is why the next section matters.

## The Audience Is an Engineering Input

A design decision that ignores who will maintain the result is incomplete. Two plants with identical processes can correctly reach opposite conclusions:

- A plant whose maintenance staff are electricians who diagnose from the ladder online view, with no software background, should have its equipment-level logic in ladder. Writing it in text is technically defensible and operationally wrong: it moves every fault diagnosis from the technician to a controls engineer who may be off-site.
- A plant with a controls group that owns the software, uses version control and reviews changes can use text more widely and will get better structure for it.

This is not a compromise on quality. It is the recognition that a program's quality includes whether the people responsible for it can work with it.

## Where Text Is Not Optional

Some logic simply cannot be written well in ladder, and forcing it there produces a defect rather than a stylistic complaint:

**Iteration.** Processing an array of forty analogue values requires either a loop or forty copies. Ladder gives you the forty copies, and one of them will eventually be wrong.

**Non-trivial arithmetic.** A multi-term calculation with intermediate results becomes a chain of move-and-operate instructions in which the actual formula is no longer visible. Nobody can review that against a specification.

**Structured data.** Manipulating a recipe structure, a communication buffer or a string is expressible in text and painful in ladder.

**State machines.** A `CASE` statement over an enumerated state shows the entire machine in one place — every state, every transition. The equivalent ladder distributes the machine across many rungs, and completeness becomes impossible to verify by inspection.

## Mixed-Language Projects: The Conventions That Matter

Most serious projects use both. Three conventions keep that from becoming worse than either alone.

**Choose per function, not per programmer.** The rule must be written down and applied uniformly, otherwise language becomes a signature of who happened to write the block, and the project acquires two dialects for the same kind of logic.

**Keep the boundary at the block interface.** A block is written in one language. Mixing at a finer granularity makes the code harder to follow than either language would be alone, and complicates online monitoring.

**Name the intermediate conditions in text.** As above: this is what makes text-based interlocking diagnosable, and it is the single convention that most reduces the operational cost of using text.

There is also a portability consideration worth being honest about: while IEC 61131-3 defines the languages, the practical portability of Structured Text between vendor platforms is limited by dialect differences and vendor-specific extensions. A block that must move between platforms is written conservatively regardless of language.

## Failure Modes

**Unreadable arithmetic in ladder.** The formula is no longer recoverable from the code, so nobody can confirm it matches the design. Errors persist because review cannot detect them.

**Undiagnosable interlocks in text.** Maintenance cannot determine which condition is blocking, so fault-finding escalates to engineering every time — a permanent operational cost created by a one-time decision.

**Copy-paste iteration.** Forty near-identical rungs where a loop belonged. The failure is that the fortieth differs from the others in a way nobody notices.

**Language chosen by author habit.** Similar logic exists in both languages across the project, so a maintainer must be fluent in both to work on anything.

**Text used to be clever.** Compact expressions that were elegant when written and opaque a year later. Density is not a virtue in software that a stranger must debug under pressure.

## A Worked Comparison

*The following is an illustrative engineering example.*

Consider a pump start with five conditions: local selector in AUTO, no overload trip, suction valve open, discharge pressure below the high limit, and no external stop request.

**In ladder**, this is one rung with five series contacts. Online, a technician sees immediately which contact is open. The diagnosis takes seconds and requires no software knowledge.

**In text as a single expression**, this is one line. Online, the maintainer sees `Start_Permitted = FALSE` and learns nothing about why.

**In text with named intermediates**, each condition is assigned to a named variable and the result combines them. Online, the maintainer sees five monitorable booleans and can identify the blocking condition — recovering ladder's diagnostic property.

The third form is more verbose than the second. That verbosity is not waste; it is the diagnostic interface, and it is exactly what the second form omitted.

## Commissioning Considerations

- **Interlock logic gets exercised hardest during commissioning**, when conditions are frequently not satisfied. Whichever language is used, the blocking condition must be identifiable from the online view — verify this early rather than discovering it during a night shift.
- **Force and simulate behaviour differs by language and platform.** Confirm how forcing behaves before relying on it, and make sure forced or simulated values are visible so none survives into production.
- **Review algorithmic text against the specification, not against its own comments.** A comment describes intent; only the expression describes behaviour.

## Safety Considerations

Safety-related logic is engineered under the functional-safety standards applicable to the plant, in the safety system, and the language available is typically constrained by the certified toolchain rather than chosen freely. Where the toolchain restricts the language subset — and it usually does — those restrictions are part of the safety case and are not a matter of preference.

The general principle that carries over: for safety-related logic, verifiability by inspection is worth more than expressiveness. That argues for the simplest construct that can express the function, in whichever language the certified environment provides.

## Recommended Practice

- Choose language per function against a written rule, not per programmer.
- Use ladder for interlocks, permissives and equipment-level boolean logic where maintenance staff diagnose from the online view.
- Use text for arithmetic, iteration, structured data, communication handling and state machines.
- When writing interlocks in text, assign every condition to a named, monitorable variable.
- Keep the language boundary at the block interface.
- Treat the maintenance audience as a design input, and record the assumption.
- Write conservatively in any block intended to move between platforms.

## Conclusion

The languages of IEC 61131-3 are not competitors; they are tools with different properties, and the standard defines several because industrial control genuinely needs several.

The engineering judgement is narrower than the usual argument suggests. Ladder is the better choice where a technician must see live signal state and act on it. Text is the better choice where the logic is an algorithm rather than a set of conditions. And where text is used for conditions anyway, naming the intermediates restores the diagnosability that ladder would have given for free — which is a small price for keeping the plant's fault-finding in the hands of the people standing next to it.
