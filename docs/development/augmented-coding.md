# Augmented coding

ZettelFlow is built by **augmented coding** — Kent Beck's name for working with an AI as a pair
programmer, in small steps guided by tests — over a **backlog of small user stories**, each one a
**vertical slice** that works on its own. The AI writes the code; the developer decides what is
built, what is not, and when to refactor. The AI saves the typing, never the thinking.

It replaced the spec-driven pipeline (spec → plan → tasks → implement) this project used until
3.8. That pipeline planned everything up front, cut the work into layers, and left a long diff to
review at the end with nothing working until then — a quiet return to waterfall.

The rules every change honours are in the
[constitution](https://github.com/RafaelGB/Obsidian-ZettelFlow/blob/main/docs/development/constitution.md).
The harness skills live in [`.claude/`](https://github.com/RafaelGB/Obsidian-ZettelFlow/tree/main/.claude).

## The three steps

```
idea → backlog (one-line stories) → story (refine the next one) → pair (test by test) → merged slice
                 ↑                                                                        │
                 └──────────────── reorder, split, drop; pick the next ───────────────────┘
```

| Step | Skill | What you get | Where it lives |
|---|---|---|---|
| 1. Backlog | `backlog` | one-line stories: *As a … I want … so that …* | one GitHub issue per story (label `story`); an `epic` issue orders them |
| 2. Story | `story` | acceptance criteria, the tests in order, out of scope, How to verify — **no technical design** | the story's issue body |
| 3. Pair | `pair` | one test → red → green → review → commit, refactor when asked | a branch per story, one PR, squash-merged |

### 1. A backlog of vertical slices

A story is one line and does **one thing**. It is a **vertical slice**: it crosses every layer it
needs — model, engine, view, settings, docs — so the person who asked for it can *use* it the day it
merges. Never "the model first, the view later". A story is cheap to write and cheap to throw away;
the backlog is reordered, split and pruned freely. When suggesting stories, the assistant aims at
the minimum — adding later is cheaper than deleting.

### 2. Refine one story, just before building it

Only the story about to be built gets detail, because that is when we know most about it. The
refinement removes ambiguity with a few questions and writes the **acceptance criteria**
(Given/When/Then), the **tests in order** (behaviours, not files), what is **out of scope**, and the
**How to verify** script ([§XIV](constitution.md)). It never names files, patterns or abstractions:
the design emerges while pairing.

A bug is a story whose first test is its reproduction.

### 3. Pair: the AI drives, you navigate

| | Driver (the AI) | Navigator (you) |
|---|---|---|
| does | writes the next test, then the least code that passes it | reads every step, accepts / modifies / rejects |
| decides | nothing on its own: suggests the next step | what is built, what is not, when to refactor |

Each step is small enough to read in a minute. Every accepted step is **committed**, so if a later
step touches a test, the diff shows it. Refactors are separate steps, asked for by the navigator,
with the suite green before and after. *Run N* lets the driver chain several steps before stopping.

The navigator watches **three alarms** (Beck): the AI **looping** on the same failure, **adding**
what nobody asked for, and **cheating** the tests — editing, skipping or deleting one to get green.
The driver is told to stop and say so on each.

A practical split: refine the story on the strongest model, pair on a fast one — pairing wants short
loops.

## Done means shipped and seen

A story is done when its tests are green and committed **and** its docs are updated, its capability
is placed by [door rank](capability-doors.md), its How to verify has been walked in a real vault,
the Obsidian quality review is clean, and the PR has merged. One story, one PR, one commit on
`main`.

## Why it fits ZettelFlow

ZettelFlow's own principle is [cognitive agency](cognitive-agency.md): the tool removes mechanical
work and protects the thinking. Augmented coding is the same contract applied to building the tool —
the AI does the typing, every judgement stays with a person, and nothing reaches `main` that nobody
has read.
