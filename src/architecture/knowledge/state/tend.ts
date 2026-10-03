import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { memoise } from "architecture/knowledge/model/memo";
import { computeKnowledgeDebt } from "architecture/knowledge/debt/knowledgeDebt";
import { suggestNextMoves, type NextMoveToken } from "./nextMoveLogic";

/**
 * **Tend** (#644, epic #639) — the notes that need you, one row each.
 *
 * The old Health mode listed the same orphan up to three times (the summary, debt's *unreferenced*,
 * the orphan list) and then left you alone with it. Tend lists a note **once**, says everything it
 * is missing as chips, and hands it to This note on the fix.
 *
 * Nothing here defines an issue (D5). Each is an existing answer, composed: *no source* and *links
 * nowhere* are the next moves `add-source` and `connect`, *nobody links it* and *open question* are
 * the debt categories `unreferenced` and `open-question`. So the companion always offers the move
 * a row promised — they read the same function. Counts and order are facts, never a grade (§XII).
 */

export type TendIssue = "no-source" | "links-nowhere" | "nobody-links" | "open-question";

/** The chip order — what a row lists, and the order a filter bar draws. */
export const TEND_ISSUES: readonly TendIssue[] = ["no-source", "links-nowhere", "nobody-links", "open-question"];

export interface TendRow {
    path: string;
    title: string;
    state: string;
    modified: number;
    /** In {@link TEND_ISSUES} order; never empty. */
    issues: TendIssue[];
}

export interface TendList {
    /** Most issues first, then most recently changed, then path. */
    rows: TendRow[];
    /** How many rows carry each issue — the filter chips' numbers. */
    counts: Record<TendIssue, number>;
    /** Notes with nothing pending. */
    clear: number;
}

function compare(a: TendRow, b: TendRow): number {
    if (a.issues.length !== b.issues.length) return b.issues.length - a.issues.length;
    if (a.modified !== b.modified) return b.modified - a.modified;
    // Code-unit order, not localeCompare: the same vault reads the same in every locale.
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/** The list, computed every time — what the perf budget times (`analysis.tend.10k`). */
export function tendRowsOf(model: KnowledgeModel): TendList {
    const debt = computeKnowledgeDebt(model);
    const pathsOf = (key: string) => new Set(debt.categories.find((category) => category.key === key)?.paths ?? []);
    const unreferenced = pathsOf("unreferenced");
    const openQuestion = pathsOf("open-question");

    const rows: TendRow[] = [];
    const counts: Record<TendIssue, number> = { "no-source": 0, "links-nowhere": 0, "nobody-links": 0, "open-question": 0 };
    for (const idea of model.all()) {
        const moves = suggestNextMoves(model, idea.path);
        const has: Record<TendIssue, boolean> = {
            "no-source": moves.includes("add-source"),
            "links-nowhere": moves.includes("connect"),
            "nobody-links": unreferenced.has(idea.path),
            "open-question": openQuestion.has(idea.path),
        };
        const issues = TEND_ISSUES.filter((issue) => has[issue]);
        if (issues.length === 0) continue;
        for (const issue of issues) counts[issue]++;
        rows.push({ path: idea.path, title: idea.title, state: idea.state, modified: idea.modified, issues });
    }
    rows.sort(compare);
    return { rows, counts, clear: model.size() - rows.length };
}

/** {@link tendRowsOf}, once per model revision (#458). */
export const deriveTend = memoise("tend", (model: KnowledgeModel): TendList => tendRowsOf(model));

/** The rows carrying `issue`, in the list's order; `null` is all of them. */
export function filterTend(list: TendList, issue: TendIssue | null): TendRow[] {
    return issue === null ? list.rows : list.rows.filter((row) => row.issues.includes(issue));
}

/** Where a row hands its note over — structurally the companion's request, without importing it. */
export interface TendFocus {
    focus: "next" | "nearby" | "gaps";
    move?: NextMoveToken;
}

const FOCUS: Record<TendIssue, TendFocus> = {
    "no-source": { focus: "next", move: "add-source" },
    "links-nowhere": { focus: "next", move: "connect" },
    // Its fix lives in other notes: the companion's *Near and forgotten* is where to link from.
    "nobody-links": { focus: "nearby" },
    // The question is listed in *Gaps*, and that is where you answer it (#644 decision 2).
    "open-question": { focus: "gaps" },
};

/** The issue that decides is the filter's when one is on, else the row's first. */
export function tendFocus(row: TendRow, filter: TendIssue | null): TendFocus {
    const issue = filter !== null && row.issues.includes(filter) ? filter : row.issues[0];
    return { ...FOCUS[issue] };
}
