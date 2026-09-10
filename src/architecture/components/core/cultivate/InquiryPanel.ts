import { Component } from 'obsidian';
import { c } from 'architecture/styles/helper';
import { t } from 'architecture/lang';
import { InquiryRuntime, type InquiryStatus } from 'architecture/plugin/inquiry/InquiryRuntime';
import type { Inquiry, InquiryContext, InquiryOutcomeLabels } from 'architecture/knowledge/state';

type Key = Parameters<typeof t>[0];
export interface InquiryPanelDependencies {
    runtime: InquiryRuntime;
    pick(select: (path: string) => void): void;
    capture(): void;
    open(path: string): Promise<void>;
    canUse(path: string): boolean;
    confirm(key: Key, action: () => Promise<void>): void;
    context(inquiry: Inquiry): { status: 'loading' | 'error' | 'ready'; value?: InquiryContext };
}
const statusKeys: Record<InquiryStatus, Key> = {
    empty: 'inquiry_intro', dirty: 'inquiry_dirty', saving: 'inquiry_saving', saved: 'inquiry_saved', error: 'inquiry_error_save', invalid: 'inquiry_error_invalid', corrupt: 'inquiry_error_load', unsupported: 'inquiry_error_load', conflict: 'inquiry_conflict', partial: 'inquiry_partial_write',
};

