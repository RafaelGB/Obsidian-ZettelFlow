import { Notice, Setting, setIcon, TFile } from "obsidian";
import { StepBuilderInfo, StepSettings } from "zettelkasten";
import { StepTitleHandler } from "./handlers/StepTitleHandler";
import { t } from "architecture/lang";
import { FileService, FrontmatterService, VaultStateManager } from "architecture/plugin";
import { StepBuilderMapper } from "zettelkasten";
import { mergeStepSettingsIntoFrontmatter, PHASE_LABEL_KEY } from "zettelkasten/phases";
import { ObsidianApi, c, log } from "architecture";
import { canvas } from "architecture/plugin/canvas";
import { AbstractStepModal } from "./AbstractStepModal";
import ZettelFlow from "main";
import { InstalledStepEditorModal } from "./InstalledStepEditorModal";
import { UsedInstalledStepsModal } from "application/community";
import { ConfirmModal } from "architecture/components/settings";
import { stepIdentity, type SummaryFragment } from "./handlers/stepIdentity";
import {
    isGroupExpanded,
    STEP_GROUPS,
    STEP_GROUP_HEADING,
    type StepGroupId,
} from "./handlers/stepGroups";
import { BLOCK_LABEL_KEY } from "architecture/plugin/workflow";
import CanvasHelper from "architecture/plugin/canvas/extensions/utils/CanvasHelper";
import type { Flow, FlowNode } from "architecture/plugin/canvas";
import {
    moveExit,
    orderExits,
    planMigration,
    pruneExits,
    setDefaultExit,
    type StepExit,
    type StepExits,
} from "application/notes/stepExits";
import { describeOption } from "application/notes/optionDescription";
import { ConditionEditorModal } from "./ConditionEditorModal";

export class StepBuilderModal extends AbstractStepModal {
    info: StepBuilderInfo;
    /** The section around each group body, so an empty one can be removed whole (#425). */
    private groupSections: Partial<Record<StepGroupId, HTMLElement>> = {};
    mode = "edit";
    builder = "ribbon";
    chain = new StepTitleHandler();

    constructor(
        private plugin: ZettelFlow,
        private partialInfo?: Partial<Omit<StepBuilderInfo, "containerEl">>
    ) {
        super(plugin.app);
        this.info = this.getBaseInfo();
    }

    getPlugin(): ZettelFlow {
        return this.plugin;
    }

    setMode(mode: "edit" | "create" | "embed"): StepBuilderModal {
        this.mode = mode;
        return this;
    }

    setBuilder(builder: "ribbon" | "editor"): StepBuilderModal {
        this.builder = builder;
        return this;
    }

    setNodeId(nodeId: string): StepBuilderModal {
        this.info.nodeId = nodeId;
        return this;
    }

