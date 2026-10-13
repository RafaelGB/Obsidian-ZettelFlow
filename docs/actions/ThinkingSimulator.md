# Thinking simulator

Challenge this note with critical-thinking prompts adapted to its gaps.

*Called `thinking-simulator` in the step's YAML.*

A **Knowledge** action. It asks nothing in the wizard. It writes questions that push you to
stress-test the idea, adapted to the note's actual gaps in the
[knowledge model](../architecture/knowledge-model.md) — no text or AI inference. Deterministic,
offline, and fully usable with AI turned off.

## Settings

- **Result property** — where the prompts are written. Default: `thinkingPrompts`.
- **Write to** — **Frontmatter** (a property on the note) or **Context** (only for the next steps).
  Default: **Frontmatter**. Either way the next steps can use them as `{{<result property>}}`, e.g.
  `{{thinkingPrompts}}`.
- **Target note (optional)** — the note to challenge. Empty uses the note being built.

## The prompts

### Always asked

These four apply to any idea, so the list is never empty — even for a brand-new note:

- **What if this is false?**
- **Who would disagree, and why?**
- **What happens in the extreme case?**
- **What hidden assumption does this rest on?**

### Asked when the note has the gap

| Prompt | When |
|---|---|
| **What evidence is missing to support this?** | the note makes a claim but cites no source |
| **What contradicts this?** | no `contradicts` relation in or out |
| **What is a concrete example?** | no outgoing `example` relation |
| **How does this connect to what you already know?** | nothing links to it |
| **What open question does this raise?** | no `question` relation |

[Suggest next move](SuggestNextMove.md) reads the same gaps and gives a **to-do** ("add a source");
this one gives a **challenge** ("what evidence is missing — and what if it's false?").

## What it writes

```yaml
---
thinkingPrompts:
  - What if this is false?
  - Who would disagree, and why?
  - What happens in the extreme case?
  - What hidden assumption does this rest on?
  - What evidence is missing to support this?
---
```

A notice reports the count. If the index isn't ready, the action does nothing.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**
