# The ZettelFlow manifesto

> **Most plugins help you _write_. Almost none help you _think_.**

ZettelFlow is not a note plugin. It is an **engine that makes knowledge evolve**.

## Stop managing notes. Start managing knowledge.

Obsidian is a wonderful place to *store* notes. But a store is not a mind. Luhmann's insight was
that the value of a slip-box is not in *keeping* information — it is in making ideas **evolve and
connect** until they produce new knowledge.

> **Obsidian is the store. ZettelFlow is the engine that makes the knowledge inside it evolve.**

Everything ZettelFlow does follows from one architectural idea:

> **ZettelFlow does not manage notes. It manages the processes that transform knowledge.**

A **Step** used to mean *"do this operation on a note."* It now means *"advance this piece of
knowledge."* Steps compose into workflows — programmable thinking — that walk an idea through its
life:

```
CAPTURE → CLASSIFY → PROCESS → CONNECT → DEVELOP → REVIEW → CONSOLIDATE
```

## The four pillars (the soul)

- 🌱 **Knowledge Lifecycle** — every idea has a state (fleeting → literature → permanent → developing
  → evergreen → archived). ZettelFlow knows the phase and proposes the next move.
- 🕸️ **Semantic Knowledge Graph** — relations that carry *meaning*, so you can ask *"show me every
  idea that contradicts this"* and follow reasoning chains — not just backlinks.
- 🔭 **Knowledge Discovery** — surface the *unexpected*: connections you didn't know you'd made,
  challenges to your ideas, the hubs your thinking clusters around, a book outline hiding in a folder.
- 🩺 **Knowledge Health** — measure *balance and richness*, not volume: maturity, knowledge debt, a
  weekly review, composition, a heatmap of the ideas you actually **developed**.

Metrics are **consequences, not inventions**. When a workflow runs *find related* and gets nothing,
the note is unconnected. When *find contradiction* returns empty, the idea has no opposing view.
Knowledge debt is a natural byproduct of doing the work — never an arbitrary number.

## What we will not become

- **"Obsidian + AI"** — competing with a thousand tools. **AI is one Action, never the product.** The
  system works fully — every pillar, every dashboard — for a user who never enables AI.
- **"Another plugin to create Zettelkasten notes."** That ceiling is too low.
- A generic manager that pleases everyone and marks no one.

## Keep every feature — reposition it

This is the promise that made the whole thing possible without a rewrite: **almost nothing is
deleted; what changes is its _position_ in the product.**

| Today | Becomes |
|---|---|
| Steps + Actions | The **cognitive engine** — each step advances a piece of knowledge |
| Workflows | **Programmable thinking** |
| Templates | **Knowledge Patterns** — structure **+ behavior** |
| Community gallery | A **methodology app store** — install a whole knowledge system |
| Dashboards | The **observability** of your knowledge system |
| Slip-box health, discovery, timelines | The **Knowledge State** layer |

The engineering shape follows the philosophy in five layers — **Knowledge Model → Workflow Engine →
Knowledge State → Experience → Community Gallery** — mapped feature-by-feature in the
[reposition map](architecture/reposition-map.md).

## Design by subtraction

Repositioning is only half of the discipline. The other half is **subtraction**: the plugin is
designed by *removing*, not accumulating. Power comes from **fewer, deeper capabilities**, not more
shallow ones.

- **When two features resemble each other, we don't ship both — we centralize and empower one.** One
  strong home for each idea beats two half-overlapping ones the user has to tell apart. (This is why
  the ~12 views became **four surfaces**, the community became one **static gallery**, and the whole
  system consolidated around **one engine** rather than a pile of features.)
- **Every addition must earn its place against the cost of complexity.** A feature that makes the
  product harder to hold in your head is a net loss, even if it "works".
- **Keep the thinking system uncluttered.** Config, templates and other vault tooling aren't
  knowledge — you can [exclude those paths](development/knowledge-scope.md) so they leave the graph,
  the health checks, discovery and everything else. Less noise, sharper signal.

> **If it can be centralized, centralize it. If it can be removed, remove it. Stay minimal and
> comprehensible — that is the feature.**

Subtraction is what keeps ZettelFlow *easy to use, hard to master* instead of *hard to use, easy to
abandon*. Minimalism here is not a lack of ambition; it is the ambition.

## Easy to use, hard to master

The best tools meet you where you are. A newcomer should be productive in **five minutes** — install a
system, create a note, watch it land already connected, cross-checked and scored — without reading a
manual. That is the **on-ramp**: ZettelFlow does the thinking-work *for* you until you're ready to do it
yourself.

And there should always be another level. Compose your own workflows, program conditions and events,
author and share systems, ask your own knowledge graph questions — the ceiling rises as far as your
practice does. That is the **summit**: mastery that changes how you think.

> **Easy to use, hard to master.**

This is how ZettelFlow becomes the **organizational reference for Obsidian** — for the curious beginner
and the devoted practitioner alike. One tool, from your first note to a second brain.

## For the few who will love it

This is not a feature list; it is an **identity**. ZettelFlow is not trying to be something everyone
likes a little. It is trying to be something a few people **love** — because it changes how they
think. If *"stop managing notes, start managing knowledge"* made something click for you, you're one
of them. Welcome.
