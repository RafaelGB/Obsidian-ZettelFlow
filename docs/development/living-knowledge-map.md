# Living knowledge map — the regions of your graph

The **living knowledge map** shows the *shape* of your slip-box: the **regions** it falls into, each
named after its most connected note, and the notes that are **alone**. It regenerates as the vault
changes, so it never goes stale.

## Where you see it

There is no separate pane. The map is what the **graph lens** colours: open **Explore**, switch the
result view to the graph, and set *Colour by* to **Region**. Each region is a hue, a translucent
bubble, a label floating in the scene, and a row in the legend with its size. Clicking a legend row
flies the camera to that region; clicking it again pulls back.

Opening the graph focused on a note (the "explore in 3D" deep link) tells you which region you
landed in, or that the note is alone.

The map is also readable from a script: `zf.knowledge.map()` returns
`{ clusters: [{ hub, degree, members }], unclustered }`.

## How a region is defined

A region is a **connected component** of the undirected link graph. Every note belongs to exactly
one; a note with no link to anything else in the model is **alone**.

That is it. There is no threshold and nothing to tune, which is the point.

### Why it used to be something else, and what the change was worth

Until [#513](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/513) a region was a **hub** —
degree ≥ 5 — plus every note one hop from it, each note joining the hub it was most strongly
connected to. That is a reasonable heuristic, and measuring it on a real 421-note vault showed what
it actually produced:

| | hub heuristic | connected components |
|---|---|---|
| regions | 31 | 9 |
| notes in a region | 112 (27 %) | 321 (100 % of the linked ones) |
| notes in a leftover bucket | 309 | 0 |
| a parameter to tune | yes | no |

Lowering the threshold did not rescue it: at 3 it covered 74 % and produced **250 regions for 421
notes**. And the 73 % of notes in no region were all painted the same grey, which is why the graph
read as a grey cloud with coloured specks in it.

The same vault, read as components: **99 of them, the largest holding 248 notes (59 % of the
vault)**, then islands of 18, 14, 12, 9, 7, 5, 4, 4, and **82 notes with no link at all (19 %)**.
Running label propagation — real community detection — put **244 of those 248 into one community**
and found **5 edges between communities out of 586**. There was no finer structure to find; the
heuristic had been manufacturing it.

That measurement also settled what *not* to build. "Frontier" and "bridge" lenses were on the table
for this epic and were dropped: with five inter-community edges there is nothing to draw. The lens
the vault earned instead is **alone**, because 19 % of it is.

## What a region is named

Its **most connected note** — `Cluster.hub`, which is what a reader would call the region anyway.
Ties break by path, so the name is deterministic. Names are derived and are not settable: a region
name you could edit would be a data field with no home and an editor to build
([constitution §XIII](constitution.md)).

## Architecture

```
buildKnowledgeMap(model)            (pure, Obsidian-free, memoised per model revision)
  → { clusters: [{ hub, degree, members }], unclustered }
      hub        the region's most connected note — and its name
      members    the rest of the region, sorted by path
      unclustered the notes with no link to anything else in the model

build3DGraph(model)                 puts the region on each node
  → node.group   region index, -1 when alone
    node.region  the region's name, "" when alone
                 (on the node, so it survives capGraph3D / filterGraph3D / graph3dUpToTime)

REGION_COLORS + regionColor(group)  one palette for node, halo, hull, scene label and legend
                                    swatch; mirrored by graph3d.scss, guarded by a test
```

Only **in-model** neighbours are walked. `KnowledgeModel` records a link's target whether or not
that target is an idea, so a note whose only link leaves the scope has a degree but no neighbour
here — it is alone in *this* graph, which is the graph the map describes.

The map **writes nothing**. It is a view of the structure, distinct from the
[MOC builder](moc-builder.md), which generates notes.

## Out of scope

Splitting the giant region. One mass of 244 stays one region: hierarchical or nested regions need a
vault with real community structure, and the measurement says this one does not have it. Revisit
when a vault does.
