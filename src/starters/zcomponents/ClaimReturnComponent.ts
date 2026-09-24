import { TFile } from "obsidian";
import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import { isPathExcluded, scopeExcludedPaths } from "architecture/knowledge/scope/knowledgeScope";
import { statedClaims } from "architecture/plugin/claims/statedClaim";
import { ClaimReturnModal } from "architecture/components/core/claims/ClaimReturnModal";
import type { JudgementOrigin } from "architecture/knowledge/judgement";
import ZettelFlow from "main";

/**
 * Opening the return by hand (#562, epic #558).
 *
 * A command, deliberately — and it is the one place in this epic where that is the right answer.
 * The return's **discovery** door is Home bringing a claim back to you (#563); this is the
 * re-entry point for someone who has decided to look at a claim again right now, which is exactly
 * what the palette is for (#496). The note's context menu already carries two ZettelFlow entries,
 * and a third for something the system is about to offer on its own would be clutter.
 *
 * It is gated on there being something to return to: no claim, no command.
 */
export class ClaimReturnComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "return-to-this-claim",
            name: t("claim_return_command"),
            checkCallback: (checking: boolean) => {
                const file = this.plugin.app.workspace.getActiveFile();
                if (!file || file.extension !== "md") return false;
                if (isPathExcluded(file.path, scopeExcludedPaths(this.plugin.settings))) return false;
                if (statedClaims(file).length === 0) return false;
                if (!checking) new ClaimReturnModal(this.plugin.app, file, "human").open();
                return true;
            },
        });
    }
}

/**
 * Open the return for a note, from wherever brought it back.
 *
 * `origin` is the honest half: `human` when you went looking for it, `derived` when the system
 * offered it (#563). The judgement record keeps the difference, because *I chose to revisit this*
 * and *I answered what I was asked* are not the same act.
 */
export function openReturn(plugin: ZettelFlow, path: string, origin: JudgementOrigin): void {
    const file = plugin.app.vault.getFileByPath(path);
    if (file instanceof TFile) new ClaimReturnModal(plugin.app, file, origin).open();
}
