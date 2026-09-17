# Conditional edges

ZettelFlow canvas edges support a simple boolean expression language that lets you control
which branches of a workflow are followed based on the context of the note being built.

## The step owns its exits (#427)

An arrow's label used to do three jobs at once: draw the transition, hold the condition, and
describe the option in the wizard. They conflict — a condition written on the label puts code on
the diagram, and the wizard printed that code at whoever was writing a note.

Since 3.3 the **source step owns its exits**. For each arrow leaving it, the step says:

| Question | Field |
|---|---|
| What does this option say? | `says` |
| When is it open? | `when` (the same expression language as below) |
| In what order does it appear? | `order` |
| Which one do you land on? | `default` |

Two doors, no YAML:

- **The step editor → "Where does it go next?"** — one row per arrow: the words, a *When…* button
  that opens the guided condition editor, ↑ ↓ to order, and a target button to make an exit the
  default.
- **The arrow itself** — select an arrow on the canvas and press the filter button. It opens that
  arrow's exit on its source step, and the label follows the words the exit says.

Nothing had to change for existing flows: an arrow with no exit configuration still reads its
condition and its description from the label, exactly as documented below. The step editor offers
a previewed, idempotent **"Move arrow labels into this step"** when it finds labels worth moving —
the condition goes into the step, the words stay on the diagram, and the arrow keeps its IF
annotation on the canvas because the canvas asks the step, not the label.

Where it is stored: with the step's own settings (the node's `zettelflowConfig` on a canvas box,
the note's frontmatter for a step note), keyed by canvas edge id. The `.canvas` file stays a plain
canvas file.

## Syntax

Label a canvas edge with `if: <expression>` (case-insensitive prefix):

```
if: frontmatter.type === "meeting"
```

If the expression evaluates to **falsy** for the current source note context, the target step
(and the entire chain that follows it) is **skipped**.

If the expression is **syntactically invalid**, the wizard shows a warning notice and treats
the edge as **unconditional** (safe fallback — no workflow crash).

## Expression language

### Comparison operators

| Operator | Meaning |
|---|---|
| `===` | Strict equality |
| `!==` | Strict inequality |

### Boolean operators (in precedence order, lowest first)

| Operator | Meaning |
|---|---|
| `\|\|` | Logical OR |
| `&&` | Logical AND |
| `!` | Logical NOT (prefix) |

Parentheses `( … )` can be used to override precedence.

### Context variables

| Variable | Value |
|---|---|
| `frontmatter.<key>` | The source note's frontmatter property `<key>` |
| `note.title` | The current note title being built |
| `canvas.name` | The name of the active canvas (without extension) |

### Literals

- Strings: `"double-quoted"` or `'single-quoted'`
- Numbers: `42`, `-3.14`
- Booleans: `true`, `false`
- Null: `null`

## Examples

```
if: frontmatter.type === "meeting"
if: frontmatter.status !== "draft"
if: frontmatter.type === "meeting" && frontmatter.status === "open"
if: frontmatter.type === "meeting" || frontmatter.type === "standup"
if: !frontmatter.type === "archived"
if: (frontmatter.priority === "high") && (canvas.name === "Daily")
```

## Out of scope

- Arbitrary JavaScript (no `eval`, no `Function()`)
- Looping constructs

## See also

A conditional edge is the **IF** block of the
[visual workflow language](event-driven-workflows.md#visual-workflow-language-when-if-action-wait)
(WHEN / IF / ACTION / WAIT).
