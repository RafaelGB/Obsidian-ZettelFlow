import { normalizePath } from 'obsidian';
import { createInquiry, updateInquiry, inquiryErrors, parseInquiryStorage, safeInquiryPath, type Inquiry, type InquiryEdit, type InquiryStorage, type InquiryOperation } from 'architecture/knowledge/inquiry/inquiryState';
import { renderInquiryOutcome, type InquiryOutcomeLabels } from 'architecture/knowledge/inquiry/inquiryOutcome';
import type { CreateFileResult } from '../services/FileService';

export interface InquiryHost {
    load(): unknown;
    persist(storage: InquiryStorage): Promise<void>;
    now(): number;
    id(): string;
    inScope?(path: string): boolean;
    available?(path: string): boolean;
    link?(path: string, destination: string): string;
    writeOperation?(operation: InquiryOperation): Promise<CreateFileResult>;
    planCapture?(title: string, id: string): InquiryOperation;
}
export type InquiryStatus = 'empty' | 'dirty' | 'saving' | 'saved' | 'error' | 'invalid' | 'corrupt' | 'unsupported' | 'conflict' | 'partial';
export interface InquiryRuntimeSnapshot { current: Inquiry | null; status: InquiryStatus; busy: boolean }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

/** Private local draft owner. Views subscribe but never own the saved inquiry or an I/O transaction. */
export class InquiryRuntime {
    private static instance: InquiryRuntime;
    static getInstance(): InquiryRuntime { return this.instance ??= new InquiryRuntime(); }
    private host: InquiryHost | null = null;
    private current: Inquiry | null = null;
    private status: InquiryStatus = 'empty';
    private acknowledged = -1;
    private epoch = 0;
    private busy = false;
    private listeners = new Set<() => void>();

