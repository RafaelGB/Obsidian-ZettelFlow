import { t } from "architecture/lang";
import { log } from "architecture/monitoring/Logger";
import { FileService } from "architecture/plugin/services/FileService";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { TFile } from "obsidian";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { renderCrystallized, renderReturn, type Crystallization } from "application/thinking/crystallize";

/**
 * The only door between the Lab and the vault (#468, epic #465).
 *
 * Everything that *decides* lives in `crystallize.ts`, which is pure. This carries it out, and it
 * does so through the ordinary write seam — so a crystallized note lands in the write record
 * (#453) and can be taken back like anything else (#454).
 *
 * Two rules it exists to enforce:
 *
 * - **The thoughts are not consumed.** Crystallizing does not delete, move or lock them. The same
 *   chaos can produce a second idea next month, and a door that eats the room behind it is not a
 *   door.
 * - **Nothing is automatic.** This function is called from an explicit user action and from
 *   nowhere else, which is the §XII verdict in its most literal form. A guardrail test asserts it.
 */

export interface CrystallizeRequest {
    plan: Crystallization;
    /** The text as you edited it. Never the proposal, unless you left it alone. */
    body: string;
    /** The title as you edited it. */
    title: string;
    folder: string;
}

/** Write the note. Returns its path, or nothing when it could not be written. */
export async function crystallize(request: CrystallizeRequest): Promise<string | undefined> {
    const name = request.title.trim() || t("crystallize_untitled");
    const path = `${request.folder ? `${request.folder}/` : ""}${safeName(name)}.md`;
    const content = renderCrystallized(
        request.plan,
        request.body,
        t("crystallize_born_from"),
        (count) => t("crystallize_and_more", count)
    );

    try {
        return await withWriteBatch({ kind: "manual", ref: "crystallize", label: name }, async () => {
            await FileService.createFile(path, content, false);
            // A human decided this chaos was an idea. That is the verdict §XII asks for, and it
            // is recorded in the same log every other verdict goes to — subject only, no content.
            JudgementLog.getInstance().record({
                path,
                subject: `crystallize:${request.plan.frozen.length}`,
                origin: "human",
                verdict: "accepted",
            });
            return path;
        });
    } catch (error) {
        log.error("[lab] could not crystallize", error);
        return undefined;
    }
}

/**
 * Put the thinking back into the note it was about (#474).
 *
 * An **append**, never a rewrite: whatever the note already says is untouched, and the write goes
 * through the recorded seam so it can be taken back (#454). Same verdict as a new note — a human
 * decided this thinking belonged there.
 */
export async function crystallizeInto(
    path: string,
    plan: Crystallization,
    body: string
): Promise<string | undefined> {
    const file = ObsidianApi.vault().getFileByPath(path);
    if (!(file instanceof TFile)) return undefined;
    const block = renderReturn(
        plan,
        body,
        t("crystallize_from_the_lab"),
        t("crystallize_born_from"),
        (count) => t("crystallize_and_more", count)
    );
    try {
        return await withWriteBatch({ kind: "manual", ref: "crystallize-back", label: path }, async () => {
            await FileService.appendTo(file, block);
            JudgementLog.getInstance().record({
                path,
                subject: `crystallize-back:${plan.frozen.length}`,
                origin: "human",
                verdict: "accepted",
            });
            return path;
        });
    } catch (error) {
        log.error("[lab] could not crystallize back", error);
        return undefined;
    }
}

/** A file name Obsidian will accept, from a title you wrote freely. */
function safeName(title: string): string {
    return title.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
}
