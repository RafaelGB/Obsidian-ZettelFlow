import { createInquiry, updateInquiry, inquiryErrors, parseInquiryStorage, type Inquiry, type InquiryEdit, type InquiryStorage } from 'architecture/knowledge/inquiry/inquiryState';

export interface InquiryHost {
    load(): unknown;
    persist(storage: InquiryStorage): Promise<void>;
    now(): number;
    id(): string;
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