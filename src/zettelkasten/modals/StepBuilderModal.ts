import { Menu, Notice, Setting, setIcon, TFile } from "obsidian";
import { StepBuilderInfo, StepSettings } from "zettelkasten";
import { StepTitleHandler } from "./handlers/StepTitleHandler";
import { t, tCount } from "architecture/lang";
import { FileService, FrontmatterService, VaultStateManager } from "architecture/plugin";
import { StepBuilderMapper } from "zettelkasten";
import { mergeStepSettingsIntoFrontmatter, PHASE_LABEL_KEY } from "zettelkasten/phases";
import { c, log } from "architecture";
import { canvas } from "architecture/plugin/canvas";
import { AbstractStepModal } from "./AbstractStepModal";
import ZettelFlow from "main";
import { InstalledStepEditorModal } from "./InstalledStepEditorModal";
import { UsedInstalledStepsModal } from "application/community";
import { ConfirmModal } from "architecture/components/settings";
import { stepIdentity, type SummaryFragment } from "./handlers/stepIdentity";
import {
    groupMeta,
    isGroupExpanded,
    STEP_GROUPS,
    STEP_GROUP_HEADING,
    type StepGroupId,
} from "./handlers/stepGroups";
import { BLOCK_LABEL_KEY, type WorkflowBlockKind } from "architecture/plugin/workflow";
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
import { describeTemplateChanges } from "zettelkasten/review/templateChanges";
import { phaseCanvasColor } from "zettelkasten/phases/phaseColor";
import { ConditionEditorModal } from "./ConditionEditorModal";

export class StepBuilderModal extends AbstractStepModal {
    info: StepBuilderInfo;
    /** The section around each group body, so an empty one can be removed whole (#425). */
    private groupSections: Partial<Record<StepGroupId, HTMLElement>> = {};
    /** The quiet fact at the end of each heading (#685). */
    private groupMetaEls: Partial<Record<StepGroupId, HTMLElement>> = {};
    /** Where the body template goes: first in *what it writes* (#685). */
    private bodySlot: HTMLElement | undefined;
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
        this.modalEl.addClass(c("modal"), c("step-editor-modal"));

        // A quiet header (#685): the step's name, the one thing you may want next — find it on the
        // canvas — and the rest in a labelled menu. Three identical accent icons used to sit here,
        // and you had to hover each one to learn what it did.
        const identity = stepIdentity(this.info);
        const header = this.info.contentEl.createDiv({ cls: c("step-editor-header") });
        const top = header.createDiv({ cls: c("step-editor-top") });
        top.createEl("h2", {
            cls: c("step-editor-title"),
            // The heading names the step, not the product (#424).
            text: identity.title ?? t(identity.titleKey as LocaleKey),
        });
        if (identity.canReveal && this.info.nodeId) {
            const nodeId = this.info.nodeId;
            const reveal = top.createEl("button", {
                cls: c("step-editor-reveal"),
                attr: { type: "button" },
            });
            setIcon(reveal.createSpan({ cls: c("step-editor-reveal-icon") }), "locate-fixed");
            reveal.createSpan({ text: t("step_identity_reveal") });
            reveal.addEventListener("click", () => {
                if (!CanvasHelper.revealNode(this.plugin, nodeId)) {
                    new Notice(t("step_identity_reveal_failed"));
                }
            });
        }
        const more = top.createEl("button", {
            cls: ["clickable-icon", c("step-editor-more")],
            attr: { type: "button", "aria-label": t("step_builder_more") },
        });
        setIcon(more, "more-horizontal");
        more.addEventListener("click", (event) => this.openMoreMenu(event));

        this.renderIdentity(header, identity);
        this.buildGroups();

        this.chain.handle(this);

        // The body template is a step's template wherever the step lives: a step note keeps it in
        // the file, an inline box in its own settings (#426).
        this.setupBody();
        // Where the flow goes next belongs to the step, not to the arrows drawing it (#427).
        this.setupExits();

