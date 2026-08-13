import { App, MarkdownView, Notice, SuggestModal, TFile } from "obsidian";
import { PluginComponent, ObsidianApi, log } from "architecture";
import { FrontmatterService } from "architecture/plugin";
import { ConfirmModal } from "architecture/components/settings";
import { t } from "architecture/lang";
import {
    RelationEdge,
    listRelationEdges,
    removeRelationField,
} from "architecture/knowledge/relations/removeRelation";
import ZettelFlow from "main";

/** Picker over the active note's existing typed relations. */
class RelationPickerModal extends SuggestModal<RelationEdge> {
    constructor(
        app: App,
        private readonly edges: RelationEdge[],
        private readonly onPick: (edge: RelationEdge) => void
    ) {
        super(app);
        this.setPlaceholder(t("remove_relation_modal_title"));
    }

    getSuggestions(query: string): RelationEdge[] {
        const q = query.trim().toLowerCase();
        if (!q) return this.edges;
        return this.edges.filter(
            (edge) => edge.relationType.includes(q) || edge.target.toLowerCase().includes(q)
        );
    }

    renderSuggestion(edge: RelationEdge, el: HTMLElement): void {
        el.createDiv({ text: `${edge.relationType} → [[${edge.target}]]` });
    }

    onChooseSuggestion(edge: RelationEdge): void {
        this.onPick(edge);
    }
}

/**
 * Registers the "Remove a relation" command (#181): hidden unless a markdown note is active, it lists
 * the note's typed frontmatter relations, and — after a {@link ConfirmModal} that names the exact edge —
 * removes the chosen one via the pure {@link removeRelationField}. The only destructive relation op, so
 * it lives here as an Experience-layer command (not a wizard action) with a confirm guard. Offline.
 */
export class RemoveRelationComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        this.plugin.addCommand({
            id: "remove-relation",
            name: t("command_remove_relation"),
            checkCallback: (checking: boolean) => {
                const file = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file;
                if (!file) return false;
                if (!checking) this.pick(file);
                return true;
            },
        });
    }

    private pick(file: TFile): void {
        const frontmatter = FrontmatterService.instance(file).getFrontmatter();
        const edges = listRelationEdges(frontmatter);
        if (edges.length === 0) {
            new Notice(t("remove_relation_none"));
            return;
        }
        new RelationPickerModal(this.plugin.app, edges, (edge) => {
            new ConfirmModal(
                this.plugin.app,
                t("remove_relation_confirm_question", edge.relationType, edge.target, file.basename),
                t("remove_relation_confirm_accept"),
                t("remove_relation_confirm_cancel"),
                async () => this.remove(file, edge)
            ).open();
        }).open();
    }

    private async remove(file: TFile, edge: RelationEdge): Promise<void> {
        try {
            let changed = false;
            await ObsidianApi.fileManager().processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
                const result = removeRelationField(frontmatter, edge.relationType, edge.target);
                if (!result.changed) return;
                changed = true;
                // Apply the pure result onto the live frontmatter object processFrontMatter persists.
                if (edge.relationType in result.frontmatter) frontmatter[edge.relationType] = result.frontmatter[edge.relationType];
                else delete frontmatter[edge.relationType];
            });
            new Notice(changed ? t("remove_relation_removed") : t("remove_relation_noop"));
        } catch (error) {
            log.error("Error removing relation:", error);
            new Notice(t("remove_relation_error"));
        }
    }
}
