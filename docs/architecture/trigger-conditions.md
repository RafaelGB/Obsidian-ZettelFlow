# Trigger conditions

A [visual workflow](conditional-edges.md) / [event-driven](event-driven-workflows.md) step can carry a
**condition** — the *IF* of *WHEN an event happens, IF a condition holds, run an ACTION*. A condition is
a small `zf` script evaluated against the event; **leave it blank to mean "always."** A condition that
throws or is invalid is caught and the trigger is safely skipped — it can never break your vault.

This page is the reference the in-app help draws from (epic #246, B1). The pure vocabulary, examples and
sanity check live in `src/architecture/plugin/events/conditionHelp.ts`.

## Build one without writing code

You never have to hand-write the script. The condition editor (open it from a canvas *IF* edge) ships a
**guided builder** — pick a **field**, an **operator**, and a **value**, press *Insert into editor*, and a
valid expression appears in the code box. A non-programmer can compose a correct condition end-to-end; an
incomplete or nonsensical clause (a missing value, a non-numeric value for a numeric operator) is caught
with a plain message instead of emitting broken code. The composer is the pure, unit-tested
`buildConditionExpression` in `src/architecture/plugin/events/conditionBuilder.ts`, so the string it emits
is exactly what the runtime evaluator runs.

The operators offered: *equals*, *does not equal*, *contains*, *starts with*, *ends with*, *greater than*,
*less than*, *is empty*, *is not empty*. String values are safely quoted (no expression injection); the
ordering operators require a number.

## What you can reference

The event being tested is available as `event`:

| Field | Holds |
|---|---|
| `event.event` | the event token, e.g. `property.changed`, `tag.added`, `note.created` |
| `event.notePath` | the vault-relative path of the affected note |
| `event.property` | the frontmatter property that changed (`property.changed` only) |
| `event.tag` | the tag that was added (`tag.added` only) |
| `event.oldValue` / `event.newValue` | the property's before/after values (`property.changed` only) |

## Examples

```js
// Always — leave the condition blank.

event.tag === 'idea'                                   // only when a note is tagged #idea
event.property === 'status' && event.newValue === 'done'   // when a property becomes "done"
event.notePath.startsWith('Projects/')                 // only inside the Projects folder
!event.oldValue && !!event.newValue                    // when a property first gets a value
```

## Two mistakes the sanity check catches

- **Unbalanced brackets** — a missing `)` / `]` / `}`.
- **A single `=`** where you meant `===` — `event.property = 'status'` *assigns*; use `event.property === 'status'` to *compare*.

Everything is offline and deterministic; a condition only reads the event payload.
