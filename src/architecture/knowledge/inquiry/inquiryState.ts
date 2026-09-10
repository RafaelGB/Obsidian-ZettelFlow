/** One human-owned inquiry (#401). No graph event, metric or activity log can resolve it. */
export type InquiryProvenance = { origin: 'human' } | { origin: 'ai' | 'derived'; verdict: 'accepted' | 'modified' };
export interface InquiryOperation {
    id: string;
    kind: 'outcome' | 'capture';
    path: string;
    content: string;
    revision: number;
    references: string[];
}
export interface Inquiry {
    id: string;
    revision: number;
    purpose: string;
    focusPath: string | null;
    selectedPaths: string[];
    consultedPaths: string[];
    /** Observed deletions remain unavailable even if another file later occupies the same path. */
    missingPaths: string[];
    scope: 'selected' | 'neighbors';
    response: string;
    gaps: string;
    provenance: InquiryProvenance;
    confidence?: 'low' | 'medium' | 'high';
    disposition: 'continue' | 'insufficient' | 'stop';
    resolution: 'unresolved' | 'sufficient-for-now';
    lastDecision?: { at: number; sufficient: boolean; purpose: string };
    paused: boolean;
    pending?: InquiryOperation;
    receipt?: { id: string; path: string; revision: number };
}
export interface InquiryStorage { version: 1; current: Inquiry | null }
export type InquiryLoadResult = { status: 'empty' | 'ready'; current: Inquiry | null } | { status: 'corrupt' | 'unsupported'; current: null };
export type InquiryEdit =
    | { kind: 'text'; field: 'purpose' | 'response' | 'gaps'; value: string }
    | { kind: 'focus' | 'select' | 'remove'; path: string }
    | { kind: 'consult'; path: string; consulted: boolean }
    | { kind: 'scope'; scope: Inquiry['scope'] }
    | { kind: 'confidence'; confidence: Inquiry['confidence'] }
    | { kind: 'disposition'; disposition: Inquiry['disposition'] }
    | { kind: 'resolve'; sufficient: boolean }
    | { kind: 'pause'; paused: boolean };

export function createInquiry(id: string): Inquiry {
    return { id, revision: 0, purpose: '', focusPath: null, selectedPaths: [], consultedPaths: [], missingPaths: [], scope: 'selected', response: '', gaps: '', provenance: { origin: 'human' }, disposition: 'continue', resolution: 'unresolved', paused: false };
}

/** Edits are never truncated. Over-limit drafts remain editable but cannot be checkpointed. */
export function updateInquiry(current: Inquiry, edit: InquiryEdit, now: number): Inquiry {
    const next: Inquiry = { ...current, revision: current.revision + 1 };
    const add = (list: string[], path: string) => list.includes(path) ? list : [...list, path];
    switch (edit.kind) {
        case 'text':
            next[edit.field] = edit.value;
            if (edit.field === 'purpose' && current.purpose !== edit.value) next.resolution = 'unresolved';
            if (edit.field === 'response') next.provenance = current.provenance.origin === 'human' ? { origin: 'human' } : { origin: current.provenance.origin, verdict: 'modified' };
            break;
        case 'focus':
            next.focusPath = edit.path;
            next.selectedPaths = add(current.selectedPaths, edit.path);
            next.missingPaths = current.missingPaths.filter(path => path !== edit.path);
            break;
        case 'select':
            next.selectedPaths = add(current.selectedPaths, edit.path);
            next.missingPaths = current.missingPaths.filter(path => path !== edit.path);
            break;
        case 'remove':
            next.selectedPaths = current.selectedPaths.filter(path => path !== edit.path);
            if (current.focusPath === edit.path) next.focusPath = null;
            break;
        case 'consult': next.consultedPaths = edit.consulted ? add(current.consultedPaths, edit.path) : current.consultedPaths.filter(path => path !== edit.path); break;
        case 'scope': next.scope = edit.scope; break;
        case 'confidence': next.confidence = edit.confidence; break;
        case 'disposition': next.disposition = edit.disposition; break;
        case 'pause': next.paused = edit.paused; break;
        case 'resolve':
            next.resolution = edit.sufficient ? 'sufficient-for-now' : 'unresolved';
            next.lastDecision = { at: now, sufficient: edit.sufficient, purpose: current.purpose };
            break;
    }
    return next;
}

