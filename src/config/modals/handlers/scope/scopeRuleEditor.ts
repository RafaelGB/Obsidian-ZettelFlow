/**
 * Writing one rule or exception (#713, FR-7 to FR-9, AC-7, AC-8): its kind, how it matches, what it
 * matches — picked from the vault, never typed for tags or values — and what it would do before it is
 * added. One renderer: inline on the card, or inside the phone sheet.
 */
import { setIcon } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { FolderSuggest } from "architecture/settings";
import type { CompiledScope, Classification, ScopeFacts } from "architecture/knowledge/scope/scopeEvaluate";
import { draftPreview, withStoredValues, type ScopeVocabulary } from "architecture/knowledge/scope/scopeCensus";
import type { ScopeRule, ScopeRuleKind } from "architecture/knowledge/scope/scopeRules";
import { draftToRule, toggled, type ScopeDraft } from "./scopeDraft";
import { filtered, renderChecklist, renderChipCloud, renderNameList, searchBox } from "./scopeValuePicker";

type LocaleKey = Parameters<typeof t>[0];

export interface RuleEditorContext {
    draft: ScopeDraft;
    vocabulary: ScopeVocabulary;
    compiled: CompiledScope;
    classes: readonly Classification[];
    facts: readonly ScopeFacts[];
    folderExists: (path: string) => boolean;
    /** The draft changed (a pick, a switch): keep it and redraw the editor. Never a save. */
    change: (draft: ScopeDraft) => void;
    cancel: () => void;
    confirm: (rule: ScopeRule) => void;
}

/** Buttons that read as one choice; the chosen one is active. */
function segments<T extends string>(
    host: HTMLElement,
    label: string,
    options: readonly { value: T; key: LocaleKey }[],
    value: T,
    pick: (value: T) => void
): void {
    const row = host.createDiv({ cls: c("scope-field") });
    row.createSpan({ cls: c("scope-field-label"), text: label });
    const group = row.createDiv({ cls: c("scope-segments"), attr: { role: "group", "aria-label": label } });
    for (const option of options) {
        const on = option.value === value;
        const button = group.createEl("button", {
            cls: [c("scope-segment"), ...(on ? ["is-active"] : [])],
            text: t(option.key),
            attr: { type: "button", "aria-pressed": String(on) },
        });
        button.addEventListener("click", () => {
            if (!on) pick(option.value);
        });
    }
}

/** A switch in Obsidian's own toggle shape, with its words beside it. */
function toggle(host: HTMLElement, label: string, on: boolean, flip: (on: boolean) => void, hint?: string): void {
    const row = host.createDiv({ cls: c("scope-toggle-row") });
    const knob = row.createDiv({
        cls: ["checkbox-container", ...(on ? ["is-enabled"] : [])],
        attr: { role: "switch", "aria-checked": String(on), "aria-label": label, tabindex: "0" },
    });
    knob.createEl("input", { attr: { type: "checkbox", tabindex: "-1" } });
    knob.addEventListener("click", () => flip(!on));
    knob.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            flip(!on);
        }
    });
    row.createSpan({ cls: c("scope-toggle-label"), text: label });
    if (hint) row.createSpan({ cls: c("scope-hint"), text: hint });
}

function empty(host: HTMLElement, key: LocaleKey): void {
    host.createDiv({ cls: c("scope-empty"), text: t(key) });
}

const KINDS: { value: ScopeRuleKind; key: LocaleKey }[] = [
    { value: "folder", key: "settings_scope_kind_folder" },
    { value: "tag", key: "settings_scope_kind_tag" },
    { value: "property", key: "settings_scope_kind_property" },
];

