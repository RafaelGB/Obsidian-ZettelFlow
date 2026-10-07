import { TFile, type App } from "obsidian";
import { log } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge";
import { scopeReasonName } from "architecture/components/core/scope/ruleSentence";
import {
    buildEvidenceMap,
    companionSections,
    connectCandidates,
    lifecycleStepper,
    nextStepCard,
    noteNeighbourhood,
    noteVitals,
    type NoteNeighbourhood,
} from "architecture/knowledge/state";
import { sourceKeyOf } from "application/claims";
import { rankResurfacedNotes } from "application/notes/resurfaceRanking";
import { buildResurfaceInputs } from "architecture/components/core/resurface/resurfaceInputs";
import { noteName, type CompanionScreen } from "./blocks/CompanionBlock";
import type { SubjectState } from "./companionSubject";

/**
 * The companion's one impure step (#640): read the index and the metadata cache for the shown note
 * and hand the pure State projections what they need. Every block renders from what this returns,
 * so the analysis runs once per refresh — it used to run in three renderers with three timers.
 */
export function buildCompanionScreen(app: App, subject: SubjectState): CompanionScreen {
    const path = subject.shown;
    if (!path) return { kind: "empty", last: subject.last };

    const index = KnowledgeIndex.getInstance();
    // Before the index is asked anything (#688): an excluded note is never an idea, so there is no
    // note to read — and it is known without waiting for the index to finish building.
    const reason = index.excludedBy(path);
    if (reason !== null) {
        // Named in the settings card's own words (#713): the rule's sentence, or ZettelFlow's folders.
        const rules = index.scopeRules();
        const also = index.alsoExcludedBy(path).map((at) => scopeReasonName({ kind: "rule", index: at }, rules));
        return { kind: "outside", path, by: scopeReasonName(reason, rules), also };
    }
    if (index.status !== "ready") return { kind: "indexing", path };

    try {
        const model = index.getModel();
        const idea = model.get(path);
        const file = app.vault.getAbstractFileByPath(path);
        const frontmatter = file instanceof TFile ? app.metadataCache.getFileCache(file)?.frontmatter ?? {} : {};

        // The same two analyses the Timeline mode mounted (FR-12), for the companion's note.
        const map = buildEvidenceMap(model, path);
        let nearby: ReturnType<typeof rankResurfacedNotes> = [];
        if (file instanceof TFile) {
            const inputs = buildResurfaceInputs(app);
            nearby = rankResurfacedNotes({
                active: inputs.buildActiveSignals(file),
                candidates: inputs.candidates,
                now: Date.now(),
                // A note you already link with is not forgotten (#643 decision 2): leaving the
                // neighbours out here keeps both the section and the graph's near ring for notes
                // you could still connect — and keeps the top five full of them.
                excludePaths: [path, ...model.outNeighborSet(path), ...model.inNeighborSet(path)],
            });
        }

        // Its own try: the graph failing must not take the rest of the companion with it.
        let neighbourhood: NoteNeighbourhood | null;
        try {
            neighbourhood = noteNeighbourhood(model, path, nearby);
        } catch (error) {
            log.error(`[NoteCompanion] could not read the links of ${path}: ${error instanceof Error ? error.message : String(error)}`);
            neighbourhood = null;
        }

        return {
            kind: "note",
            model: {
                path,
                title: idea?.title || noteName(path),
                vitals: noteVitals(model, path),
                steps: lifecycleStepper(idea?.state ?? "", index.recognisesState(frontmatter)).steps,
                sections: companionSections(map, nearby),
                next: nextStepCard(model, path),
                connect: connectCandidates(nearby, model.outNeighborSet(path)),
                revision: model.revision(),
                sourceKey: sourceKeyOf(frontmatter),
                linksOut: model.outNeighbors(path),
                neighbourhood,
            },
        };
    } catch (error) {
        log.error(`[NoteCompanion] could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
        return { kind: "error", path };
    }
}
