# Conditional edges

ZettelFlow canvas edges support a simple boolean expression language that lets you control
which branches of a workflow are followed based on the context of the note being built.

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
- Visual condition builder (planned separately)

## See also

A conditional edge is the **IF** block of the
[visual workflow language](event-driven-workflows.md#visual-workflow-language-when--if--action--wait)
(WHEN / IF / ACTION / WAIT).
