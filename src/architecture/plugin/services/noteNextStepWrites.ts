import { TFile, type App } from "obsidian";
import { log } from "architecture/monitoring/Logger";
import {
    DEFAULT_STATE_PROPERTY,
    LifecycleStateSchema,
    proposedNextState,
    type LifecycleState,
} from "architecture/knowledge/lifecycle";
import { addRelationValue } from "architecture/knowledge/relations";
import { buildLifecycleAliases } from "architecture/knowledge/lifecycleAliases";
import type { Judgement } from "architecture/knowledge/judgement";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { CultivationService } from "./CultivationService";
import { FileService } from "./FileService";
import { FrontmatterService } from "./FrontmatterService";
import { StateTransitionService } from "./StateTransitionService";
import { inOwnBatch, linkTextFor, type LinkResult } from "./recordedLink";

/**
 * The writes behind This note's next-step card (#641, D4).
 *
 * Every one is a click, made into **the companion's note** (never the editor with the cursor), in
 * a batch of its own so the inline Undo takes back exactly it, and silent — the card says what
 * happened. A note that is gone by the time you confirm writes nothing and says so (FR-19).
 */

/** What the plugin settings say about where the state lives. */
export interface StateSettingsHost {
    settings?: { lifecycle?: { stateProperty?: string } };
}

export interface AdvanceResult extends LinkResult {
    /** The verdict the promotion recorded, so undoing it can withdraw that one. */
    judgement?: Judgement;
    /** The state it moved to. */
    to?: LifecycleState;
}

function fileFor(app: App, path: string): TFile | null {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return file;
    log.error("[NoteCompanion] next-step target is missing", path);
    return null;
}

/** Add a reference to the note's source property, keeping the ones it has. */
export async function addSourceTo(app: App, path: string, text: string): Promise<LinkResult> {
    if (!text.trim() || !fileFor(app, path)) return { ok: false };
    return inOwnBatch("note-source", path, () => CultivationService.getInstance().addSource(app, path, text, { quiet: true }));
}

/**
 * Mark one of the note's links as an example of it: `example: [[X]]` in its properties (#147). When
 * `example:` already holds plain text, that value is left exactly as it is and an inline
 * `example:: [[X]]` goes in the body instead (AC-8).
 */
export async function markExample(app: App, path: string, targetPath: string): Promise<LinkResult> {
    const file = fileFor(app, path);
    if (!file) return { ok: false };
    const name = linkTextFor(app, path, targetPath);
    const service = FrontmatterService.instance(file);
    const placement = addRelationValue({ ...service.getAllFrontmatter() }, "example", name).placement;
    // Already an example: nothing to write, and the card must not say it marked one.
    if (placement === "none") return { ok: true, written: false };
    return inOwnBatch("note-example", path, async () => {
        try {
            if (placement === "inline") {
                await FileService.appendTo(file, `example:: [[${name}]]`);
            } else {
                await service.update((frontmatter) => {
                    const next = addRelationValue(frontmatter, "example", name);
                    if (next.placement === "frontmatter") frontmatter.example = next.frontmatter.example;
                });
            }
            return true;
        } catch (error) {
            log.error("[NoteCompanion] marking an example failed", error);
            return false;
        }
    });
}

/**
 * Move the note to the state Cultivate would propose (one home: `proposedNextState`), through the
 * validated transition, which records the promotion as your decision (#581). Origin `derived`: the
 * card proposed it and you took it, exactly as in Cultivate.
 */
export async function advanceTo(app: App, host: StateSettingsHost | undefined, path: string): Promise<AdvanceResult> {
    const file = fileFor(app, path);
    if (!file) return { ok: false };
    const stateProperty = host?.settings?.lifecycle?.stateProperty || DEFAULT_STATE_PROPERTY;
    const schema = new LifecycleStateSchema(stateProperty, buildLifecycleAliases());
    const accessor = FrontmatterService.instance(file);
    const current = schema.parse({ [stateProperty]: accessor.getProperty(stateProperty) });
    const target = proposedNextState(current);
    if (!target) return { ok: false };

    let judgement: Judgement | undefined;
    const result = await inOwnBatch("note-advance", path, () =>
        StateTransitionService.getInstance().transition(accessor, stateProperty, schema, target, path, "derived", {
            quiet: true,
            recorded: (stored) => (judgement = stored),
        })
    );
    return result.ok ? { ...result, judgement, to: target } : result;
}

/** Undoing a promotion takes its verdict back too, so the story never tells what was undone (Q1). */
export function withdrawPromotion(judgement: Judgement): void {
    JudgementLog.getInstance().remove(judgement);
}
