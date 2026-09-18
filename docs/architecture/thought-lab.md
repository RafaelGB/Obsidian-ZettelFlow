# The Thought Lab

Every object ZettelFlow has presupposes the thinking already happened.

A note wants a title and acquires a lifecycle state. A typed relation is a judgement you already
made. A claim has a source. An inquiry starts from a concern you can already state. Even Cultivate
asks *what shall we do with this idea* — which assumes you have one.

There was nothing, anywhere in the product, for **"I don't know what I'm thinking yet."**

And that is the state a thought is in when it matters most: absurd, contradictory, intuitive,
speculative, half-wrong on purpose. The old answer was *write a note* — and a note immediately
asks for a title, becomes an orphan, shows up in Health and adds to your debt. The system asked
you to be finished before you had started.

```
impulse → thought → idea → knowledge
```

The Lab is the first arrow.

## A thought asks for nothing

| A note | A thought |
|---|---|
| a title | — |
| a lifecycle state | — |
| structure | — |
| to be right | — |
| becomes an orphan | never |
| counts toward debt | never |
| appears in Health | never |

What it carries: **when** it was written, **what** it says, and optionally that it *forked from*
another thought or *challenges* one. Three words is a thought. A contradiction is a thought. So is
something you wrote deliberately wrong to see what it looked like.

## Not knowledge, by construction

This is the part worth understanding, because it is the whole safety of the idea.

The Lab folder goes into **`scopeExcludedPaths`** — the same array that already carries
ZettelFlow's own flow, hook and library folders (#311). That one place decides what is not
knowledge, and everything downstream reads from it: the `KnowledgeIndex`, Health, debt, Discovery,
orphans, resurfacing, Cultivate's queue, every projection.

No second mechanism. No flag a future change could forget to check. A thought is invisible to the
system for exactly the same reason a flow canvas is.

The guardrail (`test/architecture/knowledge/thoughtScope.test.ts`) does **not** check the setting.
It builds a real model over a vault whose Lab is full and demands zero — because the
`useSettingsHost` load-order trap (#374) once made `excludedPaths` silently return `[]`, turning
every exclusion into a no-op while the settings object looked perfectly correct.

## Your files, in your vault

Thoughts are markdown files in a folder you choose. Not `data.json`: **data you cannot open with
your own tools is not yours**, and the promise of this layer is that what you write here remains
yours even though the system ignores it. Open them, search them, sync them, grep them.

The text is the **body**, so what Obsidian shows is what you typed:

```markdown
---
zfThought:
  id: a1b2c3d4
  at: 1758153600000
  links: [e5f6g7h8]
  challenges: e5f6g7h8
---

maybe the problem isn't that AI thinks worse than us
```

A file in that folder with no `zfThought` at all is **still a thought** — just text. Someone will
write a note there by hand, and that is allowed. A refuge that rejects what you put in it is not
one.

Writes go through `FileService` like every other write (#456), so a thought lands in the
[write record](reversibility.md) and can be taken back.

## The folder

Settings → **Thinking** → *Thought Lab folder*. Default `_ZettelFlow/lab`. Point it at an empty
folder: anything already in there becomes invisible to the knowledge model.

## What is not here yet

The surface you write in, the four moves, crystallizing a thought into a note, setting one aside,
and thinking before you look are separate changes in [epic #465](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/465).
This page describes the object and the guarantee underneath them.

## Capability disclosure

| Capability | Used |
|---|---|
| File system — write | Notes inside the Lab folder you choose |
| Network | No |
| Clipboard | No |
| Script execution | No |
| AI | No |
