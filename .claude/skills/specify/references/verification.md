# The verification script (required in every spec)

Every ZettelFlow spec ends with a **`## How to verify`** section: the automated proofs, and a
**hand-walkable script** someone who has never read the code can follow to see the change work.

It is the last section on purpose. A spec that cannot say how its outcome is *seen* has not
finished describing the outcome.

## Why it exists

Acceptance criteria say *what must be true*. They do not say *how a person establishes it*. On this
repo most of what ships is a projection drawn in a view — a lens, a chip, a hull, a camera flight —
and a green `npm run verify` proves the projection, never the pixel. The gap between "the function
returns 14" and "I can see the 14 on my screen" is where regressions live.

So: **automate what can be automated, and write the rest down as a script a human runs.** Both
halves are part of the spec, not a follow-up.

## The shape

```markdown
## How to verify

### Automated

| Proves | Command |
|---|---|
| AC-1, AC-2, AC-4 | `npx jest test/architecture/knowledge/map/gapSeams.test.ts` |
| AC-7 (budget) | `npm run test:perf` |
| the whole gate | `npm run verify` · `npm run lint:obsidian` |

### By hand

**Preconditions** — what the vault must contain, and how to get there by hand.
> A vault with at least ~40 linked notes, two folders of notes that link within themselves and
> barely to each other. The reference vault qualifies; a fresh vault does not — create three notes
> linking to a common fourth to see one gap.

1. **Do** … **Expect** …
2. **Do** … **Expect** …

**The empty state** — what you see when there is nothing to show (this is a feature, not a gap).

**The negative** — the thing that must *not* happen (no file written, no note modified, layout
unchanged). Say how the tester checks it.

**Leave it as you found it** — how to undo whatever the walkthrough wrote.
```

## Rules

1. **Every AC has a prover.** Each acceptance criterion appears either in the automated table or as
   a numbered manual step. An AC nobody can check is not an AC.
2. **Automate by default; say why when you cannot.** If a step is manual, name the reason in one
   clause — *WebGL scene*, *camera flight*, *Obsidian view lifecycle*, *a real vault's shape*. This
   repo accepts those four; it does not accept "hard to test".
3. **Write for a stranger.** Name things as the *user* sees them: the command as it appears in the
   palette, the surface title, the chip label — not `OVERLAY_SPECS.frontier`. No file paths in the
   manual half.
4. **One observable expectation per step.** "Expect: the chip reads *Gaps (20)* and the graph dims"
   is two steps.
5. **Reachable preconditions.** State the smallest vault that shows the behaviour and how to build
   it by hand. If the script needs the reference vault, say so — and give the minimal hand-built
   alternative.
6. **The empty state is a step.** Zero matches, no data, a fresh vault: what the user sees there is
   part of the design (see the zero-count chip rule) and part of the script.
7. **The negative is a step** whenever the change touches the vault or the model: §XII means an
   interpretive output must not be written, and §XIII means the form must be able to author it.
   "Open the note; it is byte-identical" is a verification step.
8. **Numbers, where the spec measured any.** If the spec claims *14 gaps on the reference vault*,
   the script says where the tester reads that 14 back.

## For an epic

An epic's `## How to verify` is the **end-to-end walkthrough of the finished capability** — the
single sitting that shows the whole thing working, in the order a user would meet it. Each
sub-issue carries its own narrower script for its own slice. If the epic's walkthrough cannot be
written, the sub-issues do not add up to a capability.
