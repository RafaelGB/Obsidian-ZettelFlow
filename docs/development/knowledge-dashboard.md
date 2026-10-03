# Knowledge dashboard

The knowledge dashboard was an "ops console" for your vault: three panels — **connectivity**,
**knowledge debt** and **today** — each carrying a recommended next action. It lived as its own view,
then inside the Health mode (#314).

> **Its panels are gone from the screen (#644).** The Health surface opens on
> **[Tend](slipbox-health-dashboard.md)** instead: one row per note that needs you, handed to
> [This note](this-note.md) on the fix. The *Show knowledge dashboard* command still exists and opens
> Tend. What each panel said now lives here:
>
> | Panel | Now |
> |---|---|
> | Connectivity (connected · orphaned · unresolved) | Tend's *Links nowhere* and *Nobody links it* chips; Obsidian itself shows unresolved links |
> | Knowledge debt (the 0–100 score) | not drawn — a score of your vault is a grade (§XII); its categories are Tend's chips |
> | Today (to process · contradictions · gaps · open questions) | Home (to process, gaps, open questions); This note's *In tension* and Cultivate (contradictions) |

## For scripts: `zf.knowledge.dashboard()`

The pure aggregate is still there, unchanged, for anyone who wants these numbers in a note of their
own: **[`zf.knowledge.dashboard()`](../api/ZettelFlowAPI.md)** (#350), callable from any Script
action, hook or dynamic selector.

`buildKnowledgeDashboard(model, judgements)` returns `{ panels: [{ key, metrics, recommendation }] }`:

- **connectivity** — `connected` (degree ≥ 1), `orphaned` (degree 0) and `unresolved` (a dangling
  outgoing link), each with a count and a percent of the vault;
- **debt** — the [knowledge-debt](../api/ZettelFlowAPI.md) score (`zf.knowledge.debt()` gives the
  categories);
- **today** — `process` (fleeting notes), `contradictions`, `connections` (the [gaps](morning-discovery.md)
  you have not ruled *not related*, #534) and `questions` (#167).

Every panel structurally carries a recommendation token and the count it concerns, so a dead panel is
impossible. It is a composition of existing State-layer functions and invents no metric; it reads the
in-memory knowledge model and writes nothing.
