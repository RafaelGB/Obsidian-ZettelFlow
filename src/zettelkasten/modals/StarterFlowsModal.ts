import { c, log } from "architecture";
import { t } from "architecture/lang";
import {
    installStarterFlows,
    StarterFlowType,
} from "application/notes/starterFlowsService";
import { App, Modal, Notice, Setting } from "obsidian";

type LocaleKey = Parameters<typeof t>[0];

const FLOW_ROWS: ReadonlyArray<{
    type: StarterFlowType;
    name: LocaleKey;
    description: LocaleKey;
}> = [
    {
        type: "fleeting",
        name: "starter_flows_fleeting_name",
        description: "starter_flows_fleeting_description",
    },
    {
        type: "literature",
        name: "starter_flows_literature_name",
        description: "starter_flows_literature_description",
    },
    {
        type: "permanent",
        name: "starter_flows_permanent_name",
        description: "starter_flows_permanent_description",
    },
    {
        type: "moc",
        name: "starter_flows_moc_name",
        description: "starter_flows_moc_description",
    },
    {
        type: "literatureToPermanent",
        name: "starter_flows_literature_to_permanent_name",
        description: "starter_flows_literature_to_permanent_description",
    },
];

/**
 * Picker that lets the user choose which Zettelkasten starter flows to install.
 * Installation delegates to {@link installStarterFlows}, which never overwrites
 * existing files, and reports the outcome in a single notice.
 */
export class StarterFlowsModal extends Modal {
    private readonly selected = new Set<StarterFlowType>();

    constructor(app: App) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass(c("starter-flows-modal"));

        contentEl.createEl("h2", { text: t("starter_flows_modal_title") });
        contentEl.createEl("p", { text: t("starter_flows_modal_description") });

        for (const row of FLOW_ROWS) {
            new Setting(contentEl)
                .setName(t(row.name))
                .setDesc(t(row.description))
                .addToggle((toggle) => {
                    toggle.setValue(this.selected.has(row.type));
                    toggle.onChange((value) => {
                        if (value) {
                            this.selected.add(row.type);
                        } else {
                            this.selected.delete(row.type);
                        }
                    });
                });
        }

        new Setting(contentEl).addButton((btn) => {
            btn.setButtonText(t("starter_flows_install_button"))
                .setCta()
                .onClick(() => void this.install());
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async install(): Promise<void> {
        const types = Array.from(this.selected);
        if (types.length === 0) {
            new Notice(t("starter_flows_none_selected"));
            return;
        }

        try {
            const result = await installStarterFlows(this.app.vault, types);
            new Notice(
                t(
                    "starter_flows_summary_notice",
                    String(result.installed.length),
                    String(result.skipped.length)
                )
            );
            this.close();
        } catch (error) {
            log.error(`StarterFlowsModal: install failed — ${String(error)}`);
            new Notice(t("starter_flows_install_error"));
        }
    }
}
