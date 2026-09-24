import { TFile } from "obsidian";
import { log } from "architecture/monitoring/Logger";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { claimSubject } from "architecture/knowledge/claims";
import { applyClaim, claimTextsOf } from "application/claims";

/**
 * Stating what a note claims (#561, epic #558) — the impure half.
 *
 * Everything that decides is pure (`application/claims/claimEdit.ts`). This carries it out, and it
 * does so the only way this plugin is allowed to touch a vault: through `FrontmatterService`, inside
 * a write batch, so the sentence lands in the
 * [write record](../../../../docs/architecture/reversibility.md) and can be taken back like any
 * other write (#454).
 *
 * Two things it deliberately does **not** do:
 *
 * - **it never touches the body.** A claim is a property. `FileService`'s content doors are not
 *   reached from here, and a test asserts it.
 * - **it never records the sentence.** The judgement is the fact that *you stated a claim on this
 *   note* — a path, a subject id, an origin and a verdict (§XII). The claim's text is on the note,
 *   where you can read it, and nowhere else.
 */

/** What this note already says, for the box to arrive prefilled. Empty for a note with no claim. */
export function statedClaims(file: TFile): string[] {
    return claimTextsOf(FrontmatterService.instance(file).getAllFrontmatter());
}

/**
 * Write the sentence onto the note and record the verdict. Returns whether anything was written.
 *
 * A blank sentence, a path that is not a note, or a failed write all return `false` having changed
 * nothing — the caller says so on screen rather than this pretending it worked.
 */
export async function stateClaim(path: string, sentence: string): Promise<boolean> {
    const text = sentence?.trim() ?? "";
    if (text.length === 0) return false;

    const file = ObsidianApi.vault().getFileByPath(path);
    if (!(file instanceof TFile)) return false;

    try {
        return await withWriteBatch({ kind: "manual", ref: "claim", label: path }, async () => {
            let applied = false;
            await FrontmatterService.instance(file).update((frontmatter) => {
                applied = applyClaim(frontmatter, text);
            });
            if (!applied) return false;
            // Your own initiative, not a proposal you accepted: `origin: "human"` (#336).
            JudgementLog.getInstance().record({
                path,
                subject: claimSubject(path),
                origin: "human",
                verdict: "accepted",
            });
            return true;
        });
    } catch (error) {
        log.error("[claims] could not state the claim", error);
        return false;
    }
}
