# Living knowledge map

> Since #566 the regions and communities on this page have a second reader, and it wants the
> opposite of what everything else wants: [two things far apart](../architecture/collision.md) draws
> a pair from **different** neighbourhoods, with no shared neighbour. It is also the only reader in
> the product for which a note that stands **alone** is prime material rather than a limitation. — regions and neighbourhoods

The **living knowledge map** shows the *shape* of your slip-box, at levels that nest:

- a **region** is a connected component of your link graph — *what is cut off from what*, and
  which notes are **alone**;
- a **neighbourhood** (a *community*) is a densely linked group **inside** a region — *the
  topics your thinking actually falls into*;
- a **seam** is the space **between** two neighbourhoods — *how much shared context has not become
  a link*.

All three are derived, all three regenerate as the vault changes, and none of them has a setting.

## Where you see it

There is no separate pane. The map is what the **graph lens** draws: open **Explore**, switch the
result view to the graph, and set *Colour by* to **Neighbourhoods**.

Each neighbourhood is a hue, a translucent bubble, a label floating in the scene, and a row in the
legend with its size. Regions appear as **headings** grouping those rows — unless a region holds
only one neighbourhood, in which case the heading would repeat the row and is left out. Clicking a
row flies to that neighbourhood; clicking a heading flies to the whole region; clicking again
pulls back. Framing only ever moves the camera — nothing is hidden or filtered, and it keys on the
**neighbourhood**, not on its name: two that share a label are two places and fly separately
([#533](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/533) — before it, one merged row flew
to both at once).

**With the `gaps` lens on, that list becomes the seams** — the widest first, each row showing the two
sides with their colours and *N gaps · M links*, and clicking one frames **both** neighbourhoods so
you are looking at the space between them. At most eight rows, with the heading saying how many were
left out. See [the seam list](graph-3d.md#the-seam-list-and-flying-to-one).

Opening the graph focused on a note tells you the neighbourhood you landed in and the region it
sits inside, or that the note is alone.

Five of the seven discovery lenses read this structure:

| lens | what it lights | reference vault |
|---|---|---|
| **alone** | notes with no link to anything else in your knowledge | 82 (19 %) |
| **frontier** | notes whose neighbours are not all from their own neighbourhood | 48 |
| **bridges** | the **links** that cross from one neighbourhood into another | 26 |
| **gaps** | a dashed line where a link is **not** — two notes that share context and never met | 217 (30 drawn) |
| orphans · dead-ends · contradictions | as before | — |

`bridges` is the only lens about links rather than notes. Both endpoints stay lit while everything
else dims, so it reads as *what joins what*.

From a script: `zf.knowledge.map()` returns `{ clusters, unclustered }` — the regions and the
notes that are alone — and `zf.knowledge.gapSeams()` returns the seams, widest first.

### The seams of the reference vault

| | |
|---|---|
| gaps (unlinked pairs sharing context) | **217** |
| of those, crossing between neighbourhoods | **65** |
| seams | **24** |
| seams with **no link at all** between the two sides | **15** |
| the widest | `CRUD usuarios de agencia ↔ Customer & User Management` — **14 gaps, 2 links** |

Two neighbourhoods about the same domain, fourteen shared-context pairs apart and two links apart.
That sentence is what a seam exists to be able to say, and it is not a statement any list of pairs
can make.

**Ordered gaps desc, then links asc** — the widest seam has the most shared context and the fewest
links already crossing, which is explainable in one sentence. It is deliberately **not** normalised
by neighbourhood size, and that was measured rather than assumed: dividing by the pairs possible
across the seam promotes the vault's own scaffolding (the two `readme` neighbourhoods) to first
place and puts *two* gaps between a three-note and a two-note neighbourhood in second, while at ten
thousand notes it hands seven of its top ten rows to a single 17-note community. A rate with a small
denominator is an artifact, and a ratio is one step from an invented metric
([§XI](constitution.md)). The row shows both raw numbers instead, so a reader can normalise in
their head against sizes the legend is already showing.

That decision rests on a 94-note real vault and a synthetic ten-thousand one whose communities hold
335–444 notes each — evidence about the generator, not about a vault. On a **large real** vault the
top ten is worth re-reading; if the bias is there, the fix is a consequence of the model (the
conductance between the two neighbourhoods, which the graph already knows) and a new spec, not a
rate someone chose.

## Ruling on a gap

A seam is made of gaps, so a verdict on a gap reaches the seam it is part of
([#534](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/534)). Saying **not related** on a
pair in [Home](zettelflow-home.md) drops that seam's gap count by one and its score by that pair's
own score; a seam whose every gap has been ruled out **disappears from the list**, and the survivors
come back re-sorted, because subtraction can change which seam is widest. The map's gap lens and its
chip count follow the same filtered pass, so the dashed line for a pair you dismissed is gone the
next time the lens is turned on — the record is part of the cache key, since a verdict moves the
record and not the model.

Two caveats worth stating rather than discovering:

- **Labels are computed before subtraction.** A qualified label (`Projects/readme` rather than
  `readme`) can outlive the ambiguity that earned it, when the other `readme` neighbourhood drops off
  the list. Over-qualified is never wrong, and re-deriving labels after subtraction would mean
  re-deriving the communities to do it.
- **The note-level verdict is the epic's open question.** *"This note is scaffolding, never propose it
  for a gap"* was measured as genuinely cheaper — 8 verdicts would clear what needs about 20
  pair-level ones on the reference vault — but it is a second concept next to `excludedPaths`, and
  pair dismissal has to exist either way. It stays open, to be decided after living with this one.

## How each level is defined

- A **region** is a connected component of the undirected link graph. Every note belongs to
  exactly one; a note with no link to anything else in the model is **alone**.
- A **neighbourhood** is a **Louvain** community, computed **per region** — one connected
  component at a time. Modularity would never merge across components anyway, so running it this
  way is not about the partition being right: it makes *a neighbourhood never straddles a region*
  true by construction and hands each one its region for free.

- A **seam** is a pair of neighbourhoods with at least one **gap** crossing between them — a gap
  being a pair of notes that share graph context and are not linked
  ([morning discovery](morning-discovery.md)). A seam carries two counts: how many gaps cross, and
  how many links already do. Gaps *inside* one neighbourhood are counted nowhere: 152 of the
  reference vault's 217 are internal, and a gap between two notes of the same topic is a local
  omission rather than a hole in the map.

Regions and neighbourhoods are named after their most connected note, ties broken by path. Names are
derived and not settable: a name you could edit would be a data field with no home and an editor to
build ([constitution §XIII](constitution.md)). A **seam** is named by its two sides, each qualified
by the hub's parent folder **path** only when two neighbourhoods would otherwise read the same — the
reference vault has two whose hub is a `readme.md`, and a row reading `readme ↔ readme` says
nothing.

Neither has a threshold, a resolution or a knob of any kind. That is deliberate, and the next
section is why.

## Two measurements, and one wrong conclusion

### The heuristic that was replaced

Until [#513](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/513) a region was a **hub** —
degree ≥ 5 — plus every note one hop from it. Measured on a real 421-note vault:

| | hub heuristic | connected components |
|---|---|---|
| regions | 31 | 9 |
| notes in a region | 112 (27 %) | 321 — every linked note |
| notes in a leftover bucket | 309 | 0 |
| a parameter to tune | yes | no |

Lowering the threshold did not rescue it: at 3 it covered 74 % and produced **250 regions for 421
notes**. The 73 % in no region were all painted one grey, which is why the graph read as a grey
cloud with coloured specks in it.

### The conclusion that was wrong

Epic [#512](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/512) went further and concluded
the vault had **no community structure at all**, cutting the bridge and frontier lenses on that
basis. This page said so. It was wrong, and the reasoning is worth keeping visible:

- It rested on **one** algorithm, **label propagation**, which put **244 of 248** notes into a
  single community and left 5 inter-community edges.
- Label propagation collapsing on a sparse, hub-heavy graph is a **documented failure mode of
  label propagation**. It is evidence about the algorithm, not about the graph.
- Separately, defining a region as a connected component made a bridge *structurally impossible at
  that level* — a component has no edges leaving it by definition. That was a consequence of the
  design decision, not a property of the vault, and #512 did not say so.

### What a second algorithm found

**Louvain**, on the same giant component:

| | label propagation | Louvain |
|---|---|---|
| communities | 1 (+ dust) | **17** |
| with ≥ 5 notes | 1 | **17 — all of them** |
| largest, as a share of the component | 98 % | **13 %** |
| sizes | 244, then 1s and 2s | 36, 23, 22, 21, 19, 19, 17, 16, 16, 15, 15, 14, 13, 12, 11, 10, 9 |
| edges inside a community | — | **306** |
| bridge edges | 5 | **26** |
| frontier notes | — | **48** |

Clean, balanced structure. Epic
[#522](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/522) built the two levels on it.

**The method lesson, recorded because it cost an epic:** one algorithm returning a degenerate
answer is evidence about that algorithm. Before concluding the data has no structure, try a second
method.

## Architecture

```
buildKnowledgeMap(model)            (pure, Obsidian-free, memoised per model revision)
  → { clusters: [{ hub, degree, members }], unclustered }
      hub         the region's most connected note — and its name
      unclustered the notes with no link to anything else in the model

communitiesOf(model)                (pure, memoised; Louvain run per region)
  → [{ hub, region, members }]
      hub         the neighbourhood's most connected note — and its name
      region      the region it nests in; never more than one

build3DGraph(model)                 puts both levels on each node, and the crossing on each link
  → node.group / node.region              the region (index, name)
    node.community / node.communityName   the neighbourhood (index, name)
    node.frontier                         its neighbours are not all its own
    link.bridge                           this link crosses two neighbourhoods
    (on the node and the link, so they survive filterGraph3D / graph3dUpToTime)

COMMUNITY_COLORS + communityColor(i) one palette for node, halo, hull, scene label and legend
                                     swatch; mirrored by graph3d.scss, guarded by a test

gapSeams(model)                     (pure, memoised; one pass over the shared gap tally)
  → [{ a, b, labelA, labelB, gaps, score, links }]
      a, b        the two neighbourhood indices, lower first
      gaps/score  how many gaps cross, and the sum of their scores
      links       how many links already cross -- counted exactly as the `bridges` lens
                  draws them, with a test asserting the two agree per seam
```

Only **in-model** neighbours are walked at either level. `KnowledgeModel` records a link's target
whether or not that target is an idea, so a note whose only link leaves the scope has a degree but
no neighbour here — it is alone in *this* graph, which is the graph the map describes.

Determinism is not incidental: Louvain is order-sensitive, so nodes are walked in path order and a
tie in modularity gain resolves to the lowest community id. Two runs on one model are identical.

`gapSeams` reads the **shared gap tally** (#530) and the neighbourhoods, and walks the graph itself
**not at all**: the link count reads each idea's own relations, and a test spies on the model's
neighbour sets to prove zero calls. A private candidate pass in there would have doubled the
heaviest projection in the product.

Budgets: `analysis.map.10k` 13.9 ms (ceiling 120), `analysis.communities.10k` 157.3 ms (ceiling
400), `analysis.gaps.seams.10k` 388.5 ms (ceiling 1,500) over 1.26 million gap pairs. See
[performance budgets](performance-budgets.md).

The map **writes nothing**. It is a view of the structure, distinct from the
[MOC builder](moc-builder.md), which generates notes.

## Out of scope

- **Splitting a neighbourhood further.** Louvain already runs to its own stopping point; a third
  level needs evidence, not ambition.
- **Ranking bridges by importance.** Girvan–Newman edge-betweenness finds them directly and is
  O(N·E) — unusable at vault scale. Twenty-six edges do not need ranking.
- **Weighted or directed detection.** The link graph is unweighted; adding weights is a modelling
  decision with nothing behind it yet.
- **Normalising a seam by neighbourhood size.** Measured and rejected above; re-open it with a large
  real vault, not with an argument.
- **Normalising the seam list's length to the window.** `SEAM_LEGEND_MAX` is one integer measured
  against the legend box (8); making it depend on the viewport would be a rule with a knob behind it.
