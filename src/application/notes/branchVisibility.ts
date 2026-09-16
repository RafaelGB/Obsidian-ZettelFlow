import { EvalContext, evaluateCondition } from "./conditionEvaluator";

/**
 * Why an option is not on screen (#414, epic #405) — pure.
 *
 * A conditional edge (`if: frontmatter.state === "fleeting"`) that evaluates false makes its branch
 * **vanish**: `CallbackUtils` filters it out and nothing is said. For the user, the wizard silently
 * made a decision on their behalf; for the flow's author, a correct expression that happens to be
 * false is invisible — only a *malformed* one produced a Notice.
 *
 * The manifesto requires that a recommendation explain its basis, and a hidden option is the
 * strongest recommendation there is. This adds **no evaluation logic**: it reports what the #119
 * evaluator already decided, and evaluates individual comparisons only to say *which one* failed.
 */

export type BranchReason =
    /** A single comparison decided it. */
    | { kind: "comparison"; path: string; operator: string; expected: string; found: string }
    /** Every alternative of an `||` failed. */
    | { kind: "all-failed"; comparisons: string[] }
    /** The expression is outside what can be explained simply; the raw text is the honest answer. */
    | { kind: "expression" };

export interface HiddenBranch {
    id: string;
    label: string;
    expression: string;
    reason: BranchReason;
}

const COMPARISON =
    /(frontmatter\.[A-Za-z_$][\w$]*|note\.title|canvas\.name)\s*(===|!==)\s*("[^"]*"|'[^']*'|-?\d+(?:\.\d+)?|true|false|null)/g;

function readPath(path: string, context: EvalContext): unknown {
    if (path.startsWith("frontmatter.")) return context.frontmatter[path.slice(12)] ?? null;
    if (path === "note.title") return context.noteTitle;
    if (path === "canvas.name") return context.canvasName;
    return null;
}

function display(value: unknown): string {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return "nothing";
    return JSON.stringify(value);
}

function unquote(literal: string): string {
    const quoted = /^(["'])(.*)\1$/.exec(literal);
    return quoted ? quoted[2] : literal;
}

/**
 * Why `expression` is false, in terms of the context it was evaluated against. For an `&&` chain
 * that is the **first** failing comparison; for `||` it is that every alternative failed. Anything
 * the simple reader cannot decompose falls back to the expression itself — an honest "here is what
 * was evaluated" beats a confident wrong story.
 */
export function explainClosedBranch(expression: string, context: EvalContext): BranchReason {
    const comparisons = [...expression.matchAll(COMPARISON)];
    if (comparisons.length === 0) return { kind: "expression" };

    const failing = comparisons.filter((match) => {
        try {
            return !evaluateCondition(match[0], context);
        } catch {
            return false;
        }
    });
    if (failing.length === 0) return { kind: "expression" };

    const isOr = /\|\|/.test(expression);
    if (isOr && failing.length > 1) {
        return { kind: "all-failed", comparisons: failing.map((match) => match[0]) };
    }

    const [, path, operator, literal] = failing[0];
    return {
        kind: "comparison",
        path,
        operator,
        expected: unquote(literal),
        found: display(readPath(path, context)),
    };
}
