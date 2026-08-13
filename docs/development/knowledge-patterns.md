# Knowledge patterns

A template describes a note's **structure** — its fields and body. A **Knowledge Pattern** adds
**behavior**: an ordered list of actions that run when a note is created from it. *Structure + behavior.*

The shipped **Permanent Note** pattern isn't just Claim / Evidence / Connections / Questions fields —
on creation it runs **find related · find contradictions · suggest links · calculate maturity**, so a
new permanent note lands already connected, cross-checked and scored.

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
against the **already-indexed** vault (they no-op gracefully if the index isn't ready). That is the
intended "land already connected" behavior — the new note is not yet in the index for its own pass.

## Try it

Install the starter flows (Settings → ZettelFlow → Zettelkasten toolkit → *Starter flows*), then build
a note from the **Permanent note** flow: its frontmatter will carry `related`, `contradictions`,
`suggestedLinks` and `maturity`, filled from your existing graph.
