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
  graph with `flowAdjacency` (#408), the same adjacency the wizard walks.
- `FlowReviewExtension` — the chip and the panel on `canvas.wrapperEl`, every canvas access
  feature-detected and removed on unload (§VI).
