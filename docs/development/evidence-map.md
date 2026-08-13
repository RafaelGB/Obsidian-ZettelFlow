# Evidence map (compound thinking)

> **Experimental.** The ambitious end-state: ask "what do *you* think about X?" and get *your*
> system's answer — not a generic model's.

The **evidence map** is a transparent synthesis of the active note, reconstructed **only from your
graph**: which ideas support it, which contradict it, what evidence exists, and what gaps remain.
Every row links to the exact source note. It is not "an AI's opinion" — it's a view of *your*
knowledge, with **no invented content**.

## Opening it

Run **"Show evidence map"** from the command palette, or click **Open** next to *Evidence map* in
**Settings → ZettelFlow → Zettelkasten toolkit**. It follows the **active note** and updates
(debounced) as you switch notes or edit.

## The four buckets

For the active note, `buildEvidenceMap` composes existing graph primitives:

- **Supports** — the notes connected to it by a `supports` relation (#147), in **either** direction
  (the ideas backing the position).
- **Contradicts** — its `contradicts` partners (the #153 `findContradictions`, in + out).
- **Evidence** — the **sourced** claims (#148) on the note *and* its supporting notes: each entry is
  a real claim grounded to a real note and a real source (`[[link]]` or a citation). **Only sourced
  claims appear here** — that's the "no unsourced claims" rule.
- **Gaps** — where the position is thin: the note's **unsourced claims** (claims with no evidence)
  and its **open questions** (the #153 `findUnansweredQuestions`).

Every emitted **note path** exists in the model; the map is deterministic, read-only and never
invents content. An unindexed note yields an empty map.

## AI is out of scope (for now)

This ships as the deterministic, **AI-free evidence map** — it works entirely offline. Grounded
natural-language *generation* over this map (the "write me the synthesis" step) is a deliberate
follow-up that will compose with the optional AI actions; the map itself never needs it.

## Architecture

```
buildEvidenceMap(model, path)                    (pure, Obsidian-free, unit-tested)
  → { focus, supports, contradicts, evidence: [{ note, claim, source }],
      gaps: { unsourcedClaims, openQuestions } }
  reuses findContradictions (#153), findUnansweredQuestions (#153), the #148 claims/sources

EvidenceMapView (ItemView) + EvidenceMapComponent (show-evidence-map command, no hotkey)
  reads the KnowledgeIndex model for the active note → buildEvidenceMap
  four sections, every note row opens via workspace.openLinkText; writes nothing
```
