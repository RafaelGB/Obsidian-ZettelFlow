import { ItemView, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { c, log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { FileSuggest } from "architecture/settings";
import { FileService } from "architecture/plugin";
import { dispatchEditor } from "architecture/components/core/codeView/editor/Dispatcher";
import {
    bindingArgs,
    bindingNames,
    buildAsyncScriptFunction,
    CONDITION_BINDINGS,
    DYNAMIC_SELECTOR_BINDINGS,
    errorMessage,
    fnsManager,
    HOOK_BINDINGS,
    SCRIPT_ACTION_BINDINGS,
    type ScriptBinding,
} from "architecture/api";
import { withScriptRun } from "architecture/api/lib/recordScriptRun";
import { renderRunLog } from "./runLogSection";
import { renderLibrary } from "./librarySection";
import { ContentDTO, NoteDTO } from "application/notes";
import type { ScriptSurface } from "application/scripts/scriptRunLog";
import {
    emptyContext,
    needsContextNote,
    summariseWrites,
    SURFACE_LABEL_KEY,
    TRYABLE_SURFACES,
    type NoteState,
    type WouldWrite,
} from "application/scripts/workbenchRun";

type LocaleKey = Parameters<typeof t>[0];

/** Each surface's contract — the same constants the real runs inject from (#349). */
const BINDINGS: Record<string, readonly ScriptBinding[]> = {
    action: SCRIPT_ACTION_BINDINGS,
    selector: DYNAMIC_SELECTOR_BINDINGS,
    hook: HOOK_BINDINGS,
    condition: CONDITION_BINDINGS,
};

/**
 * **The workbench** (#446, epic #443): try a script before it touches anything.
 *
 * Four of the five scripting surfaces had no way to be tried at all, and the fifth ran against an
 * empty note — so the only rehearsal the product offered taught the wrong thing. Here you pick the
 * surface, pick a real note, and run: the value it returned, what it **would** have written, and
 * how long it took.
 *
 * **Nothing is written.** The script is handed DTOs seeded from the note you chose, and what it
 * left in them is shown as a difference. This module reaches no writer, and a guardrail test says
 * so. Console output still goes to the developer console: capturing it would mean patching a
 * global, and a bench that lies about the environment is worse than one that says where to look.
 */
export class WorkbenchView extends ItemView {
    public static NAME = "zettelflow-workbench";

    private surface: ScriptSurface = "action";
    private notePath = "";
    private code = "";
    private outputEl: HTMLElement | undefined;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return WorkbenchView.NAME;
    }

    getDisplayText(): string {
        return t("workbench_title");
    }

    getIcon(): string {
        return "flask-conical";
    }

    /** Open the bench on a given surface, with code already in it (the *try it* buttons). */
    public prime(surface: ScriptSurface, code: string, notePath?: string): void {
        this.surface = surface;
        this.code = code;
        if (notePath) this.notePath = notePath;
        this.render();
    }

    async onOpen(): Promise<void> {
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass(c("workbench"));

        contentEl.createEl("h2", { text: t("workbench_title") });
        contentEl.createDiv({ cls: c("workbench-intro"), text: t("workbench_intro") });

        new Setting(contentEl)
            .setName(t("workbench_surface"))
            .setDesc(t("workbench_surface_desc"))
            .addDropdown((dropdown) => {
                for (const surface of TRYABLE_SURFACES) {
                    dropdown.addOption(surface, t(SURFACE_LABEL_KEY[surface] as LocaleKey));
                }
                dropdown.setValue(this.surface).onChange((value) => {
                    this.surface = value as ScriptSurface;
                    this.render();
                });
            });

        const noteSetting = new Setting(contentEl)
            .setName(t("workbench_context"))
            .setDesc(
                needsContextNote(this.surface) ? t("workbench_context_required") : t("workbench_context_desc")
            )
            .addSearch((search) => {
                new FileSuggest(search.inputEl, FileService.PATH_SEPARATOR);
                search
                    .setPlaceholder(t("workbench_context_placeholder"))
                    .setValue(this.notePath)
                    .onChange((value) => {
                        this.notePath = value.trim();
                    });
            });
        if (!this.notePath) {
            // Said plainly, never fabricated: this is what the script will see.
            noteSetting.descEl.createDiv({
                cls: c("workbench-note"),
                text: t("workbench_context_empty"),
            });
        }

        const editorEl = contentEl.createDiv({ cls: c("workbench-editor") });
        dispatchEditor(
            editorEl,
            this.code,
            (update) => {
                if (update.docChanged) this.code = update.state.doc.toString();
            },
            BINDINGS[this.surface] ?? SCRIPT_ACTION_BINDINGS
        );

        new Setting(contentEl)
            .addButton((button) =>
                button
                    .setButtonText(t("workbench_run"))
                    .setCta()
                    .onClick(() => void this.run())
            )
            .addButton((button) =>
                button.setButtonText(t("workbench_clear")).onClick(() => {
                    this.outputEl?.empty();
                })
            );

        this.outputEl = contentEl.createDiv({
            cls: c("workbench-output"),
            attr: { role: "status", "aria-live": "polite" },
        });

        renderLibrary(contentEl, {
            onTry: (surface, code) => {
                this.surface = surface;
                this.code = code;
                this.render();
            },
        });

        renderRunLog(contentEl, {
            onRerun: (surface, notePath, code) => {
                this.surface = surface;
                this.notePath = notePath;
                if (code !== undefined) this.code = code;
                this.render();
            },
            onChanged: () => this.render(),
        });
    }

    /** Run what is in the editor, against the note that was picked. Writes nothing. */
    private async run(): Promise<void> {
        const output = this.outputEl;
        if (!output) return;
        output.empty();

        if (needsContextNote(this.surface) && !this.notePath) {
            output.createDiv({ cls: c("workbench-problem"), text: t("workbench_context_required") });
            return;
        }

        const before = await this.readContext();
        const content = new ContentDTO();
        content.set(before.body);
        const note = new NoteDTO();
        if (before.title) note.setTitle(before.title);

        const started = Date.now();
        try {
            const bindings = BINDINGS[this.surface] ?? SCRIPT_ACTION_BINDINGS;
            const scriptFn = buildAsyncScriptFunction(
                bindingNames(bindings),
                `return (async () => {\n${this.code}\n})();`
            );
            const args = bindingArgs(bindings, {
                element: { type: "script", id: "workbench", hasUI: false },
                content,
                note,
                context: {},
                event: {
                    notePath: this.notePath,
                    frontmatter: before.frontmatter,
                    file: this.notePath ? ObsidianApi.vault().getFileByPath(this.notePath) : null,
                    request: { frontmatter: before.frontmatter },
                    response: { frontmatter: {}, removeProperties: [] },
                },
                zf: await fnsManager.getFns(),
                app: ObsidianApi.globalApp(),
            });

            const value = await withScriptRun(
                { surface: "workbench", origin: { ref: `workbench:${this.surface}`, notePath: this.notePath } },
                () => scriptFn(...args)
            );

            this.renderOutcome(output, value, Date.now() - started, before, {
                title: note.getTitle() || before.title,
                body: content.get(),
                frontmatter: { ...before.frontmatter, ...content.getFrontmatter() },
            });
        } catch (error) {
            output.createDiv({
                cls: c("workbench-problem"),
                text: t("workbench_failed", errorMessage(error)),
            });
            output.createDiv({
                cls: c("workbench-note"),
                text: t("workbench_duration", String(Date.now() - started)),
            });
        }
    }

    /** The note as it stands — the real thing, or an empty context stated as such. */
    private async readContext(): Promise<NoteState> {
        if (!this.notePath) return emptyContext();
        const file = ObsidianApi.vault().getFileByPath(this.notePath);
        if (!(file instanceof TFile)) return emptyContext();
        try {
            const frontmatter =
                ObsidianApi.globalApp().metadataCache.getFileCache(file)?.frontmatter ?? {};
            return {
                title: file.basename,
                body: await ObsidianApi.vault().cachedRead(file),
                frontmatter: { ...frontmatter },
            };
        } catch (error) {
            log.warn("[workbench] could not read the context note", error);
            return emptyContext();
        }
    }

    private renderOutcome(
        output: HTMLElement,
        value: unknown,
        durationMs: number,
        before: NoteState,
        after: NoteState
    ): void {
        output.createDiv({ cls: c("workbench-note"), text: t("workbench_duration", String(durationMs)) });

        output.createEl("h6", { text: t("workbench_returned") });
        output.createEl("pre", {
            cls: c("workbench-value"),
            text: value === undefined ? t("workbench_returned_nothing") : safeJson(value),
        });

        const writes = summariseWrites(before, after);
        output.createEl("h6", { text: t("workbench_would_write") });
        if (!writes.touched) {
            output.createDiv({ cls: c("workbench-note"), text: t("workbench_would_write_nothing") });
            return;
        }
        this.renderWrites(output, writes);
    }

    private renderWrites(output: HTMLElement, writes: WouldWrite): void {
        if (writes.title) {
            output.createDiv({
                cls: c("workbench-change"),
                text: t("workbench_title_change", writes.title.from || "—", writes.title.to),
            });
        }
        for (const change of writes.frontmatter) {
            output.createDiv({
                cls: c("workbench-change"),
                text: `${change.key}: ${safeJson(change.from)} → ${safeJson(change.to)}`,
            });
        }
        if (writes.bodyAdded) {
            output.createEl("pre", { cls: c("workbench-value"), text: writes.bodyAdded });
        }
        output.createDiv({ cls: c("workbench-note"), text: t("workbench_nothing_written") });
    }
}

/** A value as text, without letting a circular object break the panel. */
function safeJson(value: unknown): string {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "string") return value;
    try {
        const json = JSON.stringify(value, null, 2);
        if (json !== undefined) return json;
    } catch {
        // A circular or exotic value: fall through to a description rather than crashing.
    }
    return Object.prototype.toString.call(value);
}
