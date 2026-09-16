import type { Action } from "architecture/api";
import type { FinalElement } from "./typing";
import type { SatelliteDeclaration } from "./satellitePlan";

/**
 * The note-builder draft (#410, epic #405) — pure shape, validation and housekeeping.
 *
 * Closing the wizard used to destroy everything: `SelectorMenu` calls `actions.reset()` in its
 * unmount cleanup, so a misclick outside the modal, a reload, or simply going to look something up
 * cost the whole walk. The manifesto says the opposite: *"unfinished thinking deserves continuity,
 * not a demand to finish"*.
 *
 * Shaped after the inquiry checkpoint (#401): a **versioned, local, bounded** blob. Data that cannot
 * be parsed is **retained and not offered** rather than deleted — the plugin never destroys work it
 * merely fails to understand.
 *
 * Obsidian-free and side-effect-free; the runtime owner does the reading and writing.
 */

export const DRAFT_VERSION = 1;

/** One draft per canvas, and this many canvases at most (oldest dropped). */
export const MAX_DRAFTS = 5;

/** Drafts older than this are not offered. 30 days. */
export const DEFAULT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** A step the user already walked, kept so the resumed wizard can show where it left off. */
export interface WalkedStep {
    position: number;
    nodeId: string;
    title: string;
}