export function safeInquiryPath(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
        !/[\\:*?"<>|]/.test(value) && !Array.from(value).some(char => char.charCodeAt(0) < 32) && value.split('/').every(part => !!part && part !== '.' && part !== '..' && !part.startsWith('.') && !/[. ]$/.test(part));
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function paths(value: unknown, limit: number): value is string[] { return Array.isArray(value) && value.length <= limit && value.every(safeInquiryPath) && new Set(value).size === value.length; }
function revision(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
export function validProvenance(value: unknown): value is InquiryProvenance {
    return object(value) && (value.origin === 'human' || ((value.origin === 'ai' || value.origin === 'derived') && (value.verdict === 'accepted' || value.verdict === 'modified')));
}
function validOperation(value: unknown): value is InquiryOperation {
    return object(value) && typeof value.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value.id) &&
        (value.kind === 'capture' || value.kind === 'outcome') && safeInquiryPath(value.path) &&
        typeof value.content === 'string' && value.content.length <= 300000 && revision(value.revision) && paths(value.references, 200);
}
/** Validation is explicit and non-destructive, including restored JSON and pending writes. */
export function inquiryErrors(value: unknown): string[] {
    if (!object(value)) return ['shape'];
    const errors: string[] = [];
    if (typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.id)) errors.push('id');
    if (!revision(value.revision)) errors.push('revision');
    for (const [field, limit] of [['purpose', 4000], ['response', 64000], ['gaps', 32000]] as const) {
        if (typeof value[field] !== 'string' || value[field].length > limit) errors.push(field);
    }
    if (!paths(value.selectedPaths, 20)) errors.push('selectedPaths');
    if (!paths(value.consultedPaths, 200)) errors.push('consultedPaths');
    if (!paths(value.missingPaths, 220)) errors.push('missingPaths');
    if (value.focusPath !== null && (!safeInquiryPath(value.focusPath) || !Array.isArray(value.selectedPaths) || !value.selectedPaths.includes(value.focusPath))) errors.push('focusPath');
    if (!['selected', 'neighbors'].includes(String(value.scope))) errors.push('scope');
    if (!['continue', 'insufficient', 'stop'].includes(String(value.disposition))) errors.push('disposition');
    if (!['unresolved', 'sufficient-for-now'].includes(String(value.resolution))) errors.push('resolution');
    if (typeof value.paused !== 'boolean') errors.push('paused');
    if (!validProvenance(value.provenance)) errors.push('provenance');
    if (value.confidence !== undefined && (typeof value.confidence !== 'string' || !['low', 'medium', 'high'].includes(value.confidence))) errors.push('confidence');
    if (value.lastDecision !== undefined && (!object(value.lastDecision) || !Number.isFinite(value.lastDecision.at) || typeof value.lastDecision.sufficient !== 'boolean' || typeof value.lastDecision.purpose !== 'string' || value.lastDecision.purpose.length > 4000)) errors.push('lastDecision');
    if (value.pending !== undefined && !validOperation(value.pending)) errors.push('pending');
    if (value.receipt !== undefined && (!object(value.receipt) || typeof value.receipt.id !== 'string' || !safeInquiryPath(value.receipt.path) || !revision(value.receipt.revision))) errors.push('receipt');
    return errors;
}
export function parseInquiryStorage(raw: unknown): InquiryLoadResult {
    if (raw === undefined) return { status: 'empty', current: null };
    if (!object(raw)) return { status: 'corrupt', current: null };
    if (raw.version !== 1) return { status: 'unsupported', current: null };
    if (raw.current === null) return { status: 'empty', current: null };
    if (inquiryErrors(raw.current).length) return { status: 'corrupt', current: null };
    return { status: 'ready', current: JSON.parse(JSON.stringify(raw.current)) as Inquiry };
}