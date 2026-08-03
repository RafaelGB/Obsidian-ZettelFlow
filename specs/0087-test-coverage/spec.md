# Spec: Grow test coverage for note-assembly and flow-graph logic

- **Issue:** #87
- **Status:** Done
- **Milestone / label:** obsidian-score / testing-and-guardrails
- **Owner:** spec-author

> Stage 1 of the [SDD pipeline](../README.md). This file is the source of truth for **WHAT** we
> build and **WHY**, and the acceptance criteria the change is measured against. No implementation
> detail here — that's the [plan](plan.md).

## Problem

The jest harness is only seeded. The pure logic that assembles a note (`ContentDTO`, `NoteDTO`)
and traverses the canvas flow graph (`FlowImpl`) carries branch-heavy behaviour — zone merging,
`{{key}}` substitution, tag de-duplication, root detection, edge-directional child lookup — that
regresses silently today because nothing pins it down. The project's health notes call out that
test breadth "must grow", and coverage directly supports the Obsidian quality-score work by making
future refactors safe.

## Value

- Maintainers get regression guards on the most refactor-prone pure logic in the codebase.
- Supports the `obsidian-score` effort indirectly: the blocking `jest` guardrail (pre-push + CI)
  gains real coverage, so score-driven refactors can move fast without breaking note assembly or
  the fragile canvas integration.
- No product behaviour changes; this is tests-only, so it is zero-risk to ship.

## Functional requirements

Numbered so the plan and tasks can reference them.

- **FR-1** — `ContentDTO` behaviour is pinned: body `add`/`get`, `{{key}}` substitution
  (including "absent key is a no-op"), frontmatter zone merging with last-write-wins, `tags`
  hoisting out of frontmatter into the tag list, tag de-duplication across calls and within one
  call, rejection of non-string/empty/falsy tag inputs, and `reset`.
- **FR-2** — `NoteDTO` behaviour is pinned: final-path assembly, trailing-slash normalisation,
  falsy-setter guards, position-keyed paths/actions/final-elements, `getElement`/`getPath` misses
  return `undefined`, `deletePos` cut semantics (strictly-below kept; at-or-after removed) for both
  maps, and fluent (`this`-returning) chaining.
- **FR-3** — `FlowImpl` graph traversal is pinned for the deterministic `text`/`group` branches:
  `rootNodes()` returns nodes whose YAML config flags them root (and only those), and
  `childrensOf()` returns edge-reachable children directionally, carrying the edge label as the
  child tooltip, skipping link targets, and resolving group children by geometry.
- **FR-4** — Tests run with no real Obsidian runtime. The manual Obsidian mock is extended only as
  strictly required (`parseYaml`/`stringifyYaml`), kept minimal and typed.

## Acceptance criteria

Testable, Given/When/Then where possible. These are the stage-5 sign-off checklist.

- **AC-1** — Given a `ContentDTO` with `{{a}} and {{a}} and {{b}}`, when `modify("a","X")`, then
  `get()` is `X and X and {{b}}`; and `modify("missing","X")` leaves the content unchanged.
- **AC-2** — Given two `addFrontMatter` calls sharing a key, then `getFrontmatter()` keeps the last
  value and all distinct keys; and `tags` from each call are hoisted, accumulated and de-duplicated
  into `getTags()`. An array tag input containing a non-string is rejected wholesale.
- **AC-3** — Given a fresh `NoteDTO`, then `getFinalPath()` is `/.md`; setting `Notes/` yields
  target `Notes` and path `Notes/<title>.md`; `deletePos(2)` keeps positions `0,1` and drops `2+`
  in both the paths and actions maps.
- **AC-4** — jest asserts `FlowImpl.rootNodes()` returns exactly the nodes whose YAML config has
  `root: true` (undefined config defaults to root), independent of incoming/outgoing edges.
- **AC-5** — jest asserts `FlowImpl.childrensOf("A")` returns the `toNode` of every edge whose
  `fromNode` is `A`; `childrensOf("B")` for edge `A→B` is empty (directional); the edge label
  becomes the child's `tooltip`; a link target is skipped; and a group's children are the nodes
  geometrically inside it.
- **AC-6** — `npm run verify` (typecheck + oxlint + jest) is green; no `src/` production code is
  modified; the only non-test file changed is `test/__mocks__/obsidian.ts`.

## Capability disclosure (constitution §VII)

Does this change touch any of these? If yes, note it and confirm it's disclosed in README/docs.

- [ ] File-system access (read/write vault files beyond the active note)
- [ ] Network (calls to the community backend or any URL)
- [ ] Clipboard
- [ ] Script / code execution
- [x] None of the above — tests and a test-only mock extension only.

## Out of scope

- Adding a jest `coverageThreshold` (breadth first; a gate comes later).
- Testing the `file`-node branches of `FlowImpl` (they need a real vault; see Open questions).
- Testing React components / modals / the canvas monkey-patcher (integration territory).
- Fixing any production bug uncovered (documented below, deferred to its own issue).

## Open questions

- **Documented, resolved by descoping:** `FlowImpl.rootNodes()`/`nodesFrom()` iterate with
  `forEach(async …)` and `push` **after** an `await` for `file` nodes, so file-node results are
  never present in the returned array (fire-and-forget). The task brief described `rootNodes` as
  "nodes with no incoming edge"; the **actual** implementation selects roots by the node's YAML
  `root` flag (`YamlService.isRoot()`), not by graph topology. Tests assert the real behaviour and
  restrict fixtures to the deterministic `text`/`group` branches. The async bug is noted for a
  separate fix (do not fix under a tests-only spec).