/** Stable editors and replaceable context: metadata refresh never empties a focused response. */
export class InquiryPanel extends Component {
    private mounted: string | null | undefined;
    private statusEl!: HTMLElement;
    private contextEl!: HTMLElement;
    private focusEl!: HTMLElement;
    private decisionEl!: HTMLElement;
    private inputs: Partial<Record<'purpose' | 'response' | 'gaps', HTMLTextAreaElement>> = {};
    private buttons: HTMLButtonElement[] = [];
    private confidence!: HTMLSelectElement;
    private disposition!: HTMLSelectElement;
    private scope!: HTMLSelectElement;
    private destination!: HTMLInputElement;
    private contextKey = '';
    constructor(private readonly container: HTMLElement, private readonly deps: InquiryPanelDependencies) { super(); }
    onload(): void { this.register(this.deps.runtime.subscribe(() => this.sync())); this.sync(); }
    onunload(): void { this.container.empty(); }
    private button(host: HTMLElement, key: Key, id: string, action: () => void, writes = false): HTMLButtonElement {
        const button = host.createEl('button', { text: t(key), attr: { 'data-inquiry': id, 'aria-label': t(key) } });
        button.addEventListener('click', action);
        if (writes) this.buttons.push(button);
        return button;
    }
    private build(q: Inquiry | null): void {
        this.container.empty(); this.inputs = {}; this.buttons = []; this.contextKey = '';
        const root = this.container.createDiv({ cls: c('inquiry') });
        root.createEl('h3', { text: t('inquiry_title') });
        root.createEl('p', { text: t('inquiry_intro') });
        root.createEl('p', { text: t('inquiry_storage_disclosure'), cls: c('inquiry-help') });
        this.statusEl = root.createDiv({ attr: { role: 'status', 'aria-live': 'polite' } });
        if (!q) {
            this.button(root, 'inquiry_start', 'start', () => this.deps.runtime.start());
            this.button(root, 'inquiry_reset_storage', 'reset', () => this.deps.confirm('inquiry_clear_confirm', async () => { await this.deps.runtime.clear(true); }));
            return;
        }
        this.focusEl = root.createDiv();
        const selection = root.createDiv({ cls: c('inquiry-actions') });
        this.button(selection, 'inquiry_choose_note', 'choose', () => this.deps.pick(path => { if (this.deps.canUse(path)) this.deps.runtime.update({ kind: 'focus', path }); }));
        this.button(selection, 'inquiry_use_context', 'add-context', () => this.deps.pick(path => { if (this.deps.canUse(path)) this.deps.runtime.update({ kind: 'select', path }); }));
        this.button(selection, 'inquiry_capture', 'capture', () => this.deps.capture(), true);
        for (const field of ['purpose', 'response', 'gaps'] as const) {
            const label = root.createEl('label', { text: t(`inquiry_${field}_label`), cls: c('inquiry-field') });
            const area = label.createEl('textarea', { attr: { rows: field === 'response' ? '6' : '2', 'aria-label': t(`inquiry_${field}_label`), 'data-inquiry': field } });
            area.value = q[field];
            area.addEventListener('input', () => this.deps.runtime.update({ kind: 'text', field, value: area.value }));
            this.inputs[field] = area;
        }
        this.confidence = this.select(root, 'proposal_confidence_label', [['', 'confidence_unset'], ['low', 'confidence_low'], ['medium', 'confidence_medium'], ['high', 'confidence_high']]);
        this.confidence.addEventListener('change', () => this.deps.runtime.update({ kind: 'confidence', confidence: this.confidence.value ? this.confidence.value as Inquiry['confidence'] : undefined }));
        this.disposition = this.select(root, 'inquiry_disposition_label', [['continue', 'inquiry_disposition_continue'], ['insufficient', 'inquiry_disposition_insufficient'], ['stop', 'inquiry_disposition_stop']]);
        this.disposition.addEventListener('change', () => this.deps.runtime.update({ kind: 'disposition', disposition: this.disposition.value as Inquiry['disposition'] }));
        this.decisionEl = root.createDiv({ attr: { 'aria-live': 'polite' } });
        const decisions = root.createDiv({ cls: c('inquiry-actions') });
        this.button(decisions, 'inquiry_mark_sufficient', 'resolve', () => this.deps.runtime.update({ kind: 'resolve', sufficient: true }));
        this.button(decisions, 'inquiry_reopen', 'reopen', () => this.deps.runtime.update({ kind: 'resolve', sufficient: false }));
        this.scope = this.select(root, 'inquiry_scope_label', [['selected', 'inquiry_scope_selected'], ['neighbors', 'inquiry_scope_neighbors']]);
        this.scope.addEventListener('change', () => this.deps.runtime.update({ kind: 'scope', scope: this.scope.value as Inquiry['scope'] }));
        root.createEl('p', { text: t('inquiry_method'), cls: c('inquiry-help') });
        this.contextEl = root.createDiv({ attr: { 'data-inquiry': 'context' } });
        this.button(root, 'inquiry_refresh', 'refresh', () => this.refreshContext());
        const destination = root.createEl('label', { text: t('inquiry_outcome_path'), cls: c('inquiry-field') });
        this.destination = destination.createEl('input', { type: 'text', attr: { 'aria-label': t('inquiry_outcome_path') } });
        this.destination.placeholder = t('inquiry_outcome_placeholder');
        const actions = root.createDiv({ cls: c('inquiry-actions') });
        this.button(actions, 'inquiry_save', 'save', () => void this.deps.runtime.save(), true);
        this.button(actions, 'inquiry_pause', 'pause', () => void this.deps.runtime.pause(), true);
        this.button(actions, 'inquiry_resume', 'resume', () => this.deps.runtime.resume());
        this.button(actions, 'inquiry_save_outcome', 'outcome', () => void this.deps.runtime.saveOutcome(this.outcomeLabels(), this.destination.value.trim() || undefined), true);
        this.button(actions, 'inquiry_retry', 'retry', () => {
            const pending = this.deps.runtime.getSnapshot().current?.pending;
            if (pending) void this.deps.runtime.saveOutcome(this.outcomeLabels()); else void this.deps.runtime.save();
        }, true);
        this.button(actions, 'inquiry_open_outcome', 'open-outcome', () => {
            const current = this.deps.runtime.getSnapshot().current;
            const path = current?.pending?.path ?? current?.receipt?.path;
            if (path && this.deps.canUse(path)) void this.deps.open(path);
        });
        this.button(actions, 'inquiry_abandon', 'abandon', () => this.deps.confirm('inquiry_abandon_confirm', async () => { await this.deps.runtime.abandonPending(true); }), true);
        this.button(actions, 'inquiry_clear', 'clear', () => this.deps.confirm('inquiry_clear_confirm', async () => { await this.deps.runtime.clear(true); }), true);
    }
    private select(root: HTMLElement, key: Key, options: [string, Key][]): HTMLSelectElement {
        const label = root.createEl('label', { text: t(key), cls: c('inquiry-field') });
        const select = label.createEl('select', { attr: { 'aria-label': t(key) } });
        for (const [value, text] of options) select.createEl('option', { value, text: t(text) });
        return select;
    }
    private sync(): void {
        const { current: q, status, busy } = this.deps.runtime.getSnapshot();
        if (this.mounted !== (q?.id ?? null)) { this.mounted = q?.id ?? null; this.build(q); }
        this.statusEl.setText(t(statusKeys[status]));
        for (const button of this.buttons) button.disabled = busy;
        if (!q) return;
        for (const field of ['purpose', 'response', 'gaps'] as const) { const input = this.inputs[field]; if (input && input.value !== q[field]) input.value = q[field]; }
        this.focusEl.setText(`${t('inquiry_focus_label')}: ${q.focusPath ?? t('inquiry_no_focus')}`);
        this.decisionEl.setText(`${t(q.resolution === 'sufficient-for-now' ? 'inquiry_resolution_sufficient' : 'inquiry_resolution_unresolved')}${q.paused ? ` · ${t('inquiry_paused')}` : ''}`);
        this.confidence.value = q.confidence ?? ''; this.disposition.value = q.disposition; this.scope.value = q.scope;
        const key = JSON.stringify([q.selectedPaths, q.consultedPaths, q.missingPaths, q.scope]);
        if (key !== this.contextKey) { this.contextKey = key; this.refreshContext(); }
    }
    refreshContext(): void {
        const q = this.deps.runtime.getSnapshot().current; if (!q || !this.contextEl) return;
        this.contextEl.empty();
        try {
            // Selected/consulted history stays operable even while indexing or with no candidates.
            for (const path of q.selectedPaths) this.referenceRow(path, q, true);
            for (const path of q.consultedPaths.filter(path => !q.selectedPaths.includes(path))) this.referenceRow(path, q, false);
            const result = this.deps.context(q);
            if (result.status !== 'ready' || !result.value) { this.contextEl.createEl('p', { text: t(result.status === 'error' ? 'inquiry_error_read' : 'inquiry_loading') }); return; }
            const context = result.value;
            if (context.truncated) this.contextEl.createEl('p', { text: t('inquiry_limit') });
            this.contextEl.createEl('p', { text: t('inquiry_recorded_not_verified') });
            for (const candidate of context.candidates) {
                const row = this.referenceRow(candidate.path, q, false);
                row.createEl('p', { text: `${candidate.reason.from} → ${candidate.reason.type} → ${candidate.reason.to}` });
            }
            if (!context.candidates.length) this.contextEl.createEl('p', { text: t('inquiry_no_candidates') });
            for (const edge of context.relations) this.contextEl.createEl('p', { text: `${edge.from} → ${edge.type} → ${edge.to}` });
            for (const evidence of context.evidence) this.contextEl.createEl('p', { text: `${evidence.path}: ${evidence.claim} — ${evidence.source}` });
        } catch { this.contextEl.createEl('p', { text: t('inquiry_error_read') }); }
    }
    private referenceRow(path: string, q: Inquiry, selected: boolean): HTMLElement {
        const row = this.contextEl.createDiv({ cls: c('inquiry-reference') }); row.createSpan({ text: path });
        const available = !q.missingPaths.includes(path) && this.deps.canUse(path);
        if (available) {
            this.button(row, 'inquiry_open_note', 'open', () => { if (this.deps.canUse(path)) void this.deps.open(path); });
            this.button(row, q.consultedPaths.includes(path) ? 'inquiry_unmark_consulted' : 'inquiry_mark_consulted', 'consult', () => { if (this.deps.canUse(path)) this.deps.runtime.update({ kind: 'consult', path, consulted: !this.deps.runtime.getSnapshot().current?.consultedPaths.includes(path) }); });
        } else {
            row.createSpan({ text: t('inquiry_reference_missing') });
            if (q.consultedPaths.includes(path)) this.button(row, 'inquiry_unmark_consulted', 'unconsult', () => this.deps.runtime.update({ kind: 'consult', path, consulted: false }));
        }
        if (selected) this.button(row, 'inquiry_remove_context', 'remove', () => this.deps.runtime.update({ kind: 'remove', path }));
        else if (available && !q.selectedPaths.includes(path)) this.button(row, 'inquiry_use_context', 'select', () => this.deps.runtime.update({ kind: 'select', path }));
        return row;
    }
    private outcomeLabels(): InquiryOutcomeLabels {
        return { purpose: t('inquiry_purpose_label'), response: t('inquiry_response_label'), gaps: t('inquiry_gaps_label'), references: t('inquiry_consulted_heading'), empty: t('inquiry_empty_evidence'), authored: t('inquiry_provenance_authored'), accepted: t('inquiry_provenance_accepted'), modified: t('inquiry_provenance_modified'), confidence: t('proposal_confidence_label'), unresolved: t('inquiry_resolution_unresolved'), sufficient: t('inquiry_resolution_sufficient'), continue: t('inquiry_disposition_continue'), insufficient: t('inquiry_disposition_insufficient'), stop: t('inquiry_disposition_stop'), unavailable: t('inquiry_reference_missing') };
    }
}
