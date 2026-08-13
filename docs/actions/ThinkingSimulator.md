# Thinking simulator action

🧠 A **Knowledge** action · 🔭 **Discovery** (#165). Challenges the target note with **structured
critical-thinking prompts** — questions that push you to stress-test an idea instead of letting it
ossify. The prompts **adapt to the note's actual gaps** in the
[knowledge model](../architecture/knowledge-model.md) (#153). **Relation- and signal-based, no text
or AI inference.** Deterministic, offline, and **fully usable with AI disabled** — AI can enrich the
answers later, but is never required.

## The prompts

Two kinds, always returned in a fixed order.

### Universal prompts (always shown)

The four idea-agnostic challenges apply to any claim, so the simulator is **never empty** — even a
brand-new or unindexed note gets these:

| Prompt | Purpose |
|---|---|
| **What if this is false?** | force the falsification frame |
| **Who would disagree, and why?** | surface the opposing view |
| **What happens in the extreme case?** | probe the boundaries |
| **What hidden assumption does this rest on?** | expose the unstated premise |

### Gap-adaptive prompts (fired by the model)

Appended after the universals, only when the note actually shows that weakness:

| Prompt | When it fires |
|---|---|
| **What evidence is missing to support this?** | the note makes a claim but cites no source (#148) |
| **What contradicts this?** | nothing contradicts it — no `contradicts` relation in or out (#147) |
| **What is a concrete example?** | the note declares no outgoing `example` relation (#147) |
| **How does this connect to what you already know?** | nobody builds on it — it has no incoming edge |
| **What open question does this raise?** | the note raises no `question` relation (#147) |

The gap-adaptive set is the deliberate reframing of the [suggest next move](SuggestNextMove.md)
signals: that action gives a **to-do** ("add a source"); this one gives a **challenge** ("what
evidence is missing — and what if it's false?").

## Options

- **Result property** — where the prompts are written (default `thinkingPrompts`).
- **Write to** — `Frontmatter` or `Context` (also exposed as `{{property}}`).
- **Target note (optional)** — the note to challenge; empty ⇒ the note being built.

## Result

An array of short, sentence-case questions (always ≥ 4), plus a `Notice` with the count. An
unknown/unindexed target still yields the four universal prompts — the simulator never returns an
empty list. If the index isn't ready, the action safely no-ops.

## Capabilities

File-system read + the disclosed result-property write. **No network, no AI.**
