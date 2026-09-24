import { TFile } from "obsidian";
import { log } from "architecture/monitoring/Logger";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { claimSubject } from "architecture/knowledge/claims";
import type { Judgement, JudgementOrigin } from "architecture/knowledge/judgement";
import { applyClaim, removeClaim, type ReturnAnswer } from "application/claims";

/**
 * What an answer to a return does (#562, epic #558) — the impure half.
 *
 * Three answers, three effects, and the interesting one is the third. *I no longer hold this* takes
 * a sentence off a note, and a sentence you wrote and then deleted is the worst thing this feature
 * could destroy — the Lab keeps what is *decided against* for exactly that reason. So a withdrawn
 * claim goes into the thinking space **first**, as a thought carrying the note it came from, and
 * only then leaves the note. If the thinking space cannot take it, nothing is removed at all.
 *
 * The effects are injected so those rules can be proved without a vault. The default writer is the
 * ordinary seam: every write inside a batch, and the verdict in the record with no text in it.
 */

/** The three effects an answer can have. Injected, so the ordering rules above are testable. */
export interface ReturnWriter {
    writeClaim(path: string, sentence: string): Promise<boolean>;
    removeClaimAt(path: string, index: number): Promise<boolean>;
    writeThought(text: string, about: string): Promise<boolean>;
    record(entry: Omit<Judgement, "at">): void;
}

export interface ReturnRequest {
    path: string;
    /** What the note said — the sentence being answered. */
    stored: string;
    claimIndex: number;
    /** `derived` when the system brought the claim back, `human` when you opened the return. */
    origin: JudgementOrigin;
    answer: ReturnAnswer;
    /** The new sentence. Only read for *it says this now*. */
    sentence?: string;
}

async function editFrontmatter(path: string, edit: (frontmatter: Record<string, unknown>) => boolean): Promise<boolean> {
    const file = ObsidianApi.vault().getFileByPath(path);
    if (!(file instanceof TFile)) return false;
    let done = false;
    await FrontmatterService.instance(file).update((frontmatter) => {
        done = edit(frontmatter);
    });
    return done;
}

/** The ordinary seam: properties through `FrontmatterService`, thoughts through the `ThoughtStore`. */
export const vaultWriter: ReturnWriter = {
    writeClaim: (path, sentence) =>
        withWriteBatch({ kind: "manual", ref: "claim-return", label: path }, () =>
            editFrontmatter(path, (frontmatter) => applyClaim(frontmatter, sentence))
        ),
    removeClaimAt: (path, index) =>
        withWriteBatch({ kind: "manual", ref: "claim-withdrawn", label: path }, () =>
            editFrontmatter(path, (frontmatter) => removeClaim(frontmatter, index))
        ),
    writeThought: async (text, about) => {
        const store = ThoughtStore.getInstance();
        if (!store.folder()) return false;
        return (await store.write(text, { about })) !== undefined;
    },
    record: (entry) => JudgementLog.getInstance().record(entry),
};

/**
 * Carry out one answer. Returns whether it happened — a caller says so on screen rather than this
 * pretending it did.
 */
export async function answerReturn(request: ReturnRequest, writer: ReturnWriter = vaultWriter): Promise<boolean> {
    const verdict = {
        path: request.path,
        subject: claimSubject(request.path),
        origin: request.origin,
        verdict: request.answer,
    };

    try {
        if (request.answer === "confirmed") {
            // It still says this. Nothing is written to the vault: agreeing with yourself is not an
            // edit, and the fact that you looked again is the whole of what happened.
            writer.record(verdict);
            return true;
        }

        if (request.answer === "modified") {
            const sentence = request.sentence?.trim() ?? "";
            if (sentence.length === 0) return false;
            if (!(await writer.writeClaim(request.path, sentence))) return false;
            writer.record(verdict);
            return true;
        }

        // Withdrawn. The sentence survives first, then the note lets it go.
        if (!(await writer.writeThought(request.stored, request.path))) return false;
        if (!(await writer.removeClaimAt(request.path, request.claimIndex))) return false;
        writer.record(verdict);
        return true;
    } catch (error) {
        log.error("[claims] could not answer the return", error);
        return false;
    }
}
