# Tasks: Grow test coverage for note-assembly and flow-graph logic

- **Plan:** [plan.md](plan.md)
- **Owner:** implementation-planner → main assistant (implement)

> Stage 3 of the [SDD pipeline](../README.md). An ordered, dependency-aware checklist of
> **TDD-sized** tasks. Each task is small enough to be one red→green→refactor cycle and, ideally,
> one commit that leaves `npm run verify` green (constitution §II, §IX).

## Legend

- `[ ]` todo · `[~]` in progress · `[x]` done
- Each task names the **test to write first** and the **guardrail** that proves it.

## Tasks

- [x] **T1 — Grow `ContentDTO` edge cases** (covers FR-1 / AC-1, AC-2)
  - Red: add cases to `test/application/notes/model/ContentDTO.test.ts` — absent-key `modify`
    no-op, successive-frontmatter merge with last-write-wins, tag hoisting accumulation +
    de-dup across calls, caller-object mutation (`tags` stripped), falsy-frontmatter no-op,
    non-string-array tag rejection, intra-call de-dup.
  - Green: no production change — assert existing behaviour.
  - Guardrail: `npm test` green; `npm run lint:obsidian` no new violations.
  - Commit: `test(notes): grow ContentDTO edge-case coverage`

- [x] **T2 — Grow `NoteDTO` edge cases** (covers FR-2 / AC-3)
  - Red: add cases to `test/application/notes/model/NoteDTO.test.ts` — falsy-setter guards,
    default `/.md` path, no-trailing-slash unchanged, `getPath`/`getElement` miss → `undefined`,
    empty-path ignored, `addFinalElement` set + undefined no-op, `deletePos` cut semantics for
    both maps, fluent `this` chain.
  - Green: no production change — assert existing behaviour.
  - Guardrail: `npm test` green.
  - Commit: `test(notes): grow NoteDTO edge-case coverage`

- [x] **T3 — Extend the Obsidian mock with `parseYaml`/`stringifyYaml`** (covers FR-4, unblocks T4)
  - Red: (driven by T4) — `FlowImpl` text-node tests fail because `YamlService` calls
    `parseYaml`.
  - Green: add a minimal, typed, flat `key: value` parser (+ trivial serialiser) to
    `test/__mocks__/obsidian.ts`.
  - Guardrail: `npm test` green; addition is minimal and typed.
  - Commit: `test(mock): add minimal parseYaml/stringifyYaml to the obsidian stub`

- [x] **T4 — Add `FlowImpl` graph-traversal suite** (covers FR-3 / AC-4, AC-5; depends on T3)
  - Red: create `test/architecture/plugin/canvas/Flows.test.ts` with an in-memory `CanvasData`
    fixture (text/group nodes + edges). Assert `rootNodes()` selects only YAML-`root` nodes
    (edge-independent) and populates color; `childrensOf()` is edge-reachable + directional +
    tooltip-carrying + link-skipping + group-geometry.
  - Green: no production change — assert real behaviour; keep fixtures to text/group nodes only.
  - Guardrail: `npm run verify` green.
  - Commit: `test(canvas): cover FlowImpl rootNodes/childrensOf traversal`

## Definition of done

- [x] All tasks `[x]`.
- [x] Every acceptance criterion in the [spec](spec.md) verified (`npm run verify` green:
      9 suites, 68 tests).
- [ ] `obsidian-plugin-quality` audit + `obsidian-plugin-reviewer` review clean (n-a: tests-only,
      no `src/` change — score surface untouched).
- [x] Docs + `en`/`es` synced (no changes needed). Issue #87 progressed.

## Notes / findings

- **Production bug (deferred, not fixed here):** `FlowImpl.rootNodes()` and `nodesFrom()` use
  `forEach(async …)` and `push` after an `await` for `file` nodes → those results never appear in
  the returned array. Also, `rootNodes` selects roots by the YAML `root` flag, not by graph
  topology. Tests assert the real behaviour and cover only the deterministic text/group branches.
