# Open questions

Questions you raise while writing get buried in note bodies and are never revisited. **Open
questions** makes them first-class: it lists every **unanswered** question across the whole vault,
and for each one proposes the note most likely to answer it — so a question is a live thread, not a
dead end.

## Opening it

Run **"Show open questions"** from the command palette, or click **Open** next to *Open questions* in
**Settings → ZettelFlow → Zettelkasten toolkit**. The pane updates automatically (debounced) whenever
notes or links change.

## What counts as an open question

A question is a `question` **semantic relation** (#147): a note that points to a question note via
`question::`. A question is **open** when its target has **no incoming `supports`** edge — nothing
answers it yet. This is the vault-wide generalisation of the per-note
[find unanswered question](../actions/FindUnansweredQuestion.md) action. Questions come **only** from
the `question` relation — there is no NLP of note prose.

The pure query `openQuestions(model) → { path, askedBy }[]` lists each open question with the notes
that asked it, sorted deterministically. Read-only and offline.

## Answer detection

For each open question, `proposeAnswers(model, questionPath) → { path, score }[]` ranks candidate
answering notes by **graph-structural relatedness** — the same #154 metric as
[suggest link](../actions/SuggestLink.md) (co-citation weighted above bibliographic coupling). It
reuses that single metric (`rankRelatedScored`), which already excludes the question's askers and any
directly connected note, and it returns `[]` for a question that is unknown, already answered, or
shares no graph context. The top five candidates are shown per question.

## Read-only (for now)

The view **proposes** the `candidate --supports--> question` link but does **not** write it — it
lists and navigates only, so it adds no file-system capability. Create the edge yourself with the
[create semantic relation](../actions/CreateSemanticRelation.md) action; a one-click "link it"
affordance is a possible follow-up.

## Architecture

```
openQuestions(model)                              (pure, Obsidian-free, unit-tested)
  → [{ path, askedBy }]     every question target with no incoming `supports`

proposeAnswers(model, questionPath, { limit })    (pure, Obsidian-free, unit-tested)
  → [{ path, score }]       top-N by rankRelatedScored (#154), guards unknown/answered/context-less

OpenQuestionsView (ItemView) + OpenQuestionsComponent (show-open-questions command, no hotkey)
  reads the KnowledgeIndex model → openQuestions + proposeAnswers per question
  debounced metadataCache "resolved" + vault rename/delete listeners → recompute
  rows open notes via workspace.openLinkText; writes nothing
```