    onOpen(): void {
        VaultStateManager.INSTANCE.freeze();
        this.modalEl.addClass(c("modal"));
        // Header with title and subtitle with the mode
        const navbar = this.info.contentEl.createDiv({ cls: c("modal-navbar") });

        // The heading names the step, not the product: on a canvas of fifteen nodes you used to
        // find out what you had opened three fields down (#424).
        const identity = stepIdentity(this.info);
        navbar.createEl("h2", {
            text: identity.title ?? t(identity.titleKey as LocaleKey),
        });

        // Separator
        navbar.createSpan();

        const navbarButtonGroup = navbar.createDiv({ cls: c("navbar-button-group") });

        // Add a button to save the step into the clipboard
        const clipboardButton = navbarButtonGroup.createEl("button", {
            placeholder: t("step_builder_copy_button"),
            title: t("step_builder_copy_button_title")
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", () => {
                void (async () => {
                    // Step 1 - save the step internally
                    const stepSettings = StepBuilderMapper.StepBuilderInfo2CommunityStepSettings(this.info, {
                        title: t("step_template_default_title"),
                        description: t("step_template_default_description")
                    });
                    // Step 2 - Copy the step to the clipboard
                    void navigator.clipboard.writeText(JSON.stringify(stepSettings, null, 2))
                    // Step 3 - Save the step to internal clipboard
                    this.plugin.settings.communitySettings.clipboardTemplate = stepSettings;
                    await this.plugin.saveSettings();
                    new Notice(t("step_copied_notice"));
                })();
            });

        });
        setIcon(clipboardButton.createDiv(), "clipboard-copy");

        // Add a button to apply an installed step template
        const useTemplateButton = navbarButtonGroup.createEl("button", {
            placeholder: t("step_builder_apply_button"),
            title: t("step_builder_apply_button_title")
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", () => {
                new ConfirmModal(
                    this.plugin.app,
                    t("confirm_apply_template_step"),
                    t("confirm_apply_template_button"),
                    t("confirm_cancel_button"),
                    async () => {
                        // Step 1 - Open the modal to select the step
                        log.info("info before", this.info);
                        new UsedInstalledStepsModal(this.plugin, (step) => {
                            // Step 2 - Apply the step to the current step
                            this.partialInfo = {
                                ...this.info,
                                ...StepBuilderMapper.StepSettings2PartialStepBuilderInfo(step)
                            }
                            this.info = this.getBaseInfo();
                            log.info("info after", this.info);
                            // Step 3 - Refresh the modal
                            this.refresh();
                        }).open();
                    }
                ).open();
            });

        });
        setIcon(useTemplateButton.createDiv(), "pen");

        // Add a button to use this step as source for a installed step
        const saveButton = navbarButtonGroup.createEl("button", {
            placeholder: t("step_builder_save_template_button"),
            title: t("step_builder_save_template_button_title")
        }, el => {
            el.addClass("mod-cta");
            el.addEventListener("click", () => {

                new ConfirmModal(
                    this.plugin.app,
                    t("confirm_add_step"),
                    t("confirm_add_button"),
                    t("confirm_cancel_button"),
                    async () => {
                        // Step 1 - save the step internally
                        const stepSettings = StepBuilderMapper.StepBuilderInfo2CommunityStepSettings(this.info, {
                            title: t("step_template_default_title"),
                            description: t("step_template_default_description"),
                            id: this.info.nodeId
                        });
                        if (this.plugin.settings.installedTemplates.steps[stepSettings.id]) {
                            new Notice(t("step_template_already_exists"));
                        }
                        this.plugin.settings.installedTemplates.steps[stepSettings.id] = stepSettings;
                        void this.plugin.saveSettings();
                        // Step 2 - Open the modal to edit the step
                        new InstalledStepEditorModal(this.plugin, stepSettings).open();
                    }
                ).open();
            });

        });
        setIcon(saveButton.createDiv(), "book-marked");

        this.renderIdentity(identity);
        this.buildGroups();

        this.chain.handle(this);

        // A handler that skipped itself must not leave a heading behind (#425 FR-4).
        // The body template is a step's template wherever the step lives: a step note keeps it in
        // the file, an inline box in its own settings (#426). It used to exist only for the former,
        // which made the path #400 wants to promote the poorest one.
        this.setupBody();
        // Where the flow goes next belongs to the step, not to the arrows drawing it (#427).
        this.setupExits();

        // Only after everything has rendered: a question nobody answered leaves no heading (#425).
        this.pruneEmptyGroups();
    }

    /**
     * The five questions the editor answers (#425). The chain still owns every field; this only
     * decides where each one lands, so a step's settings read as *what does it ask · what does it
     * write · when does it appear · where does it go · how is it shown*.
     */
    private buildGroups(): void {
        const { contentEl } = this.info;
        for (const group of STEP_GROUPS) {
            const section = contentEl.createDiv({ cls: c("step-group") });
            const expanded = isGroupExpanded(group, this.info);

            const heading = section.createEl("button", {
                cls: c("step-group-heading"),
                text: t(STEP_GROUP_HEADING[group] as LocaleKey),
                attr: { "aria-expanded": String(expanded), type: "button" },
            });
            const body = section.createDiv({ cls: c("step-group-body") });
            body.toggleClass(c("is-hidden"), !expanded);
            heading.addEventListener("click", () => {
                const open = heading.getAttribute("aria-expanded") !== "true";
                heading.setAttribute("aria-expanded", String(open));
                body.toggleClass(c("is-hidden"), !open);
            });

            this.groups[group] = body;
            this.groupSections[group] = section;
        }
    }

    /** Remove a question nobody answered — an empty heading is noise, not structure. */
    private pruneEmptyGroups(): void {
        for (const group of STEP_GROUPS) {
            const body = this.groups[group];
            if (body && body.childElementCount === 0) {
                this.groupSections[group]?.remove();
                delete this.groups[group];
            }
        }
    }

    /** What this step is and what it does — stated, never editable (#424). */
    private renderIdentity(identity: ReturnType<typeof stepIdentity>): void {
        const { contentEl } = this.info;
        const row = contentEl.createDiv({ cls: c("step-identity") });

        row.createSpan({ cls: c("step-identity-kind"), text: t(identity.kindKey as LocaleKey) });
        row.createSpan({
            cls: c("step-identity-block"),
            text: t(BLOCK_LABEL_KEY[identity.block]),
        });
        if (identity.phase) {
            row.createSpan({
                cls: c("step-identity-phase"),
                text: t(PHASE_LABEL_KEY[identity.phase]),
            });
        }
        for (const badge of identity.badges) {
            row.createSpan({ cls: c("step-identity-badge"), text: t(badge as LocaleKey) });
        }

        if (identity.canReveal && this.info.nodeId) {
            const nodeId = this.info.nodeId;
            const reveal = row.createEl("button", {
                cls: c("step-identity-reveal"),
                text: t("step_identity_reveal"),
                attr: { "aria-label": t("step_identity_reveal") },
            });
            reveal.addEventListener("click", () => {
                if (!CanvasHelper.revealNode(this.plugin, nodeId)) {
                    new Notice(t("step_identity_reveal_failed"));
                }
            });
        }

        contentEl.createDiv({
            cls: c("step-identity-summary"),
            text: identity.summary.map((fragment) => describe(fragment)).join(" · "),
        });
    }

    refresh(): void {
        this.contentEl.empty();
        this.onOpen();
    }

    private setupBody(): void {
        const contentEl = this.groupEl("writes");
        const textarea = contentEl.createEl("textarea", {
            cls: c("step-builder-body"),
            placeholder: t("step_builder_body_template_placeholder"),
        });
        textarea.value = this.info.body ?? "";
        textarea.addEventListener("input", () => {
            this.info.body = textarea.value;
        });

        // The tokens are insertable rather than documented: a template language you have to
        // remember is a capability you have to look up (#426).
        const tokens = contentEl.createDiv({ cls: c("step-builder-tokens") });
        tokens.createSpan({ text: t("step_builder_body_tokens") });
        const INSERTABLE: [string, LocaleKey][] = [
            ["{{title}}", "step_builder_body_token_title"],
            ["{{date}}", "step_builder_body_token_date"],
            ["{{canvas.name}}", "step_builder_body_token_canvas"],
        ];
        for (const [token, labelKey] of INSERTABLE) {
            const button = tokens.createEl("button", {
                cls: c("step-builder-token"),
                text: token,
                attr: { type: "button", title: t(labelKey), "aria-label": t(labelKey) },
            });
            button.addEventListener("click", () => {
                const at = textarea.selectionStart ?? textarea.value.length;
                textarea.value = textarea.value.slice(0, at) + token + textarea.value.slice(at);
                this.info.body = textarea.value;
                textarea.focus();
                textarea.setSelectionRange(at + token.length, at + token.length);
            });
        }

        // Load from file when editing a step note (an inline box keeps its body in its settings).
        if (this.info.body === undefined && this.mode === "edit") {
            void this.loadBodyFromFile(textarea);
        }
    }

    /**
     * Where does it go next (#427): one row per arrow leaving this step — what it says, when it is
     * open, in what order, and which one you land on. Only a step drawn on a canvas has arrows, so
     * a step note opened from its own file shows no section rather than an empty promise; the
     * arrow's own popup on the canvas is the second door into the same three questions.
     */
    private setupExits(): void {
        if (this.mode !== "embed" || !this.info.nodeId) return;
        const path = this.canvasPath();
        if (!path) return;

        const contentEl = this.groupEl("leads");
        contentEl.createDiv({ cls: c("step-exits-intro"), text: t("step_exits_intro") });
        const rows = contentEl.createDiv({ cls: c("step-exits") });
        void this.renderExits(rows, path);
    }

    /** The canvas this step is drawn on, when it is drawn on one. */
    private canvasPath(): string | undefined {
        if (!this.info.folder || !this.info.filename) return undefined;
        return this.info.folder.path
            .concat(FileService.PATH_SEPARATOR)
            .concat(this.info.filename)
            .concat(".canvas");
    }

    private async renderExits(rows: HTMLElement, path: string): Promise<void> {
        const nodeId = this.info.nodeId;
        if (!nodeId) return;
        let flow: Flow;
        let children: FlowNode[];
        try {
            flow = await canvas.flows.update(path);
            children = await flow.childrensOf(nodeId);
        } catch (error) {
            log.warn("[exits] could not read the arrows leaving this step", error);
            return;
        }

        rows.empty();
        const candidates = children.filter((child) => child.edgeId);
        if (candidates.length === 0) {
            rows.createDiv({ cls: c("step-exits-empty"), text: t("step_exits_empty") });
            return;
        }

        // An arrow you deleted is not configuration anyone can reach again.
        this.info.exits = pruneExits(
            this.info.exits ?? {},
            candidates.map((child) => child.edgeId as string)
        );

        const ordered = orderExits(candidates, this.info.exits);
        ordered.forEach((child, index) =>
            this.renderExitRow({ rows, path, candidates, child, index, total: ordered.length })
        );
        this.renderExitMigration(rows, path, flow, candidates);
    }

    private renderExitRow(row: {
        rows: HTMLElement;
        path: string;
        candidates: FlowNode[];
        child: FlowNode;
        index: number;
        total: number;
    }): void {
        const { rows, path, candidates, child, index, total } = row;
        const edgeId = child.edgeId as string;
        const exits: StepExits = this.info.exits ?? {};
        const exit: StepExit = exits[edgeId] ?? {};
        const redraw = () => void this.renderExits(rows, path);

        const setting = new Setting(rows)
            .setName(child.label || t("step_identity_untitled"))
            .setDesc(exit.when?.trim() || t("step_exits_when_always"));

        if (exit.default) {
            setting.nameEl.createSpan({
                cls: c("step-exits-default"),
                text: t("step_exits_default_badge"),
            });
        }

        setting.addText((text) =>
            text
                .setPlaceholder(t("step_exits_says_placeholder"))
                // With nothing configured the arrow label is still what the option says (#423).
                .setValue(exit.says ?? describeOption(child.tooltip) ?? "")
                .onChange((value) =>
                    this.updateExit(edgeId, (current) => {
                        const says = value.trim();
                        if (says) return { ...current, says };
                        const { says: _cleared, ...rest } = current;
                        return rest;
                    })
                )
        );

        setting.addExtraButton((button) =>
            button
                .setIcon("filter")
                .setTooltip(t("step_exits_when_edit"))
                .onClick(() => {
                    new ConditionEditorModal(this.plugin.app, exit.when ?? "", (expression) => {
                        this.updateExit(edgeId, (current) => {
                            if (expression) return { ...current, when: expression };
                            const { when: _cleared, ...rest } = current;
                            return rest;
                        });
                        redraw();
                    }).open();
                })
        );

        setting.addExtraButton((button) =>
            button
                .setIcon("target")
                .setTooltip(t("step_exits_default_set"))
                .setDisabled(exit.default === true)
                .onClick(() => {
                    this.info.exits = setDefaultExit(this.info.exits ?? {}, edgeId);
                    redraw();
                })
        );

        setting.addExtraButton((button) =>
            button
                .setIcon("chevron-up")
                .setTooltip(t("step_exits_move_up"))
                .setDisabled(index === 0)
                .onClick(() => {
                    this.info.exits = moveExit(candidates, this.info.exits ?? {}, edgeId, -1);
                    redraw();
                })
        );

        setting.addExtraButton((button) =>
            button
                .setIcon("chevron-down")
                .setTooltip(t("step_exits_move_down"))
                .setDisabled(index === total - 1)
                .onClick(() => {
                    this.info.exits = moveExit(candidates, this.info.exits ?? {}, edgeId, 1);
                    redraw();
                })
        );
    }

    /**
     * The one-time move from labels to exits, previewed before it runs: every arrow it would touch
     * is named, with the words that stay on the diagram and the condition that moves into the step.
     * Idempotent — a configured arrow stops being proposed.
     */
    private renderExitMigration(
        rows: HTMLElement,
        path: string,
        flow: Flow,
        candidates: FlowNode[]
    ): void {
        const plan = planMigration(candidates, this.info.exits ?? {});
        if (plan.length === 0) return;

        const named = (edgeId: string) =>
            candidates.find((child) => child.edgeId === edgeId)?.label ?? edgeId;
        const preview = plan
            .map((step) => {
                const gate = step.exit.when ? ` · ${step.exit.when}` : "";
                const says = step.label || t("step_exits_says_placeholder");
                return `${named(step.edgeId)}: ${says}${gate}`;
            })
            .join(" — ");

        new Setting(rows)
            .setName(t("step_exits_migrate"))
            .setDesc(`${t("step_exits_migrate_description")} ${preview}`)
            .addButton((button) =>
                button.setButtonText(t("step_exits_migrate")).onClick(() => {
                    new ConfirmModal(
                        this.plugin.app,
                        t("step_exits_migrate_confirm"),
                        t("confirm_apply_template_button"),
                        t("confirm_cancel_button"),
                        async () => {
                            const exits: StepExits = { ...this.info.exits };
                            const labels: Record<string, string> = {};
                            for (const step of plan) {
                                exits[step.edgeId] = step.exit;
                                labels[step.edgeId] = step.label;
                            }
                            this.info.exits = exits;
                            await flow.editEdgeLabels(labels);
                            new Notice(t("step_exits_migrate_done"));
                            void this.renderExits(rows, path);
                        }
                    ).open();
                })
            );
    }

    /** Edit one exit in place; an exit that says nothing at all is removed, not stored empty. */
    private updateExit(edgeId: string, edit: (current: StepExit) => StepExit): void {
        const exits: StepExits = { ...this.info.exits };
        const next = edit(exits[edgeId] ?? {});
        if (Object.keys(next).length === 0) {
            delete exits[edgeId];
        } else {
            exits[edgeId] = next;
        }
        this.info.exits = exits;
    }

    private async loadBodyFromFile(textarea: HTMLTextAreaElement): Promise<void> {
        if (!this.info.folder || !this.info.filename) return;
        const path = `${this.info.folder.path}${FileService.PATH_SEPARATOR}${this.info.filename}.md`;
        const file = await FileService.getFile(path, false);
        if (!file) return;
        const body = await FrontmatterService.instance(file).getContent();
        this.info.body = body;
        textarea.value = body;
    }

    onClose(): void {
        this.save().then(() => {
            log.info(`Step saved successfully`);
        }).catch((error) => {
            log.error(`Error saving step: ${error}`);
            new Notice(`Error saving step, check console for more info`);
        }).finally(() => {
            VaultStateManager.INSTANCE.defrost();
        });
    }

    private async save() {
        if (!this.info.folder || !this.info.filename) {
            log.error("[StepBuilder] Cannot save step: missing target folder or filename", this.info);
            new Notice(t("step_builder_save_missing_target"));
            return;
        }
        const path = this.info.folder.path.concat(FileService.PATH_SEPARATOR).concat(this.info.filename);
        switch (this.mode) {
            case "edit":
            case "create": {
                await this.saveFile(path.concat(".md"));
                log.info(`File ${path} saved`);
                break;
            }
            case "embed": {
                await this.saveEmbed(path.concat(".canvas"));
                log.info(`Embed with id ${this.info.nodeId} saved on ${path}`);
                break;
            }
            default: {
                log.error(`Unknown mode ${this.mode}`);
                throw new Error(`Unknown mode ${this.mode}`);
            }
        }
        this.chain.postAction();
    }

    private async saveEmbed(path: string): Promise<void> {
        if (this.info.nodeId) {
            const stepSettings = StepBuilderMapper.StepBuilderInfo2StepSettings(this.info);

            // Save path on cache or just get the cached flow
            const cachedFlow = await canvas.flows.update(path);
            await cachedFlow.editTextNode(this.info.nodeId, JSON.stringify(stepSettings));
        } else {
            log.error(`Node id not found on embed mode`);
            new Notice(t("step_builder_save_missing_node"));
        }
    }

    private async saveFile(path: string): Promise<void> {
        let file = await FileService.getFile(path, false);
        // A step note's template is the note itself, so the body never goes into its frontmatter
        // too — that is the inline box's storage, not this one's (#426).
        const { body: _inlineBody, ...stepSettings } =
            StepBuilderMapper.StepBuilderInfo2StepSettings(this.info);
        const body = this.info.body;
        if (!file) {
            file = await FileService.createFile(path, body ?? "", false);
        } else if (body !== undefined) {
            await this.updateFileBody(file, body);
        }
        await this.addStep(file, stepSettings);
        new Notice(`Step saved on ${path}`);
    }

    private async updateFileBody(file: TFile, body: string): Promise<void> {
        const raw = await FileService.getContent(file);
        const fmMatch = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
        const frontmatterBlock = fmMatch ? fmMatch[0] : "";
        await FileService.modify(file, frontmatterBlock + body);
    }

    private async addStep(file: TFile, stepSettings: StepSettings): Promise<void> {
        // Must be awaited: save() runs from onClose and defrosts the vault state right after,
        // so a fire-and-forget write could be dropped and the step never persisted (#79).
        await ObsidianApi.fileManager().processFrontMatter(file, (frontmatter: Record<string, unknown> & { zettelFlowSettings?: Record<string, unknown> }) => {
            // Use the pure merge helper so a cleared phase/wait marker is DELETED (a plain spread
            // would leave a previously-saved value behind). The canvas/embed path full-replaces already.
            frontmatter.zettelFlowSettings = mergeStepSettingsIntoFrontmatter(
                frontmatter.zettelFlowSettings,
                stepSettings
            );
        });
    }

    private getBaseInfo(): StepBuilderInfo {
        if (this.partialInfo === undefined) {
            return {
                type: "file",
                contentEl: this.contentEl,
                root: false,
                actions: [],
                label: ``,
                childrenHeader: ``,
                body: "",
            }
        } else {
            return {
                contentEl: this.contentEl,
                ...this.partialInfo,
                type: this.partialInfo.type === undefined ? `file` : this.partialInfo.type,
                root: this.partialInfo.root === undefined ? false : this.partialInfo.root,
                label: this.partialInfo.label === undefined ? `` : this.partialInfo.label,
                childrenHeader: this.partialInfo.childrenHeader === undefined ? `` : this.partialInfo.childrenHeader,
                actions: this.partialInfo.actions === undefined ? [] : this.partialInfo.actions,
            }
        }
    }
}

type LocaleKey = Parameters<typeof t>[0];

/** One summary fragment as a sentence piece; the value is interpolated when the key takes one. */
function describe(fragment: SummaryFragment): string {
    return fragment.value === undefined
        ? t(fragment.key as LocaleKey)
        : t(fragment.key as LocaleKey, fragment.value);
}
