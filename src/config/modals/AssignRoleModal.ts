import { App, Modal, Notice, Setting, TFile } from "obsidian";
import ZettelFlow from "main";
import { c, log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { FolderSuggest } from "architecture/settings";
import { FLOW_ROLE_LABEL_KEY, flowFolders, type FlowRole } from "architecture/plugin/canvas/flowRole";
import { planRoleChange, type RolePlan, type RoleProblem } from "config/roles/assignRole";

/**
 * Literal keys per case: a composed `t()` key is invisible to the unrendered-strings guardrail
 * (#320), which is how keys rot.
 */
const PROBLEM_KEY: Record<RoleProblem, string> = {
    "folder-required": "assign_role_problem_folder_required",
    "no-home": "assign_role_problem_no_home",
    already: "assign_role_problem_already",
};

/** How the canvas would run once it holds the role. */
const RUNS_KEY: Record<FlowRole, string> = {
    create: "assign_role_runs_create",
    edit: "assign_role_runs_edit",
    folder: "assign_role_runs_folder",
    event: "assign_role_runs_event",
    hook: "assign_role_runs_hook",
    none: "assign_role_runs_none",
};

type LocaleKey = Parameters<typeof t>[0];

/**
 * Giving a canvas a role, with what that costs stated first (#435, epic #434).
 *
 * Two of the roles displace whoever held them and two of them **move a file**. Neither is
 * something to do on a dropdown's `change` event: the plan is computed by the pure planner, shown
 * in the words of the change ("*Create.canvas* stops being the one the ribbon opens; it stays as a
 * file"), and only then applied — the second, explicit click.
 */
export class AssignRoleModal extends Modal {
    private folder = "";

    constructor(
        app: App,
        private plugin: ZettelFlow,
        private canvasPath: string,
        private role: FlowRole,
        private onDone: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        this.setTitle(t("assign_role_title"));
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createDiv({ cls: c("assign-role-subject") }, (el) => {
            el.createSpan({ text: this.canvasPath });
            el.createSpan({
                cls: c("assign-role-target"),
                text: t(FLOW_ROLE_LABEL_KEY[this.role] as LocaleKey),
            });
        });

        // The folder role is the only one that needs an answer: which folder it automates.
        if (this.role === "folder") {
            new Setting(contentEl)
                .setName(t("assign_role_folder"))
                .setDesc(t("assign_role_folder_description"))
                .addSearch((search) => {
                    new FolderSuggest(search.inputEl);
                    search
                        .setPlaceholder(t("assign_role_folder"))
                        .setValue(this.folder)
                        .onChange((value) => {
                            this.folder = value;
                            this.renderConsequences(consequences);
                        });
                });
        }

        const consequences = contentEl.createDiv({ cls: c("assign-role-consequences") });
        this.renderConsequences(consequences);

        new Setting(contentEl)
            .addButton((button) =>
                button
                    .setButtonText(t("assign_role_apply"))
                    .setCta()
                    .onClick(() => void this.apply())
            )
            .addButton((button) => button.setButtonText(t("assign_role_cancel")).onClick(() => this.close()));
    }

    /** What pressing apply would do, in the words of the change. */
    private renderConsequences(host: HTMLElement): void {
        host.empty();
        const plan = this.plan();

        if (plan.problem) {
            host.createDiv({
                cls: c("assign-role-problem"),
                text: t(PROBLEM_KEY[plan.problem] as LocaleKey),
            });
            return;
        }
        if (plan.displaces) {
            host.createDiv({
                cls: c("assign-role-line"),
                text: t("assign_role_displaces", plan.displaces),
            });
        }
        if (plan.move) {
            host.createDiv({ cls: c("assign-role-line"), text: t("assign_role_move", plan.move.to) });
        }
        host.createDiv({ cls: c("assign-role-line"), text: t(RUNS_KEY[this.role] as LocaleKey) });
    }

    private plan(): RolePlan {
        return planRoleChange({
            path: this.canvasPath,
            role: this.role,
            folders: flowFolders(this.plugin.settings),
            folder: this.folder,
        });
    }

    private async apply(): Promise<void> {
        const plan = this.plan();
        if (plan.problem) return;
        try {
            if (plan.settings) {
                this.plugin.settings[plan.settings.key] = plan.settings.value;
                await this.plugin.saveSettings();
            }
            if (plan.move) {
                await this.move(plan.move.from, plan.move.to);
            }
            new Notice(t("assign_role_done"));
            this.onDone();
            this.close();
        } catch (error) {
            log.error("[roles] could not give that canvas its role", error);
            new Notice(t("assign_role_failed"));
        }
    }

    /** Move through `FileManager`, so every link to the canvas follows it. */
    private async move(from: string, to: string): Promise<void> {
        const file = ObsidianApi.vault().getFileByPath(from);
        if (!(file instanceof TFile)) throw new Error(`Canvas ${from} not found`);
        const parent = to.slice(0, to.lastIndexOf("/"));
        if (parent && !ObsidianApi.vault().getFolderByPath(parent)) {
            await ObsidianApi.vault().createFolder(parent);
        }
        await this.plugin.app.fileManager.renameFile(file, to);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
