import { TFile, TFolder, type App, type TAbstractFile } from "obsidian";
import { log } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge";
import {
    readingPathOf,
    readingPathOptions,
    selectionPath,
    type ReadingPath,
    type ReadingPathInputs,
    type ReadingPathOption,
} from "architecture/knowledge/state";
import { rankResurfacedNotes } from "application/notes/resurfaceRanking";
import { buildResurfaceInputs } from "architecture/components/core/resurface/resurfaceInputs";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { MoveLog } from "architecture/plugin/thinking/MoveLog";
import type { ReaderKind } from "./readerContract";

/**
 * The Reader's one impure step for choosing a path (#669): read what the model does not hold —
 * the notes near the seed you never linked (the resurface ranking) and when each note was first
 * worked on (decisions and moves) — and hand it to the pure generators. Reads only.
 */

/** A note on its own, for the moment before the index is built. */
function alone(seed: string): ReadingPath {
    return { seed, kind: "around", chapters: [{ path: seed, role: "context" }] };
}

function modelOrNull() {
    const index = KnowledgeIndex.getInstance();
    return index.status === "ready" ? index.getModel() : null;
}

/** What the generators cannot see in the model, for one seed. Never throws. */
export function pathInputs(app: App, seed: string): ReadingPathInputs {
    const model = modelOrNull();
    const inputs: ReadingPathInputs = {};
    try {
        const file = app.vault.getAbstractFileByPath(seed);
        if (model && file instanceof TFile) {
            const resurface = buildResurfaceInputs(app);
            inputs.near = rankResurfacedNotes({
                active: resurface.buildActiveSignals(file),
                candidates: resurface.candidates,
                now: Date.now(),
                excludePaths: [seed, ...model.outNeighborSet(seed), ...model.inNeighborSet(seed)],
            }).map((row) => row.path);
        }
    } catch (error) {
        log.debug(`[Reader] no near notes for ${seed}: ${String(error)}`);
    }
    try {
        const firstSeen = new Map<string, number>();
        const note = (path: string, at: number) => {
            const known = firstSeen.get(path);
            if (known === undefined || at < known) firstSeen.set(path, at);
        };
        for (const judgement of JudgementLog.getInstance().entries()) note(judgement.path, judgement.at);
        for (const move of MoveLog.getInstance().all()) note(move.subject, move.at);
        inputs.firstSeen = firstSeen;
    } catch (error) {
        log.debug(`[Reader] no first-seen dates: ${String(error)}`);
    }
    return inputs;
}

/** The ways through a note the chooser offers. Around alone until the index is ready. */
export function optionsFor(app: App, seed: string): ReadingPathOption[] {
    const model = modelOrNull();
    if (!model) return [{ kind: "around", path: alone(seed) }];
    return readingPathOptions(model, seed, pathInputs(app, seed));
}

/** Rebuild the reading the view was opened with. A picked set keeps its own order. */
export function pathFor(app: App, seed: string, kind: ReaderKind = "around", paths?: readonly string[]): ReadingPath {
    const model = modelOrNull();
    if (!model) return paths && paths.length > 0 ? { seed, kind: "selection", chapters: paths.map((path) => ({ path, role: "context" as const })) } : alone(seed);
    if (kind === "selection" && paths && paths.length > 0) {
        // The order was settled when the set was picked; only the roles are read again.
        const roles = new Map((selectionPath(model, paths)?.chapters ?? []).map((chapter) => [chapter.path, chapter.role]));
        return { seed, kind, chapters: paths.map((path) => ({ path, role: roles.get(path) ?? "context" })) };
    }
    return readingPathOf(model, seed, kind === "selection" ? "around" : kind, pathInputs(app, seed));
}

/** Notes you picked, in the order their links suggest — `null` when none is a note the model knows. */
export function selectionFor(paths: readonly string[]): ReadingPath | null {
    const model = modelOrNull();
    if (!model) return null;
    return selectionPath(model, paths);
}

/** Every markdown note under a folder, at any depth — what *Read this folder* reads. */
export function notesUnder(folder: TFolder): string[] {
    const out: string[] = [];
    const walk = (node: TAbstractFile) => {
        if (node instanceof TFile) {
            if (node.extension === "md") out.push(node.path);
        } else if (node instanceof TFolder) {
            node.children.forEach(walk);
        }
    };
    walk(folder);
    return out;
}
