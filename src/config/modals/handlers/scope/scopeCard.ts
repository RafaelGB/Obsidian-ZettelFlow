/**
 * **What is left out** (#713): the kept-out card. One sentence of how much of the vault counts, the
 * rules as sentences with what each leaves out, the exceptions that keep a note in anyway, and
 * ZettelFlow's own folders, which no rule changes. Authored here, with the vault's own tags,
 * properties and folders — never a formula, never hand-edited YAML (§XIII).
 *
 * State lives outside the DOM (the open draft, whether the list is shown), so the settings renderer
 * can re-run the row as often as it likes without stacking or losing anything.
 */
import { setIcon } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { measure } from "architecture/monitoring/measure";
import { classifyAll, type Classification, type CompiledScope, type ScopeFacts } from "architecture/knowledge/scope/scopeEvaluate";
import { scopeCensus, scopeVocabulary, type ScopeCensus } from "architecture/knowledge/scope/scopeCensus";
import type { ScopeRule, ScopeRules } from "architecture/knowledge/scope/scopeRules";
import { ruleSentenceParts } from "architecture/components/core/scope/ruleSentence";
import { draftFromRule, newDraft, type DraftMode, type ScopeDraft } from "./scopeDraft";
import { renderRuleEditor } from "./scopeRuleEditor";

type LocaleKey = Parameters<typeof t>[0];

/** What the card reads and does — the live app in settings, fakes in tests. */
export interface ScopeCardDeps {
    rules(): ScopeRules;
    compiled(): CompiledScope;
    facts(): readonly ScopeFacts[];
    /** ZettelFlow's own folders, and which of them is the Thinking space. */
    system(): { folders: readonly string[]; thinking: string };
    folderExists(path: string): boolean;
    /** Save the rules. The only write the card makes. */
    commit(next: ScopeRules): Promise<void> | void;
    isPhone: boolean;
    /** On a phone: host the editor in a sheet. `draw` renders it; `dismissed` is a swipe-away. */
    openSheet(draw: (host: HTMLElement) => void, dismissed: () => void): { redraw(): void; finish(): void };
    /** The notes left out: a toggle in the summary, the list under it. Absent, nothing is offered. */
    leftOutList?(summary: HTMLElement, host: HTMLElement, census: ScopeCensus, rules: ScopeRules, redraw: () => void): void;
}

interface CardState {
    draft: ScopeDraft | null;
    sheet: { redraw(): void; finish(): void } | null;
    showLeftOut: boolean;
}

const state: CardState = { draft: null, sheet: null, showLeftOut: false };

/** For tests: start from a closed card. */
export function __resetScopeCard(): void {
    state.draft = null;
    state.sheet = null;
    state.showLeftOut = false;
}

/** Whether the list of left-out notes is open — the S6 list reads and flips it. */
export function scopeListShown(): boolean {
    return state.showLeftOut;
}

export function setScopeListShown(shown: boolean): void {
    state.showLeftOut = shown;
}

const KIND_ICON: Record<ScopeRule["kind"], string> = { folder: "folder", tag: "hash", property: "list" };

/** A rule as a sentence, its values as chips. */
export function renderSentence(host: HTMLElement, rule: ScopeRule): void {
    const sentence = host.createSpan({ cls: c("scope-sentence") });
    for (const part of ruleSentenceParts(rule)) {
        if ("text" in part) {
            sentence.createSpan({ text: part.text });
            continue;
        }
        part.chips.forEach((chip, index) => {
            if (index > 0) sentence.createSpan({ text: ` ${t("scope_rule_or")} ` });
            sentence.createSpan({ cls: c("scope-chip"), text: chip });
        });
    }
}

function countText(count: number, mode: DraftMode): string {
    if (count === 0) return t(mode === "keep" ? "settings_scope_keeps_none" : "settings_scope_leaves_out_none");
    return tCount(count, mode === "keep" ? "settings_scope_keeps" : "settings_scope_leaves_out", count.toLocaleString());
}

