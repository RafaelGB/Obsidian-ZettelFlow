# Living knowledge map — regions and neighbourhoods

The **living knowledge map** shows the *shape* of your slip-box, at two levels that nest:

- a **region** is a connected component of your link graph — *what is cut off from what*, and
  which notes are **alone**;
- a **neighbourhood** (a *community*) is a densely linked group **inside** a region — *the
  topics your thinking actually falls into*.

Both are derived, both regenerate as the vault changes, and neither has a setting.

## Where you see it

There is no separate pane. The map is what the **graph lens** draws: open **Explore**, switch the
result view to the graph, and set *Colour by* to **Neighbourhoods**.

Each neighbourhood is a hue, a translucent bubble, a label floating in the scene, and a row in the
legend with its size. Regions appear as **headings** grouping those rows — unless a region holds
only one neighbourhood, in which case the heading would repeat the row and is left out. Clicking a
row flies to that neighbourhood; clicking a heading flies to the whole region; clicking again
pulls back. Framing only ever moves the camera — nothing is hidden or filtered.

Opening the graph focused on a note tells you the neighbourhood you landed in and the region it
sits inside, or that the note is alone.

Four of the six discovery lenses read this structure:

| lens | what it lights | reference vault |
|---|---|---|
| **alone** | notes with no link to anything else in your knowledge | 82 (19 %) |
| **frontier** | notes whose neighbours are not all from their own neighbourhood | 48 |
| **bridges** | the **links** that cross from one neighbourhood into another | 26 |
| orphans · dead-ends · contradictions | as before | — |

`bridges` is the only lens about links rather than notes. Both endpoints stay lit while everything
else dims, so it reads as *what joins what*.

From a script: `zf.knowledge.map()` returns `{ clusters, unclustered }` — the regions and the
notes that are alone.

## How each level is defined

- A **region** is a connected component of the undirected link graph. Every note belongs to
  exactly one; a note with no link to anything else in the model is **alone**.
- A **neighbourhood** is a **Louvain** community, computed **per region** — one connected
  component at a time. Modularity would never merge across components anyway, so running it this
  way is not about the partition being right: it makes *a neighbourhood never straddles a region*
  true by construction and hands each one its region for free.

Both are named after their most connected note, ties broken by path. Names are derived and not
settable: a name you could edit would be a data field with no home and an editor to build
([constitution §XIII](constitution.md)).

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
    (on the node and the link, so they survive capGraph3D / filterGraph3D / graph3dUpToTime)

COMMUNITY_COLORS + communityColor(i) one palette for node, halo, hull, scene label and legend
                                     swatch; mirrored by graph3d.scss, guarded by a test
```

Only **in-model** neighbours are walked at either level. `KnowledgeModel` records a link's target
whether or not that target is an idea, so a note whose only link leaves the scope has a degree but
no neighbour here — it is alone in *this* graph, which is the graph the map describes.

Determinism is not incidental: Louvain is order-sensitive, so nodes are walked in path order and a
tie in modularity gain resolves to the lowest community id. Two runs on one model are identical.

Budgets: `analysis.map.10k` 13.9 ms (ceiling 120), `analysis.communities.10k` 157.3 ms
(ceiling 400). See [performance budgets](performance-budgets.md).

The map **writes nothing**. It is a view of the structure, distinct from the
[MOC builder](moc-builder.md), which generates notes.

## Out of scope

- **Splitting a neighbourhood further.** Louvain already runs to its own stopping point; a third
  level needs evidence, not ambition.
- **Ranking bridges by importance.** Girvan–Newman edge-betweenness finds them directly and is
  O(N·E) — unusable at vault scale. Twenty-six edges do not need ranking.
- **Weighted or directed detection.** The link graph is unweighted; adding weights is a modelling
  decision with nothing behind it yet.
