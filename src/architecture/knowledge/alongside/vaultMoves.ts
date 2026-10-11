import type { KnowledgeModel } from "../model/KnowledgeModel";
import { noteNeighbourhood } from "../state/neighbourhood";
import { findContradictions } from "../query/findContradictionLogic";
import { sharedContext } from "./sharedContext";
import type { NearItem, NearReason } from "./near";

/**
 * **Moves answered by your vault** (#756, epic #741) — *Contradict* and *Connect* on a passage you
 * selected or marked, decided by the vault and never by an AI (FR-13). Each candidate says why it is
 * offered, in one line; there is no score.
 *
 * - **Contradict** (FR-2): the notes you have already typed as contradicting a note *near* the
 *   passage (#754) — your tensions, carried over to it.
 * - **Connect** (FR-3): the near notes themselves, then their supporting and expanding neighbours,
 *   then the unlinked notes that share context with them (discovery's own score).
 *
 * Left out: notes ruled out for this chapter (*Not related*, shared with Alongside), notes already in
 * a tension with this passage, and notes that already cite it. At most three, in a deterministic order.
 * Pure and Obsidian-free: this module cannot reach an AI provider, and a guardrail holds the line.
 */

/** How many candidates a move offers (FR-2, FR-3). */
export const VAULT_MOVE_LIMIT = 3;

/** The typed relations a passage can *belong with*: a supporting or expanding neighbour (FR-3). */
const BELONGS = new Set(["supports", "expands"]);

/** Why a candidate is offered — the line the card says. */
export type VaultMoveReason =
    /** A typed tension with `of`, a note near the passage (named in it, when `named`). */
    | { kind: "contradicts"; of: string; ofTitle: string; named: boolean }
    /** The near note itself, for the reason it is near. */
    | { kind: "near"; near: NearReason }
    /** A neighbour of `of`: it supports or expands `of` (`toward`), or `of` supports or expands it. */
    | { kind: "supports" | "expands"; of: string; ofTitle: string; toward: boolean }
    /** An unlinked note sharing context with `of`. */
    | { kind: "shared"; of: string; ofTitle: string };

export interface VaultCandidate {
    path: string;
    title: string;
    reason: VaultMoveReason;
}

export interface VaultMoveContext {
    /** Ruled out for this chapter (*Not related*): never offered (FR-8). */
    ruledOut?: ReadonlySet<string>;
    /** Notes already in a tension thought with this passage: not offered again by *Contradict*. */
    tensions?: ReadonlySet<string>;
    /** Notes whose `source` already cites this passage: not offered by *Connect*. */
    cites?: (path: string) => boolean;
    /** A pair ruled out as a gap (#534): not offered as shared context. */
    ruledOutGap?: (a: string, b: string) => boolean;
    /** The book being read: never a candidate. */
    book?: string;
    limit?: number;
}

/**
 * What is near **this passage**, for a move: named in it, born from this chapter, in your marks here.
 * A note born from another chapter is near the book, not the passage, and answers neither move.
 */
function nearThePassage(near: readonly NearItem[]): NearItem[] {
    return near.filter((item) => item.reason !== "born-book");
}

function titleOf(model: KnowledgeModel, path: string): string {
    return model.get(path)?.title ?? path;
}

/** Collects candidates in the order offered, each note once, until the limit. */
function collector(model: KnowledgeModel, context: VaultMoveContext, skip: (path: string) => boolean) {
    const limit = context.limit ?? VAULT_MOVE_LIMIT;
    const out: VaultCandidate[] = [];
    const seen = new Set<string>();
    return {
        out,
        full: () => out.length >= limit,
        add(path: string, reason: VaultMoveReason): void {
            if (out.length >= limit || seen.has(path)) return;
            if (!model.get(path) || path === context.book || context.ruledOut?.has(path) || skip(path)) return;
            seen.add(path);
            out.push({ path, title: titleOf(model, path), reason });
        },
    };
}

/** *Contradict* (FR-2, AC-1): the `contradicts` partners of the near notes, near order then title. */
export function vaultContradictions(model: KnowledgeModel, near: readonly NearItem[], context: VaultMoveContext = {}): VaultCandidate[] {
    const found = collector(model, context, (path) => context.tensions?.has(path) ?? false);
    for (const item of nearThePassage(near)) {
        const partners = findContradictions(model, item.path).sort((a, b) => titleOf(model, a).localeCompare(titleOf(model, b), "en") || (a < b ? -1 : a > b ? 1 : 0));
        for (const path of partners) found.add(path, { kind: "contradicts", of: item.path, ofTitle: item.title, named: item.reason === "named" });
        if (found.full()) break;
    }
    return found.out;
}

/**
 * *Connect* (FR-3, AC-2): the near notes, then their supporting and expanding neighbours, then shared
 * context — each tier in near order, then by title.
 */
export function vaultConnections(model: KnowledgeModel, near: readonly NearItem[], context: VaultMoveContext = {}): VaultCandidate[] {
    const found = collector(model, context, (path) => context.cites?.(path) ?? false);
    const here = nearThePassage(near);
    for (const item of here) found.add(item.path, { kind: "near", near: item.reason });
    for (const item of here) {
        if (found.full()) break;
        const neighbours = noteNeighbourhood(model, item.path, []).neighbours
            .filter((n) => BELONGS.has(n.inType ?? "") || BELONGS.has(n.outType ?? ""))
            .sort((a, b) => a.title.localeCompare(b.title, "en") || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        for (const neighbour of neighbours) {
            // It → the near note reads first: *Supports Planning fallacy*.
            const toward = BELONGS.has(neighbour.inType ?? "");
            const kind = (toward ? neighbour.inType : neighbour.outType) as "supports" | "expands";
            found.add(neighbour.path, { kind, of: item.path, ofTitle: item.title, toward });
        }
    }
    for (const item of here) {
        if (found.full()) break;
        for (const shared of sharedContext(model, item.path, VAULT_MOVE_LIMIT, context.ruledOutGap)) {
            found.add(shared.path, { kind: "shared", of: item.path, ofTitle: item.title });
        }
    }
    return found.out;
}
