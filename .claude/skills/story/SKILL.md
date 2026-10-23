---
name: story
description: Augmented coding, step 2 — refine ONE backlog story just before building it into acceptance criteria (Given/When/Then), an ordered list of tests, out-of-scope and a How to verify script, written into the GitHub issue body. No technical design. Use when the user picks a story up ("story #N", "refine this issue", "let's work on the first story", "write the acceptance criteria"), or brings a bug to fix.
---

# /story — refine one story, right before it is built

Step 2 of [augmented coding](../../../docs/development/augmented-coding.md). Only the story you are
about to build gets detail — now is when you know the most about it. The refined story says **what
is wanted and how we will know**; it never says which file, pattern or abstraction (that emerges
while pairing, test by test).

## Steps

1. `gh issue view <N>` — read the story and its umbrella epic if any. Read the code it touches
   enough to ask good questions, not to design.
2. **Ask to remove ambiguity** — short questions, each with the answer you would assume. If the
   user said "go", assume them and list the assumptions in the story.
3. **Write the refined story into the issue body** (`gh issue edit <N> --body-file …`), with the
   sections below.
4. Stop for the verdict: accept / modify / reject. Then `pair <#N>` — ideally in a fresh session
   on a faster model (the thinking was done here; pairing wants short loops).

## The refined story (issue body)

```markdown
As a <user>, I want <one thing> so that <benefit>.

## Acceptance criteria
- **AC-1** Given … when … then …
- **AC-2** …

## Tests, in order
1. <behaviour, in words> — AC-1
2. …

## Out of scope
- …

## Assumptions
- …

## How to verify
<automated: command → ACs it proves · by hand: preconditions, numbered steps, empty state, negative>
```

- **Acceptance criteria** are observable, never "works well". Include the guardrail when one
  applies: `lint:obsidian` adds nothing, `es.ts` has every new `en.ts` key, `test:perf` holds.
- **Tests, in order** is the pairing script: one behaviour per line, simplest first, each pointing
  at the AC it proves. It is a list of *behaviours*, not of files — pairing may reorder, add or drop
  one as the code teaches us, and the list is updated when it does.
- **Out of scope** keeps the slice small. Anything the user deferred goes here (and, if it is real
  value, back into the backlog as its own story).
- **Motion and feel** — for a Reader/Library or any view change, add a short section with its own
  ACs: the motion/UX level never drops.
- **Capabilities** — if the story adds file-system, network, clipboard or script execution, say so
  ([§VII](../../../docs/development/constitution.md)).
- **How to verify** is the last section, always ([§XIV](../../../docs/development/constitution.md));
  rules and template in [`references/verification.md`](references/verification.md). Every AC has a
  prover.

## A bug is a story too

*As a <user>, I want <the right behaviour> so that <why it matters>.* Its first test is the
reproduction — it must fail before anything is fixed. A one-line bug may skip the issue and go
straight to `pair` with the reproduction as test 1.

## Not here

No plan comment, no task checklist, no file list, no architecture. If the story needs a design
decision to be refinable at all, it is too big — split it in the backlog.
