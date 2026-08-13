import { PluginComponent, log } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { KnowledgeIndex } from "architecture/knowledge";
import { computeWeeklyReview } from "architecture/knowledge/review/weeklyReview";
import { renderWeeklyReviewMarkdown } from "application/notes/weeklyReviewMarkdown";
import { FileService } from "architecture/plugin";

/**
 * Registers the `generate-weekly-review` command (#160): computes the weekly review over the model
 * and writes/opens a dated review note. No default hotkey. Safe no-op (Notice) when the index isn't
 * ready; failures degrade to a Notice + `log.error`.
 */
export class GenerateWeeklyReviewComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "generate-weekly-review",
            name: t("weekly_review_command_name"),
            callback: () => void this.generate(),
        });
    }

    private async generate(): Promise<void> {
        const index = KnowledgeIndex.getInstance();
        if (index.status !== "ready") {
            new Notice(t("weekly_review_not_ready"));
            return;
        }
        try {
            const now = Date.now();
            const review = computeWeeklyReview(index.getModel(), now);
            const dateLabel = new Date(now).toISOString().slice(0, 10);
            const markdown = renderWeeklyReviewMarkdown(
                review,
                {
                    title: t("weekly_review_note_title"),
                    clean: t("weekly_review_clean"),
                    sections: {
                        created: t("weekly_review_section_created"),
                        orphans: t("weekly_review_section_orphans"),
                        forgotten: t("weekly_review_section_forgotten"),
                        important: t("weekly_review_section_important"),
                    },
                    actions: {
                        open: t("weekly_review_action_open"),
                        connect: t("weekly_review_action_connect"),
                        review: t("weekly_review_action_review"),
                    },
                },
                dateLabel
            );
            // Filename stays a stable English literal (the note's H1 is localized): a locale-dependent
            // path would break the same-day idempotent overwrite if the language changed.
            await FileService.writeFile(`_ZettelFlow/reviews/Weekly review ${dateLabel}.md`, markdown);
        } catch (error) {
            log.error(`[weekly-review] failed: ${error instanceof Error ? error.message : "unknown error"}`);
            new Notice(t("weekly_review_error"));
        }
    }
}