export interface WizardDraft {
    version: number;
    /** The canvas the flow belongs to — the draft's identity. */
    canvasPath: string;
    savedAt: number;
    title: string;
    position: number;
    targetFolder: string;
    walked: WalkedStep[];
    /** Step template paths by position, as `NoteDTO.getPaths()` holds them. */
    paths: [number, string][];
    /** Recorded action results by position. Restored, never re-executed. */
    elements: [number, FinalElement][];
    /** Connection links accepted in the companion pane. */
    links: string[];
    /** On-creation actions collected from the walked steps. */
    onCreation?: Action[];
    /**
     * The linked note a walked step declared (#419). Optional, so `DRAFT_VERSION` does not change:
     * a draft written before this field is still a valid draft.
     */
    satellite?: SatelliteDeclaration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isPairArray<T>(value: unknown, second: (candidate: unknown) => candidate is T): value is [number, T][] {
    return (
        Array.isArray(value) &&
        value.every(
            (entry) =>
                Array.isArray(entry) &&
                entry.length === 2 &&
                typeof entry[0] === "number" &&
                second(entry[1])
        )
    );
}

const isString = (value: unknown): value is string => typeof value === "string";
const isElement = (value: unknown): value is FinalElement => isRecord(value) && isString(value.type);

function isWalkedStep(value: unknown): value is WalkedStep {
    return (
        isRecord(value) &&
        typeof value.position === "number" &&
        isString(value.nodeId) &&
        isString(value.title)
    );
}

/** One draft, or `undefined` when the blob is not a draft this version understands. */
export function readDraft(value: unknown): WizardDraft | undefined {
    if (!isRecord(value)) return undefined;
    if (value.version !== DRAFT_VERSION) return undefined;
    if (!isString(value.canvasPath) || typeof value.savedAt !== "number") return undefined;
    if (!isString(value.title) || typeof value.position !== "number") return undefined;
    if (!isString(value.targetFolder)) return undefined;
    if (!Array.isArray(value.walked) || !value.walked.every(isWalkedStep)) return undefined;
    if (!isPairArray(value.paths, isString)) return undefined;
    if (!isPairArray(value.elements, isElement)) return undefined;
    if (!Array.isArray(value.links) || !value.links.every(isString)) return undefined;

    return {
        version: DRAFT_VERSION,
        canvasPath: value.canvasPath,
        savedAt: value.savedAt,
        title: value.title,
        position: value.position,
        targetFolder: value.targetFolder,
        walked: value.walked,
        paths: value.paths,
        elements: value.elements,
        links: value.links,
        onCreation: Array.isArray(value.onCreation) ? (value.onCreation as Action[]) : undefined,
        // Handed back as authored; validation is satellitePlan's job, not the reader's.
        satellite: isRecord(value.satellite)
            ? (value.satellite as unknown as SatelliteDeclaration)
            : undefined,
    };
}

/** Every draft the current version understands. Anything else is skipped, never thrown on. */
export function readDrafts(value: unknown): WizardDraft[] {
    if (!Array.isArray(value)) return [];
    const drafts: WizardDraft[] = [];
    for (const entry of value) {
        const draft = readDraft(entry);
        if (draft) drafts.push(draft);
    }
    return drafts;
}

export function findDraft(drafts: WizardDraft[], canvasPath: string): WizardDraft | undefined {
    return drafts.find((draft) => draft.canvasPath === canvasPath);
}

/** Replace the draft for this canvas (or add it), keeping the newest `cap` drafts. */
export function upsertDraft(
    drafts: WizardDraft[],
    draft: WizardDraft,
    cap: number = MAX_DRAFTS
): WizardDraft[] {
    const others = drafts.filter((entry) => entry.canvasPath !== draft.canvasPath);
    return [...others, draft].sort((a, b) => a.savedAt - b.savedAt).slice(-cap);
}

export function removeDraft(drafts: WizardDraft[], canvasPath: string): WizardDraft[] {
    return drafts.filter((draft) => draft.canvasPath !== canvasPath);
}

/** Drafts still worth offering: recent enough, and their canvas still exists. */
export function pruneDrafts(
    drafts: WizardDraft[],
    options: { now: number; maxAgeMs: number; canvasExists: (path: string) => boolean }
): WizardDraft[] {
    return drafts.filter(
        (draft) =>
            options.now - draft.savedAt <= options.maxAgeMs && options.canvasExists(draft.canvasPath)
    );
}

/** A draft with no work in it is noise; only offer one that actually holds something. */
export function isResumable(draft: WizardDraft): boolean {
    return (
        draft.title.trim().length > 0 ||
        draft.paths.length > 0 ||
        draft.elements.length > 0 ||
        draft.links.length > 0 ||
        draft.walked.length > 0
    );
}

/** What the wizard hands over when it closes. Plain data — no store, no React, no Obsidian. */
export interface DraftSnapshot {
    canvasPath: string;
    savedAt: number;
    title: string;
    position: number;
    targetFolder: string;
    walked: WalkedStep[];
    paths: Map<number, string>;
    elements: Map<number, FinalElement>;
    links: string[];
    onCreation: Action[];
    satellite?: SatelliteDeclaration;
}

/** Freeze a live wizard session into a persistable draft. */
export function serializeDraft(snapshot: DraftSnapshot): WizardDraft {
    return {
        version: DRAFT_VERSION,
        canvasPath: snapshot.canvasPath,
        savedAt: snapshot.savedAt,
        title: snapshot.title,
        position: snapshot.position,
        targetFolder: snapshot.targetFolder,
        walked: [...snapshot.walked],
        paths: [...snapshot.paths.entries()].sort((a, b) => a[0] - b[0]),
        elements: [...snapshot.elements.entries()].sort((a, b) => a[0] - b[0]),
        links: [...snapshot.links],
        onCreation: snapshot.onCreation.length > 0 ? [...snapshot.onCreation] : undefined,
        ...(snapshot.satellite ? { satellite: snapshot.satellite } : {}),
    };
}

/**
 * The note-side of a restore. A structural subset of `NoteDTO`, so this stays pure and a test can
 * hand it a fake.
 */
export interface DraftTarget {
    setTitle(title: string): unknown;
    setTargetFolder(folder: string | undefined): unknown;
    addPath(path: string | undefined, position: number): unknown;
    addFinalElement(element: FinalElement | undefined, position: number): unknown;
    addLink(basename: string | undefined): unknown;
    addOnCreation(actions: Action[]): unknown;
    setSatellite(declaration: SatelliteDeclaration | undefined): unknown;
}

/**
 * Put a draft back into a fresh note. Recorded action **results** are restored; actions are never
 * re-executed, because a step that already wrote something cannot be unwound (#410, OQ-2).
 */
export function restoreDraft(draft: WizardDraft, note: DraftTarget): void {
    note.setTitle(draft.title);
    if (draft.targetFolder) note.setTargetFolder(draft.targetFolder);
    for (const [position, path] of draft.paths) note.addPath(path, position);
    for (const [position, element] of draft.elements) note.addFinalElement(element, position);
    for (const link of draft.links) note.addLink(link);
    if (draft.onCreation && draft.onCreation.length > 0) note.addOnCreation(draft.onCreation);
    if (draft.satellite) note.setSatellite(draft.satellite);
}