        // Only after everything has rendered: a question nobody answered leaves no heading (#425).
        this.pruneEmptyGroups();
    }

    /** Copy · apply a template · save as one — named, in a menu, instead of three bare icons. */
    private openMoreMenu(event: MouseEvent): void {
        const menu = new Menu();
        menu.addItem((item) =>
            item
                .setTitle(t("step_builder_copy_button"))
                .setIcon("copy")
                .onClick(() => void this.copyStep())
        );
        menu.addItem((item) =>
            item
                .setTitle(t("step_builder_apply_button"))
                .setIcon("layout-template")
                .onClick(() => this.applyTemplate())
        );
        menu.addItem((item) =>
            item
                .setTitle(t("step_builder_save_template_button"))
                .setIcon("bookmark-plus")
                .onClick(() => this.saveAsTemplate())
        );
        menu.showAtMouseEvent(event);
    }

    private async copyStep(): Promise<void> {
        const stepSettings = StepBuilderMapper.StepBuilderInfo2CommunityStepSettings(this.info, {
            title: t("step_template_default_title"),
            description: t("step_template_default_description")
        });
        void navigator.clipboard.writeText(JSON.stringify(stepSettings, null, 2));
        this.plugin.settings.communitySettings.clipboardTemplate = stepSettings;
        await this.plugin.saveSettings();
        new Notice(t("step_copied_notice"));
    }

    /**
     * Pick the template first, then confirm against *what it changes* (#428 FR-7): an overwrite
     * nobody can see is an overwrite nobody agreed to.
     */
    private applyTemplate(): void {
        new UsedInstalledStepsModal(this.plugin, (step) => {
            const changes = describeTemplateChanges(this.info, step);
            const details =
                changes.length === 0
                    ? [t("apply_template_preview_none")]
                    : changes.map(
                          (change) =>
                              `${t(change.fieldKey as LocaleKey)}: ${change.before || "—"} → ${change.after || "—"}`
                      );
            new ConfirmModal(
                this.plugin.app,
                t("confirm_apply_template_step"),
                t("confirm_apply_template_button"),
                t("confirm_cancel_button"),
                async () => {
                    this.partialInfo = {
                        ...this.info,
                        ...StepBuilderMapper.StepSettings2PartialStepBuilderInfo(step)
                    };
                    this.info = this.getBaseInfo();
                    this.refresh();
                },
                [t("apply_template_preview_intro"), ...details]
            ).open();
        }).open();
    }

    private saveAsTemplate(): void {
        new ConfirmModal(
            this.plugin.app,
            t("confirm_add_step"),
            t("confirm_add_button"),
            t("confirm_cancel_button"),
            async () => {
                const stepSettings = StepBuilderMapper.StepBuilderInfo2CommunityStepSettings(this.info, {
                    title: t("step_template_default_title"),
                    description: t("step_template_default_description"),
                    id: this.info.nodeId
                });
                if (this.plugin.settings.installedTemplates.steps[stepSettings.id]) {
                    // The warning has to be true: it used to say "already exists" and then
                    // overwrite the template on the next line anyway (#546 C3). Abort instead.
                    new Notice(t("step_template_already_exists"));
                    return;
                }
                this.plugin.settings.installedTemplates.steps[stepSettings.id] = stepSettings;
                void this.plugin.saveSettings();
                new InstalledStepEditorModal(this.plugin, stepSettings).open();
            }
        ).open();
    }

    /**
     * The questions the editor answers (#425), in order, *what does it ask* first (#685). The chain
     * still owns every field; this only decides where each one lands.
     */
    private buildGroups(): void {
        const { contentEl } = this.info;
        const groupsEl = contentEl.createDiv({ cls: c("step-groups") });
        for (const group of STEP_GROUPS) {
            const section = groupsEl.createDiv({ cls: c("step-group") });
            const expanded = isGroupExpanded(group, this.info);
            section.toggleClass("is-open", expanded);

            const heading = section.createEl("button", {
                cls: c("step-group-heading"),
                attr: { "aria-expanded": String(expanded), type: "button" },
            });
            heading.createSpan({
                cls: c("step-group-question"),
                text: t(STEP_GROUP_HEADING[group] as LocaleKey),
            });
            this.groupMetaEls[group] = heading.createSpan({ cls: c("step-group-meta") });
            setIcon(heading.createSpan({ cls: c("step-group-chevron") }), "chevron-right");

            const body = section.createDiv({ cls: c("step-group-body") });
            heading.addEventListener("click", () => {
                const open = heading.getAttribute("aria-expanded") !== "true";
                heading.setAttribute("aria-expanded", String(open));
                section.toggleClass("is-open", open);
            });

            // The template comes first in *what it writes*, the linked note after it (#685): the
            // slot is taken before the chain runs, so the order does not depend on the chain's.
            if (group === "writes") this.bodySlot = body.createDiv({ cls: c("step-builder-body-slot") });

            this.groups[group] = body;
            this.groupSections[group] = section;
        }
        this.refreshGroupMeta();
    }

    /** The quiet fact at the end of each heading — what a group holds without opening it. */
    private refreshGroupMeta(): void {
        for (const group of STEP_GROUPS) {
            const el = this.groupMetaEls[group];
            if (!el) continue;
            const meta = groupMeta(group, this.info);
            if (!meta) {
                el.setText("");
            } else if (meta.count !== undefined) {
                el.setText(tCount(meta.count, meta.key as LocaleKey, String(meta.count)));
            } else {
                el.setText(meta.value ?? t(meta.key as LocaleKey));
            }
        }
    }

    actionsChanged(): void {
        this.refreshGroupMeta();
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
    private renderIdentity(header: HTMLElement, identity: ReturnType<typeof stepIdentity>): void {
        const row = header.createDiv({ cls: c("step-identity") });

        // Each chip carries its own icon and colour: a row of identical grey pills reads as
        // decoration, and the two facts you came for — what this is, and whether the flow starts
        // here — were the easiest to miss in it.
        this.chip(row, "step-identity-kind", KIND_ICON[identity.kindKey] ?? "box", t(identity.kindKey as LocaleKey));

        const block = this.chip(
            row,
            "step-identity-block",
            BLOCK_ICON[identity.block],
            t(BLOCK_LABEL_KEY[identity.block])
        );
        block.addClass(c(`step-identity-block-${identity.block}`));

        if (identity.phase) {
            const phase = this.chip(
                row,
                "step-identity-phase",
                "palette",
                t(PHASE_LABEL_KEY[identity.phase])
            );
            // The same colour the canvas paints that phase with (#429), as a dot rather than a
            // fill, so the chip stays legible in every theme.
            phase.addClass(c(`step-identity-phase-${phaseCanvasColor(identity.phase)}`));
        }

        for (const badge of identity.badges) {
            const chip = this.chip(row, "step-identity-badge", BADGE_ICON[badge] ?? "dot", t(badge as LocaleKey));
            chip.addClass(c(`step-identity-badge-${badge.replace("step_identity_badge_", "")}`));
        }

        header.createDiv({
            cls: c("step-identity-summary"),
            text: identity.summary.map((fragment) => describe(fragment)).join(" · "),
        });
    }

    /** One chip of the identity row: an icon that names the kind of fact, and the fact. */
    private chip(row: HTMLElement, cls: string, icon: string, text: string): HTMLElement {
        const chip = row.createSpan({ cls: c(cls) });
        setIcon(chip.createSpan({ cls: c("step-identity-icon") }), icon);
        chip.createSpan({ text });
        return chip;
    }

    refresh(): void {
        this.contentEl.empty();
        this.groupMetaEls = {};
        this.bodySlot = undefined;
        this.onOpen();
    }

    private setupBody(): void {
        const contentEl = this.bodySlot ?? this.groupEl("writes");
        const label = contentEl.createDiv({ cls: c("step-builder-body-label") });
        label.createDiv({ cls: "setting-item-name", text: t("step_builder_body_name") });
        label.createDiv({ cls: "setting-item-description", text: t("step_builder_body_desc") });

        // The tokens are insertable rather than documented: a template language you have to
        // remember is a capability you have to look up (#426).
        const tokens = contentEl.createDiv({ cls: c("step-builder-tokens") });
        tokens.createSpan({ text: t("step_builder_body_tokens") });

        const textarea = contentEl.createEl("textarea", {
            cls: c("step-builder-body"),
            placeholder: t("step_builder_body_template_placeholder"),
        });
        textarea.value = this.info.body ?? "";
        textarea.addEventListener("input", () => {
            this.info.body = textarea.value;
        });

        const INSERTABLE: [string, LocaleKey][] = [
            ["{{title}}", "step_builder_body_token_title"],
            ["{{date}}", "step_builder_body_token_date"],
            ["{{canvas.name}}", "step_builder_body_token_canvas"],
        ];
        for (const [token, labelKey] of INSERTABLE) {
            const button = tokens.createEl("button", {
                cls: c("step-builder-token"),
                text: token,
                attr: { type: "button", "aria-label": t(labelKey) },
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

    /**
     * One arrow, as one row (#685): where it goes — and whether you land there — what it says, when
     * it opens, and its place in the order. The condition reads as code because it is code.
     */
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

        const setting = new Setting(rows).setName(child.label || t("step_identity_untitled"));
        setting.settingEl.addClass(c("step-exit"));
        if (exit.default) {
            setting.nameEl.createSpan({
                cls: c("step-exits-default"),
                text: t("step_exits_default_badge"),
            });
        }
        setting.descEl.createSpan({
            cls: exit.when?.trim() ? c("step-exit-when") : c("step-exit-always"),
            text: exit.when?.trim() || t("step_exits_when_always"),
        });

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

        setting.addButton((button) => {
            button.setButtonText(t("step_exits_when_edit")).onClick(() => {
                new ConditionEditorModal(this.plugin.app, exit.when ?? "", (expression) => {
                    this.updateExit(edgeId, (current) => {
                        if (expression) return { ...current, when: expression };
                        const { when: _cleared, ...rest } = current;
                        return rest;
                    });
                    redraw();
                }).open();
            });
            button.buttonEl.addClass(c("step-exit-when-button"));
            const icon = createSpan({ cls: c("step-exit-when-icon") });
            setIcon(icon, "filter");
            button.buttonEl.prepend(icon);
        });

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
        await FrontmatterService.instance(file).update((frontmatter: Record<string, unknown> & { zettelFlowSettings?: Record<string, unknown> }) => {
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

/** The node kinds, as icons — one glyph is faster to recognise than three words. */
const KIND_ICON: Record<string, string> = {
    step_identity_kind_inline: "square",
    step_identity_kind_group: "group",
    step_identity_kind_note: "file-text",
    step_identity_kind_unknown: "help-circle",
};

/** The #151 block vocabulary, with the icons the canvas legend uses for the same idea. */
const BLOCK_ICON: Record<WorkflowBlockKind, string> = {
    when: "zap",
    if: "filter",
    action: "square-check",
    wait: "pause",
};

/** What is switched on, each with its own glyph; the flow's start gets the loudest treatment. */
const BADGE_ICON: Record<string, string> = {
    step_identity_badge_root: "flag",
    step_identity_badge_trigger: "zap",
    step_identity_badge_wait: "pause",
    step_identity_badge_optional: "skip-forward",
    step_identity_badge_satellite: "link",
};

type LocaleKey = Parameters<typeof t>[0];

/** One summary fragment as a sentence piece; the value is interpolated when the key takes one. */
function describe(fragment: SummaryFragment): string {
    return fragment.value === undefined
        ? t(fragment.key as LocaleKey)
        : t(fragment.key as LocaleKey, fragment.value);
}
