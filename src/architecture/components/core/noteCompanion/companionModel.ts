import { TFile, type App } from "obsidian";
import { log } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge";
import {
    buildEvidenceMap,
    companionSections,
    lifecycleStepper,
    noteVitals,
} from "architecture/knowledge/state";
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
                excludePaths: [path],
            });
        }

        return {
            kind: "note",
            model: {
                path,
                title: idea?.title || noteName(path),
                vitals: noteVitals(model, path),
                steps: lifecycleStepper(idea?.state ?? "", index.recognisesState(frontmatter)).steps,
                sections: companionSections(map, nearby),
            },
        };
    } catch (error) {
        log.error(`[NoteCompanion] could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
        return { kind: "error", path };
    }
}
