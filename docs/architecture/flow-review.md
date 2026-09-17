# Review this flow

Nothing about a flow was checked until it ran. A flow could be saved, shared as a system and
installed by someone else while a file step pointed at a deleted note — which throws
`FatalError` in the middle of someone writing — or while steps were unreachable, dead ends,
or two options read exactly alike.

The **review** is a reading of the recorded graph. A chip in the corner of a ZettelFlow canvas
says how many findings it has; opening it lists them, and clicking one selects and centres the
node it is about.

## What it reports

| Finding | What it states |
|---|---|
| **The note is gone** | A file step points at a note that no longer exists. The flow will stop there. |
| **No start** | No step is marked as the root, so the flow cannot begin. |
| **Several starts** | More than one root — legitimate, and worth knowing. |
| **Nothing points at it** | The step is unreachable from any root, so the flow never arrives. |
| **Dead end** | The step ends the flow without asking, writing or filing anything. |
| **Two options read the same** | Two sibling exits say the same words: the person picks blind. |
| **A gate on a key nothing writes** | A condition waits on a frontmatter key no step in this flow writes — it can only come from the note you start on. |

## What it is not

- **Not a score.** No number, no quality, no ranking of flows. Every finding is a structural fact
  about what is recorded, plus what that fact implies.
- **Not blocking.** Nothing stops you saving, running or sharing a flow with findings. A half-built
  flow is legitimate work in progress.
- **Not a fixer.** The review never edits a flow. The finder module imports *nothing at all*, and a
  guardrail test asserts it (`flowFindings.test.ts`).
- **Not Health.** Health is about the vault's knowledge; this is about one flow's structure.
  Different objects, different homes.

## Nothing destructive in silence

- A **file step whose note is gone** is marked on the node itself (a *note is gone* badge), without
  opening the panel — it is the one finding that throws at run time.
- **Applying an installed template** over a configured step now shows *what will change* before it
  is written: one line per field, what it says now and what it would say. Cancelling changes
  nothing.
- **Deleting a node** is Obsidian's own action, and ZettelFlow does not wrap it: intercepting a
  destructive canvas internal to cancel it is a worse risk than the one it avoids, and Obsidian's
  undo already covers the mistake. What ZettelFlow does instead is *notice*: the moment a deletion
  orphans steps, the review chip's count rises and each orphan is named as *nothing points at it*.

## How it is built

- `application/notes/flowFindings.ts` — **pure**: a flow graph in, findings out. Unit-tested per
  finding, including the clean flow (empty result) and the case where another step in the same flow
  writes the key a gate reads.
- `zettelkasten/review/readFlow.ts` — the impure half: resolves each node's settings (the same
  reader the exits use), asks the vault whether a file step's note still exists, and builds the
  graph with `canvasEdges` over `flowAdjacency` (#408) — the same adjacency the wizard walks, so a
  group's children count as options here too.
- `zettelkasten/review/canvasEdges.ts` — one graph reader shared by the review and the rehearsal.
  It hands over the **raw** arrow label; who resolves the gate and the words is the exits' business
  (#427), in one place, so a flow whose conditions still live on its labels reads exactly as it
  runs.
- `FlowReviewExtension` — the chip and the panel on `canvas.wrapperEl`, every canvas access
  feature-detected and removed on unload (§VI).

## Rehearse the flow

The only way to find out what a flow did was to run it on a real note. Authors tested by making
throwaway notes and deleting them — which is why half-finished flows ship, and why a branch that
can never open survives for months.

**Rehearse** walks your own flow, in the panel on the left of the canvas:

- it asks **where to start**: a canvas usually holds several flows (four groups on one board is
  normal), and guessing the first one found would be a guess;
- it walks the graph the **wizard** walks — outgoing arrows for a box, and the boxes **inside a
  group** for a group, since that is how `childrensOf` reads a canvas;
- you take the options you would be offered, and the path is traced **on the canvas** — the current
  node outlined, the walked ones dashed;
- a **closed branch is shown with its reason**, the same sentence the wizard says to the person
  writing a note (`explainBranch`, one phrasing shared by both);
- you supply the **frontmatter a gate would read**, as a form, because a rehearsal with an empty
  context only ever takes one path;
- side-effecting actions — script, AI — are **listed as "what would run"**, named, never executed.
  Pretending to run a script safely would not be an honest answer;
- it ends on the note the walk would have produced: the merged body, the frontmatter keys, where it
  would be filed, and the linked note (#419) it would also create.

**Nothing is written.** No note, no folder, no frontmatter, no draft, no history entry. That is not
a promise, it is the shape of the code: the walk is a pure module whose imports are asserted by a
test — `conditionEvaluator`, `branchVisibility`, `stepExits`, `previewAssembly`, and nothing else.
Leaving the rehearsal removes every class it added; the selection is never touched.

If the canvas internals cannot be annotated, the rehearsal still runs — it just stays in the panel,
and says so in the log.

## Rehearsing a system you have not installed (#438)

The walk and the review work on a plain graph, and a community `.zftemplate` **is** that graph:
the canvas JSON plus each step's markdown, all of it inside the bundle. So the gallery can answer
*what would this do to my vault?* before anything exists.

**Try it** in a system's dialog:

- the **review** first — steps nothing points at, dead ends, options that read alike, a gate on a
  key nothing writes — so a half-built system is visible before it lands;
- then the **walk**: the options it would offer, why a branch is closed, the frontmatter you can
  supply to open another one, and the note it would produce;
- and the **what would run** list: script and AI actions are named, never executed. That rule
  matters more here than anywhere else — this is code from the internet.

Nothing is created and nothing is read from the vault: the step contents travel inside the
template, the frontmatter parser is injected, and a test asserts the module imports neither
`FileService` nor `FrontmatterService` nor `obsidian`. Install stays one click away, and a system
with findings is still installable — the gallery informs, it does not gate.
