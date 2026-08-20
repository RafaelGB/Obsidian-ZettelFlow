# Knowledge patterns

A template describes a note's **structure** — its fields and body. A **Knowledge Pattern** adds
**behavior**: an ordered list of actions that run when a note is created from it. *Structure + behavior.*

The shipped **Permanent Note** pattern isn't just Claim / Evidence / Connections / Questions fields —
on creation it runs **find related · find contradictions · suggest links · calculate maturity** against
your existing graph, writing each result into the note's frontmatter. (See *A note on timing* below for
what a brand-new note receives on its very first pass.)

## How it works

A step's `zettelFlowSettings` gains one optional, additive key:

```yaml
zettelFlowSettings:
  root: true
  label: Permanent note
  actions:            # the interactive wizard steps (unchanged)
    - type: prompt
      ...
  onCreation:         # NEW (#170): headless actions run on note creation, in order
    - type: find-related
      hasUI: false
      key: related
      zone: frontmatter
      limit: 10
    - type: find-contradiction
      hasUI: false
      key: contradictions
      zone: frontmatter
    - type: suggest-link
      hasUI: false
      key: suggestedLinks
      zone: frontmatter
      limit: 5
    - type: calculate-maturity
      hasUI: false
      key: maturity
      zone: frontmatter
```

When the note is built, after its structure is assembled and **before** the file is written, the
note-builder runs each `onCreation` action in order through the standard `execute()` pipeline, so
their results land in the note's frontmatter. Each action is best-effort: a failure is logged and
never aborts the build or the remaining actions. The `onCreation` list is collected from every walked
step, so a multi-step flow composes its behavior.

## Backward compatibility

`onCreation` is **optional and additive**, exactly like `phase` (#149), `trigger` (#150) and `wait`
(#151). A legacy template with no `onCreation` key parses and behaves **exactly as before** — a plain
static template. The step-builder preserves the field opaquely (there is no visual editor yet), so an
unrelated edit never drops it.

## Scope

This ships **on-creation** behavior only. General "on-event" triggers (run behavior on later edits,
state changes, etc.) are a deliberate follow-up; launching a whole *flow* on a vault event is already
the `trigger` field (#150).

## A note on timing

On-creation actions run **before** the new note's own file exists, so the graph-based actions rank it
against the **already-indexed** vault, and the new note is not yet a node in that graph. On that first
pass a *brand-new* note's result properties (`related`, `contradictions`, `maturity`, …) are often
empty — the note is not yet in the graph.

To close that gap, ZettelFlow **re-runs the pattern once, automatically, after the note is indexed**
(#200). The re-run:

- fires **exactly once** per note creation, only when the note becomes indexed with its links
  resolved — it waits up to **~5 seconds** and then **gives up silently** (a debug log line, no
  notice) if indexing is slow;
- is a strict **one-shot from the create path** — it is never wired to later edits, and a per-note
  guard means its own frontmatter write cannot re-trigger it (one create ⇒ at most one re-run);
- writes **only the pattern's own declared keys** back into the note; every other frontmatter key you
  or another action set is preserved untouched;
- is **offline** — it reads only the local knowledge index, makes no network call, and adds no new
  capability.

It is **on by default**. To disable it — for example if you object to a second automatic write to a
just-created note — turn off *Settings → ZettelFlow → Knowledge patterns → Re-run a pattern after the
note is indexed*; behaviour is then identical to the build-time-only pass.

## Try it

Install the starter flows (Settings → ZettelFlow → Zettelkasten toolkit → *Starter flows*), then build
a note from the **Permanent note** flow: its frontmatter will carry the pattern's result properties
(`related`, `contradictions`, `suggestedLinks`, `maturity`), computed against your existing graph.
