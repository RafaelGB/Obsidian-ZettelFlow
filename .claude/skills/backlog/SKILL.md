---
name: backlog
description: Augmented coding, step 1 — turn an idea into a backlog of small user stories (one GitHub issue each, one line, a vertical slice of working value), suggesting the minimum and splitting any story that does two things. Use when the user brings a new idea, an epic, "what should we build", "make a backlog", "break this into stories", or wants to plan work before refining a story.
---

# /backlog — a list of small stories, cheap to write and cheap to throw away

Step 1 of [augmented coding](../../../docs/development/augmented-coding.md). A backlog is **not a
plan**: it is a reorderable list of one-line stories. Writing one costs nothing and deleting one
costs nothing — what costs is technical detail written up front, and that waits until the story is
picked up (`story`). This is what keeps the method out of waterfall.

## Ask before you list

Ask a few short questions to remove ambiguity — who uses it, what they do, what is explicitly
*not* wanted (sync, multi-language, teams… whatever would change the architecture). Each question
comes with a **suggested answer aimed at the minimum**: it is always cheaper to add a story later
than to keep deleting the extras you proposed.

## Each story is a vertical slice

```
As a <kind of user>, I want <one thing> so that <the benefit>.
```

- **One thing.** A story with *and* in its want is two stories — split it before showing the list.
- **Working value on its own.** The slice crosses every layer it needs (model → engine → view →
  docs) and a person can *use* it when it lands. Never a "model only" or "settings only" story: the
  [§XIII](../../../docs/development/constitution.md) form ships with its field, and a capability
  ships with its door ([capability doors](../../../docs/development/capability-doors.md)).
- **The benefit is the test of need.** If you cannot write the *so that*, the story is not needed
  yet — say so.
- **Small.** Buildable and reviewable in one sitting of pair programming. If it is not, split it.

## Where it lives

GitHub Issues — one issue per story, title in the story's words, body is the one line plus, if
useful, a sentence of context. Label `story`. A bigger direction is an umbrella issue (label `epic`)
whose body lists its stories in priority order as a task list; reorder or strike them freely.

Show the list first and wait for the user's verdict (accept / split / drop / reorder); create the
issues only when they say so. Then `story <#N>` on the first one.

## Not here

No acceptance criteria, no test list, no design, no files — that is `story`, and only for the story
about to be built.
