<!-- Generated from the API manifest. Run the reference test to regenerate. -->

# `zf` API — generated reference

Every member of the ZettelFlow script API, generated from the plugin's own manifest. This is the
same description the editor's completions and the generated `zettelflow.d.ts` read, so it cannot
fall behind the code.

For what the surfaces are, which variables each one binds, and worked recipes, see the
[API reference](ZettelFlowAPI.md) and the [cookbook](cookbook.md).

## Knowledge — `zf.knowledge`

| Member | Signature | What it answers |
|---|---|---|
| `agency` | `(path: string) => AgencySignals` | Counts of the verdicts you have given on one idea. Never a score. |
| `balance` | `() => KnowledgeBalance` | How the vault is composed across fleeting, literature and permanent ideas. |
| `cultivationQueue` | `(exclude?: string[], limit?: number) => string[]` | Ideas most worth thinking about next. |
| `dashboard` | `() => DashboardModel` | The headline metrics of the whole vault. |
| `debt` | `() => KnowledgeDebt` | Ideas carrying structural debt — orphans, stubs, unsourced claims. |
| `discoveries` | `(opts?: FindDiscoveriesOptions) => Discovery[]` | Unlinked pairs of ideas that keep appearing together. |
| `evidence` | `(path: string) => EvidenceMap` | What supports and what contradicts one idea. |
| `health` | `() => HealthResult` | Notes classified by slipbox health. |
| `judgements` | `(path: string) => Judgement[]` | Every verdict you recorded about one idea. |
| `lastJudgement` | `(path: string) => Judgement \| null` | The most recent verdict on one idea, or null. |
| `map` | `(opts?: BuildKnowledgeMapOptions) => KnowledgeMap` | Clusters and hubs of the idea graph. |
| `model` | `() => KnowledgeModel` | The raw idea graph, for questions no projection answers. |
| `neighbors` | `(path: string) => ConceptNeighbors` | What sits next to one idea in the graph, by relation type. |
| `openQuestions` | `() => OpenQuestion[]` | Questions recorded in the vault that nothing has answered yet. |
| `outline` | `(selectedPaths: string[], opts?: DeriveOutlineOptions) => Outline` | An outline derived from a set of notes. |
| `proposeAnswers` | `(path: string) => AnswerProposal[]` | Existing notes that could answer an open question. |
| `query` | `(source: string, now?: number) => GraphQueryResult` | Run a graph query from a note against the model. |
| `ready` | `() => boolean` | Whether the knowledge index has finished building. |
| `readyToCultivate` | `() => number` | How many ideas are ready to be worked on. |
| `reasoningPaths` | `(start: string, opts?: ReasoningPathsOptions) => Path[]` | Chains of reasoning leading out of an idea. |
| `recommendations` | `() => KnowledgeRecommendation[]` | What to do next, ranked — the same list the Home surface shows. |
| `review` | `(now?: number, windowDays?: number) => WeeklyReview` | What changed, stalled and matured over a recent window. |
| `unexamined` | `(opts?: { limit?: number }) => UnexaminedIdea[]` | Ideas that gained structure but carry no judgement of yours. |

## AI — `zf.ai`

| Member | Signature | What it answers |
|---|---|---|
| `available` | `() => boolean` | Whether an AI provider is enabled and configured. |
| `propose` | `(prompt: string, opts?: { subject?: string; path?: string }) => Promise<string \| null>` | Ask the configured model, show the answer as a proposal, and return what you accepted — or null if you rejected or dismissed it. |

## Vault — `zf.internal.vault`

| Member | Signature | What it answers |
|---|---|---|
| `obtainFilesFrom` | `(folder: TFolder, extensions?: string[]) => TFile[]` | Every file under a folder, recursively, filtered by extension and sorted by name. |
| `resolveTFolder` | `(path: string) => TFolder` | Resolve a vault path to its folder, walking up until one exists. |

!!! info "Your own scripts and integrations are not listed here"
    `zf.internal.user` holds the functions from your JS-library folder and `zf.external`
    holds Dataview and Templater when installed — all resolved in your vault, not in the
    plugin. The editor completes them from the live object, and the generated
    `zettelflow.d.ts` includes them by name.
