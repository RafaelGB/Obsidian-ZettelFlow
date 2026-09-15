import { log } from "architecture";
import {
    DEFAULT_DRAFT_MAX_AGE_MS,
    DraftSnapshot,
    MAX_DRAFTS,
    WizardDraft,
    findDraft,
    isResumable,
    pruneDrafts,
    readDrafts,
    removeDraft,
    serializeDraft,
    upsertDraft,
} from "application/notes/draftState";

/** What the store needs from the plugin. Injected, never looked up (see below). */
export interface DraftHost {
    /** The raw persisted blob; unknown shapes are retained untouched. */
    read(): unknown;
    write(value: unknown): void;
    /** Whether drafts are kept at all. */
    enabled(): boolean;
    /** Does this canvas still exist in the vault? */
    canvasExists(path: string): boolean;
    persist(): Promise<void>;
    now(): number;
}

/**
 * Keeps the note-builder's unfinished work (#410, epic #405).
 *
 * The plugin reference is **injected** rather than resolved through `getOwnPlugin()`: that returns
 * `undefined` during enable/reload, which is exactly when a draft is read (#374 — the same mistake
 * silently disabled excluded paths).
 *
 * Every write goes through `persist()`, i.e. the shared serialized writer, and a blob this version
 * cannot parse is left in place: it is simply not offered.
 */
export class DraftStore {
    private static instance: DraftStore;
    private host: DraftHost | undefined;

    public static getInstance(): DraftStore {
        if (!DraftStore.instance) DraftStore.instance = new DraftStore();
        return DraftStore.instance;
    }

    public init(host: DraftHost): void {
        this.host = host;
    }

    /** Test seam: forget the host (a disabled plugin must not keep one alive). */
    public release(): void {
        this.host = undefined;
    }

    private drafts(): WizardDraft[] {
        if (!this.host) return [];
        return readDrafts(this.host.read());
    }

    /**
     * The draft worth offering for this canvas: parseable, recent, non-empty, and its canvas still
     * there. `undefined` when there is nothing to resume.
     */
    public offer(canvasPath: string): WizardDraft | undefined {
        if (!this.host || !this.host.enabled()) return undefined;
        const alive = pruneDrafts(this.drafts(), {
            now: this.host.now(),
            maxAgeMs: DEFAULT_DRAFT_MAX_AGE_MS,
            canvasExists: (path) => this.host?.canvasExists(path) ?? false,
        });
        const draft = findDraft(alive, canvasPath);
        if (!draft || !isResumable(draft)) return undefined;
        return draft;
    }

    /** Every draft still worth offering, newest first — what Home nudges about (#410 FR-10). */
    public resumable(): WizardDraft[] {
        if (!this.host || !this.host.enabled()) return [];
        return pruneDrafts(this.drafts(), {
            now: this.host.now(),
            maxAgeMs: DEFAULT_DRAFT_MAX_AGE_MS,
            canvasExists: (path) => this.host?.canvasExists(path) ?? false,
        })
            .filter(isResumable)
            .sort((a, b) => b.savedAt - a.savedAt);
    }

    /** Persist a session. Does nothing when drafts are off or the session holds no work. */
    public save(snapshot: DraftSnapshot): void {
        if (!this.host || !this.host.enabled()) return;
        const draft = serializeDraft(snapshot);
        if (!isResumable(draft)) return;
        this.write(upsertDraft(this.drafts(), draft, MAX_DRAFTS));
        log.debug(`[draft] saved for ${draft.canvasPath}`);
    }

    /** Forget the draft for a canvas — the note was created, or the user started fresh. */
    public clear(canvasPath: string): void {
        if (!this.host) return;
        const remaining = removeDraft(this.drafts(), canvasPath);
        if (remaining.length === this.drafts().length) return;
        this.write(remaining);
        log.debug(`[draft] cleared for ${canvasPath}`);
    }

    private write(drafts: WizardDraft[]): void {
        if (!this.host) return;
        this.host.write(drafts);
        void this.host.persist().catch(() => {
            log.error("[draft] could not persist the note-builder draft");
        });
    }
}

export const draftStore = DraftStore.getInstance();