/** Draw the whole card into `host`. Re-run freely: it reads its state, it does not keep DOM. */
export function renderScopeCard(host: HTMLElement, deps: ScopeCardDeps): void {
    host.empty();
    const redraw = () => renderScopeCard(host, deps);
    const rules = deps.rules();
    const compiled = deps.compiled();
    const facts = deps.facts();
    let classes: Classification[] = [];
    // Timed through the shared instrument, so Health's timings show what it costs on this vault.
    const census = measure(
        "scope.census",
        () => {
            classes = classifyAll(compiled, facts);
            return scopeCensus(compiled, facts, classes);
        },
        { scale: facts.length }
    );
    const card = host.createDiv({ cls: c("scope-card") });

    // ── the summary ─────────────────────────────────────────────────────────
    const summary = card.createDiv({ cls: c("scope-summary") });
    setIcon(summary.createSpan({ cls: c("scope-summary-icon") }), "shield-check");
    const words = summary.createDiv({ cls: c("scope-summary-words") });
    words.createDiv({
        cls: c("scope-summary-line"),
        text: tCount(census.total, "settings_scope_summary", census.knowledge.toLocaleString(), census.total.toLocaleString()),
    });
    const second: string[] = [];
    if (census.leftOutByRules > 0) second.push(tCount(census.leftOutByRules, "settings_scope_summary_left_out", census.leftOutByRules.toLocaleString()));
    if (census.keptByExceptions > 0) second.push(tCount(census.keptByExceptions, "settings_scope_summary_kept", census.keptByExceptions.toLocaleString()));
    if (census.system > 0) second.push(tCount(census.system, "settings_scope_summary_system", census.system.toLocaleString()));
    if (second.length > 0) words.createDiv({ cls: c("scope-hint"), text: second.join(" · ") });
    if (deps.leftOutList && census.leftOutByRules > 0) {
        // The toggle sits in the summary, beside the number it explains; the list opens under it.
        deps.leftOutList(summary, card.createDiv({ cls: c("scope-left-out-host") }), census, rules, redraw);
    }
    if (census.allOut) card.createDiv({ cls: c("scope-caution"), text: t("settings_scope_all_out") });

    const editorFor = (mode: DraftMode): HTMLElement | null => {
        if (!state.draft || state.draft.mode !== mode || deps.isPhone) return null;
        return card.createDiv({ cls: c("scope-editor-host") });
    };

    const openDraft = (draft: ScopeDraft) => {
        state.draft = draft;
        redraw();
    };

    const commit = async (next: ScopeRules) => {
        state.draft = null;
        state.sheet?.finish();
        state.sheet = null;
        await deps.commit(next);
        redraw();
    };

    const editorContext = (draft: ScopeDraft, drawEditor: () => void) => ({
        draft,
        vocabulary: scopeVocabulary(facts),
        compiled,
        classes,
        facts,
        folderExists: (path: string) => deps.folderExists(path),
        change: (next: ScopeDraft) => {
            state.draft = next;
            drawEditor();
        },
        cancel: () => {
            state.draft = null;
            state.sheet?.finish();
            state.sheet = null;
            redraw();
        },
        confirm: (rule: ScopeRule) => {
            const list = draft.mode === "keep" ? rules.keep : rules.leaveOut;
            const nextList = draft.editing >= 0 ? list.map((r, i) => (i === draft.editing ? rule : r)) : [...list, rule];
            void commit(draft.mode === "keep" ? { leaveOut: rules.leaveOut, keep: nextList } : { leaveOut: nextList, keep: rules.keep });
        },
    });

    const mountEditor = (host: HTMLElement) => {
        const draw = () => {
            if (state.draft) renderRuleEditor(host, editorContext(state.draft, draw));
        };
        draw();
    };

    // ── the rules, then the exceptions ──────────────────────────────────────
    const section = (mode: DraftMode) => {
        const list = mode === "keep" ? rules.keep : rules.leaveOut;
        const counts = mode === "keep" ? census.perException : census.perRule;
        const heading = card.createDiv({ cls: c("scope-section") });
        heading.createDiv({
            cls: c("scope-section-title"),
            text: t(mode === "keep" ? "settings_scope_exceptions_heading" : "settings_scope_rules_heading"),
        });
        heading.createDiv({ cls: c("scope-hint"), text: t(mode === "keep" ? "settings_scope_exceptions_hint" : "settings_scope_rules_hint") });
        if (mode === "leaveOut" && list.length === 0) card.createDiv({ cls: c("scope-empty"), text: t("settings_scope_no_rules") });
        list.forEach((rule, index) => {
            const row = card.createDiv({ cls: [c("scope-rule"), ...(mode === "keep" ? [c("scope-rule--keep")] : [])] });
            setIcon(row.createSpan({ cls: c("scope-rule-icon") }), KIND_ICON[rule.kind]);
            renderSentence(row, rule);
            row.createSpan({ cls: c("scope-count"), text: countText(counts[index] ?? 0, mode) });
            const edit = row.createEl("button", {
                cls: "clickable-icon",
                attr: { type: "button", "aria-label": t("settings_scope_edit") },
            });
            setIcon(edit, "pencil");
            edit.addEventListener("click", () => openDraft(draftFromRule(rule, mode, index)));
            const remove = row.createEl("button", {
                cls: "clickable-icon",
                attr: { type: "button", "aria-label": t("settings_scope_remove") },
            });
            setIcon(remove, "x");
            remove.addEventListener("click", () => {
                const next = list.filter((_, i) => i !== index);
                void commit(mode === "keep" ? { leaveOut: rules.leaveOut, keep: next } : { leaveOut: next, keep: rules.keep });
            });
        });
        const editorHost = editorFor(mode);
        if (editorHost) mountEditor(editorHost);
        if (!state.draft || state.draft.mode !== mode) {
            const addKey: LocaleKey = mode === "keep" ? "settings_scope_add_exception" : "settings_scope_add_rule";
            const add = card.createEl("button", { cls: c("scope-add"), attr: { type: "button" } });
            setIcon(add.createSpan({ cls: c("scope-add-icon") }), "plus");
            add.createSpan({ text: t(addKey) });
            add.addEventListener("click", () => openDraft(newDraft(mode)));
        }
    };
    section("leaveOut");
    section("keep");

    // ── ZettelFlow's own folders ────────────────────────────────────────────
    const system = deps.system();
    const locked = card.createDiv({ cls: c("scope-locked") });
    const lockedHead = locked.createDiv({ cls: c("scope-locked-head") });
    setIcon(lockedHead.createSpan({ cls: c("scope-locked-icon") }), "lock");
    lockedHead.createSpan({ text: t("settings_scope_locked_heading") });
    const chips = locked.createDiv({ cls: c("scope-locked-chips") });
    for (const folder of system.folders) {
        const label = folder === system.thinking ? `${t("settings_scope_thinking_space")} · ${folder}` : folder;
        chips.createSpan({ cls: c("scope-chip"), text: label, attr: { title: folder } });
    }

    // ── the phone sheet ─────────────────────────────────────────────────────
    if (deps.isPhone && state.draft) {
        if (state.sheet) state.sheet.redraw();
        else
            state.sheet = deps.openSheet(
                (sheetHost) => mountEditor(sheetHost),
                () => {
                    state.draft = null;
                    state.sheet = null;
                    redraw();
                }
            );
    }
}