    init(host: InquiryHost): void {
        this.dispose();
        this.host = host;
        const loaded = parseInquiryStorage(host.load());
        this.current = loaded.current;
        this.status = loaded.status === 'ready' ? 'saved' : loaded.status;
        this.acknowledged = this.current?.revision ?? -1;
    }
    dispose(): void {
        this.epoch++;
        this.host = null;
        this.current = null;
        this.busy = false;
        this.listeners.clear();
    }
    getSnapshot(): InquiryRuntimeSnapshot { return { current: copy(this.current), status: this.status, busy: this.busy }; }
    subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    private emit(): void { for (const listener of this.listeners) listener(); }
    start(): boolean {
        if (!this.host || this.current || this.status === 'corrupt' || this.status === 'unsupported' || this.busy) return false;
        this.current = createInquiry(this.host.id()); this.status = 'dirty'; this.emit(); return true;
    }
    update(edit: InquiryEdit): void {
        if (!this.current || !this.host) return;
        this.current = updateInquiry(this.current, edit, this.host.now());
        if (!this.busy) this.status = 'dirty';
        this.emit();
    }
    async save(): Promise<boolean> {
        if (!this.current || !this.host || this.busy) return false;
        if (inquiryErrors(this.current).length) { this.status = 'invalid'; this.emit(); return false; }
        const snapshot = copy(this.current);
        return this.run(() => this.checkpoint(snapshot));
    }
    async pause(): Promise<boolean> { if (this.busy) return false; this.update({kind: 'pause', paused: true}); return this.save(); }
    resume(): void { if (this.current?.paused) this.update({kind: 'pause', paused: false}); }
    /** Observed events only. Never guess an offline rename from a title or basename. */
    rename(oldPath: string, newPath: string, unambiguous: boolean): void {
        const q = this.current;
        if (!q || !unambiguous || q.missingPaths.includes(oldPath) || !safeInquiryPath(newPath)) return;
        if (!q.selectedPaths.includes(oldPath) && !q.consultedPaths.includes(oldPath)) return;
        const remap = (list: string[]) => [...new Set(list.map(path => path === oldPath ? newPath : path))];
        this.current = { ...q, revision: q.revision + 1, focusPath: q.focusPath === oldPath ? newPath : q.focusPath, selectedPaths: remap(q.selectedPaths), consultedPaths: remap(q.consultedPaths) };
        if (!this.busy) this.status = 'dirty'; this.emit();
    }
    markMissing(path: string): void {
        const q = this.current;
        if (!q || q.missingPaths.includes(path) || (!q.selectedPaths.includes(path) && !q.consultedPaths.includes(path))) return;
        this.current = { ...q, revision: q.revision + 1, missingPaths: [...q.missingPaths, path] };
        if (!this.busy) this.status = 'dirty'; this.emit();
    }
    /** Abandon only bookkeeping for an ambiguous operation, never its potentially created file. */
    async abandonPending(confirmed: boolean): Promise<boolean> {
        if (!confirmed || this.busy || !this.current?.pending) return false;
        this.current = { ...this.current, revision: this.current.revision + 1, pending: undefined };
        return this.save();
    }
    async saveOutcome(labels: InquiryOutcomeLabels, destination?: string): Promise<boolean> {
        const q = this.current; const host = this.host;
        if (!q || !host || this.busy) return false;
        if (!q.pending && q.receipt?.revision === q.revision) { this.status = 'saved'; this.emit(); return true; }
        if (!q.pending) {
            try {
                const id = host.id(); const path = normalizePath(destination || `Inquiry ${id}.md`);
                if (!safeInquiryPath(path) || !path.endsWith('.md') || !host.inScope?.(path)) throw new Error('Invalid destination');
                const refs = q.consultedPaths.map(ref => ({path:ref, link: this.available(ref) ? host.link?.(ref, path) : undefined}));
                const content = renderInquiryOutcome({inquiry:q,operationId:id,references:refs}, labels);
                this.current = { ...q, pending: {id, kind:'outcome', path, content, revision:q.revision, references:refs.filter(ref => ref.link !== undefined).map(ref => ref.path)} };
            } catch { this.status = 'invalid'; this.emit(); return false; }
        }
        return this.finishOperation();
    }
    async capture(title: string): Promise<boolean> {
        if (!this.current || !this.host || this.busy) return false;
        if (this.current.pending?.kind === 'outcome') { this.status = 'conflict'; this.emit(); return false; }
        if (!this.current.pending) {
            try {
                const operation = this.host.planCapture?.(title, this.host.id());
                if (!operation) return false;
                this.current = { ...this.current, pending: {...operation, revision:this.current.revision} };
            } catch { this.status = 'invalid'; this.emit(); return false; }
        }
        return this.finishOperation();
    }
    private available(path: string): boolean {
        return !!this.host?.inScope?.(path) && !this.current?.missingPaths.includes(path) && !!this.host.available?.(path);
    }
    private async finishOperation(): Promise<boolean> {
        const q = this.current; const host = this.host; const epoch = this.epoch;
        if (!q?.pending || !host?.writeOperation || inquiryErrors(q).length) { this.status='invalid'; this.emit(); return false; }
        const op = copy(q.pending);
        const allowed = () => epoch === this.epoch && !!host.inScope?.(op.path) && op.references.every(path => this.available(path));
        return this.run(async () => {
            if (!allowed()) { this.status = 'conflict'; return false; }
            if (!await this.checkpoint(copy(q)) || !allowed()) { if (epoch === this.epoch) this.status = 'conflict'; return false; }
            const written = await host.writeOperation!(op);
            if (epoch !== this.epoch) return false;
            if (written.status === 'failed' || written.status === 'conflict') { this.status = written.status === 'conflict' ? 'conflict' : 'error'; return false; }
            if (!allowed()) { this.status = 'conflict'; return false; }
            const draft = this.current!;
            let completed: Inquiry = { ...draft, pending: undefined };
            if (op.kind === 'outcome') completed.receipt = {id:op.id,path:op.path,revision:op.revision};
            else completed = updateInquiry(completed, {kind: draft.focusPath === q.focusPath ? 'focus' : 'select', path:op.path}, host.now());
            // Keep pending visible until receipt acknowledgement. Edits made during that await survive.
            try {
                await host.persist({version:1,current:copy(completed)});
                if (epoch !== this.epoch) return false;
                if (this.current?.revision === draft.revision) this.current = completed;
                else if (this.current) this.current = { ...this.current, pending: undefined, receipt: completed.receipt };
                this.acknowledged = completed.revision;
                this.status = this.current?.revision === completed.revision ? 'saved' : 'dirty';
                return true;
            } catch { if (epoch === this.epoch) this.status = 'partial'; return false; }
        });
    }
    async clear(confirmed: boolean): Promise<boolean> {
        if (!confirmed || !this.host || this.busy) return false;
        const epoch = this.epoch;
        return this.run(async () => {
            await this.host!.persist({version: 1, current: null});
            if (epoch !== this.epoch) return false;
            this.current = null; this.acknowledged = -1; this.status = 'empty'; return true;
        });
    }
    private async checkpoint(snapshot: Inquiry): Promise<boolean> {
        const epoch = this.epoch;
        await this.host!.persist({version: 1, current: copy(snapshot)});
        if (epoch !== this.epoch) return false;
        this.acknowledged = snapshot.revision;
        this.status = this.current?.revision === this.acknowledged ? 'saved' : 'dirty';
        return true;
    }
    private async run(work: () => Promise<boolean>): Promise<boolean> {
        const epoch = this.epoch;
        this.busy = true; this.status = 'saving'; this.emit();
        try { return await work(); }
        catch { if (epoch === this.epoch) this.status = 'error'; return false; }
        finally { if (epoch === this.epoch) { this.busy = false; this.emit(); } }
    }
}