/** Draw the editor for `ctx.draft` into `host`. */
export function renderRuleEditor(host: HTMLElement, ctx: RuleEditorContext): void {
    host.empty();
    const { draft } = ctx;
    const keep = draft.mode === "keep";
    const box = host.createDiv({ cls: [c("scope-editor"), ...(keep ? [c("scope-editor--keep")] : [])] });

    const head = box.createDiv({ cls: c("scope-editor-head") });
    const titleKey: LocaleKey =
        draft.editing >= 0
            ? keep ? "settings_scope_edit_exception" : "settings_scope_edit_rule"
            : keep ? "settings_scope_new_exception" : "settings_scope_new_rule";
    head.createSpan({ cls: c("scope-editor-title"), text: t(titleKey) });
    head.createSpan({ cls: c("scope-hint"), text: t(keep ? "settings_scope_exceptions_heading" : "settings_scope_rules_heading") });

    segments(box, t("settings_scope_kind"), KINDS, draft.kind, (kind) =>
        ctx.change({ ...draft, kind, search: "" })
    );

    // Editing a rule whose value no note carries any more still shows it (at zero), to untick.
    const stored = draft.editing >= 0 ? draftToRule(draft, () => true) : null;
    const vocabulary = stored ? withStoredValues(ctx.vocabulary, stored) : ctx.vocabulary;
    switch (draft.kind) {
        case "folder":
            folderPicker(box, ctx);
            break;
        case "tag":
            tagPicker(box, ctx, vocabulary);
            break;
        case "property":
            propertyPicker(box, ctx, vocabulary);
            break;
    }

    const rule = draftToRule(draft, ctx.folderExists);
    const preview = box.createDiv({ cls: c("scope-preview") });
    if (rule) {
        const result = draftPreview(ctx.compiled, rule, draft.mode, ctx.facts, draft.editing, ctx.classes);
        const count = result.count.toLocaleString();
        preview.createDiv({
            cls: c("scope-preview-count"),
            text: keep ? tCount(result.count, "settings_scope_would_keep", count) : tCount(result.count, "settings_scope_would_leave_out", count),
        });
        const detail: string[] = [];
        if (!keep && result.already > 0) detail.push(tCount(result.already, "settings_scope_already_left_out", result.already.toLocaleString()));
        if (result.sample.length > 0) {
            const more = result.count - result.sample.length;
            detail.push(more > 0 ? `${result.sample.join(", ")} ${tCount(more, "settings_scope_and_more", more.toLocaleString())}` : result.sample.join(", "));
        }
        if (detail.length > 0) preview.createDiv({ cls: c("scope-hint"), text: detail.join(" · ") });
    }

    const actions = box.createDiv({ cls: c("scope-editor-actions") });
    const cancel = actions.createEl("button", { text: t("settings_scope_cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => ctx.cancel());
    const confirmKey: LocaleKey = draft.editing >= 0 ? "settings_scope_save" : keep ? "settings_scope_confirm_exception" : "settings_scope_confirm_rule";
    const confirm = actions.createEl("button", { cls: "mod-cta", text: t(confirmKey), attr: { type: "button" } });
    if (!rule) confirm.setAttribute("disabled", "true");
    confirm.addEventListener("click", () => {
        const ready = draftToRule(ctx.draft, ctx.folderExists);
        if (ready) ctx.confirm(ready);
    });
}

function folderPicker(box: HTMLElement, ctx: RuleEditorContext): void {
    const { draft } = ctx;
    segments(
        box,
        t("settings_scope_match"),
        [
            { value: "in", key: "settings_scope_op_folder_in" },
            { value: "notIn", key: "settings_scope_op_folder_not_in" },
        ],
        draft.folderOp,
        (folderOp) => ctx.change({ ...draft, folderOp })
    );
    toggle(box, t("settings_scope_subfolders"), draft.subfolders, (subfolders) => ctx.change({ ...draft, subfolders }));
    const field = box.createDiv({ cls: c("scope-picker") });
    const input = searchBox(field, t("settings_scope_search_folders"), draft.folder, (value) => {
        // Typing is not a choice: the draft follows, and Add waits until the folder exists.
        ctx.draft = { ...ctx.draft, folder: value };
        status.toggleClass("is-hidden", value.trim() === "" || ctx.folderExists(value.trim()));
        const confirm = box.querySelector<HTMLButtonElement>("button.mod-cta");
        if (confirm) {
            if (draftToRule(ctx.draft, ctx.folderExists)) confirm.removeAttribute("disabled");
            else confirm.setAttribute("disabled", "true");
        }
    });
    new FolderSuggest(input, (path) => ctx.change({ ...ctx.draft, folder: path }));
    const status = field.createDiv({ cls: [c("scope-hint"), "is-hidden"], text: t("settings_scope_no_folder_match") });
    status.toggleClass("is-hidden", draft.folder.trim() === "" || ctx.folderExists(draft.folder.trim()));
}

function tagPicker(box: HTMLElement, ctx: RuleEditorContext, vocabulary: ScopeVocabulary): void {
    const { draft } = ctx;
    segments(
        box,
        t("settings_scope_match"),
        [
            { value: "any", key: "settings_scope_op_tag_any" },
            { value: "none", key: "settings_scope_op_tag_none" },
        ],
        draft.tagOp,
        (tagOp) => ctx.change({ ...draft, tagOp })
    );
    toggle(box, t("settings_scope_nested"), draft.nested, (nested) => ctx.change({ ...draft, nested }), t("settings_scope_nested_hint"));
    const field = box.createDiv({ cls: c("scope-picker") });
    if (vocabulary.tags.length === 0) {
        empty(field, "settings_scope_no_tags");
        return;
    }
    searchBox(field, t("settings_scope_search_tags"), draft.search, (search) => {
        ctx.draft = { ...ctx.draft, search };
        drawCloud(search);
    });
    field.createDiv({ cls: c("scope-hint"), text: t("settings_scope_sorted_hint") });
    const cloud = field.createDiv();
    // Redrawn on each keystroke on its own, so the search box keeps its focus.
    function drawCloud(search: string): void {
        renderChipCloud(cloud, filtered(vocabulary.tags, search), ctx.draft.tags, (name) =>
            ctx.change({ ...ctx.draft, tags: toggled(ctx.draft.tags, name) })
        );
    }
    drawCloud(draft.search);
}

function propertyPicker(box: HTMLElement, ctx: RuleEditorContext, vocabulary: ScopeVocabulary): void {
    const { draft } = ctx;
    const field = box.createDiv({ cls: c("scope-picker") });
    if (vocabulary.properties.length === 0) {
        empty(field, "settings_scope_no_properties");
        return;
    }
    if (!draft.property) {
        searchBox(field, t("settings_scope_search_properties"), draft.search, (search) => {
            ctx.draft = { ...ctx.draft, search };
            drawList(search);
        });
        const list = field.createDiv();
        function drawList(search: string): void {
            renderNameList(list, filtered(vocabulary.properties, search), (property) =>
                ctx.change({ ...ctx.draft, property, values: [], search: "" })
            );
        }
        drawList(draft.search);
        return;
    }

    const chosen = field.createDiv({ cls: c("scope-chosen") });
    const back = chosen.createEl("button", {
        cls: "clickable-icon",
        attr: { type: "button", "aria-label": t("settings_scope_change_property") },
    });
    setIcon(back, "chevron-left");
    back.addEventListener("click", () => ctx.change({ ...draft, property: "", values: [], search: "" }));
    chosen.createSpan({ cls: c("scope-chosen-name"), text: draft.property });

    segments(
        field,
        t("settings_scope_match"),
        [
            { value: "oneOf", key: "settings_scope_op_prop_one_of" },
            { value: "set", key: "settings_scope_op_prop_set" },
            { value: "notSet", key: "settings_scope_op_prop_not_set" },
        ],
        draft.propertyOp,
        (propertyOp) => ctx.change({ ...draft, propertyOp })
    );
    if (draft.propertyOp !== "oneOf") return;
    const values = vocabulary.properties.find((property) => property.name === draft.property)?.values ?? [];
    if (values.length === 0) {
        empty(field, "settings_scope_no_values");
        return;
    }
    renderChecklist(field.createDiv(), values, draft.values, (value) => ctx.change({ ...ctx.draft, values: toggled(ctx.draft.values, value) }));
}
