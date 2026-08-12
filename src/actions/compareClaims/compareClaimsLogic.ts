import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import { findContradictions } from "../findContradiction/findContradictionLogic";

/** One matched claim, paired with the path of the note that owns it. */
export interface ClaimMatch {
    path: string;
    text: string;
}

/** The two deterministic sets `compareClaims` produces. */
export interface ClaimComparison {
    agreeing: ClaimMatch[];
    contradicting: ClaimMatch[];
}

/** Closed, bilingual negation markers (whole-word), plus the `n't` contraction (D4). */
const NEGATION_MARKERS: ReadonlySet<string> = new Set([
    "not", "no", "never", "nunca", "jamas", "jamás", "tampoco",
]);

/** trim → lowercase → collapse whitespace → strip surrounding quotes and trailing sentence punctuation. */
export function normalize(text: string): string {
    let out = text.trim().toLowerCase().replace(/\s+/g, " ");
    out = out.replace(/^["'“”‘’]+/, "").replace(/["'“”‘’]+$/, "");
    out = out.replace(/[.!?;；]+$/, "");
    return out.trim();
}

/** True when a normalized claim carries any negation marker (or the `n't` contraction). */
export function hasNegation(normalized: string): boolean {
    if (normalized.includes("n't")) return true;
    return normalized.split(" ").some((token) => NEGATION_MARKERS.has(token));
}

/** Remove negation markers from a normalized claim so opposite-polarity claims share a base. */
export function stripNegation(normalized: string): string {
    return normalized
        .replace(/n't/g, " ")
        .split(" ")
        .filter((token) => token.length > 0 && !NEGATION_MARKERS.has(token))
        .join(" ");
}

/**
 * Pure claim comparison (#155, FR-3/D4). Compares a target note's claims against every other note's
 * claims in the model and returns the **agreeing** and **contradicting** claim matches. Agreement =
 * identical normalized text. Contradiction = either the two owning notes are joined by a
 * `contradicts` relation (structural, reusing the #153 primitive) OR the same proposition asserted
 * with opposite polarity (textual negation). Structural/textual contradiction takes precedence over
 * agreement. Deterministic (sorted by path then text), excludes self, never throws; unknown/claimless
 * target ⇒ empty sets. Obsidian-free.
 */
export function compareClaims(model: KnowledgeModel, path: string): ClaimComparison {
    const agreeing: ClaimMatch[] = [];
    const contradicting: ClaimMatch[] = [];

    const target = model.get(path);
    if (!target || target.claims.length === 0) return { agreeing, contradicting };

    const targetClaims = target.claims.map((claim) => {
        const norm = normalize(claim.text);
        return { norm, stripped: stripNegation(norm), negated: hasNegation(norm) };
    });
    const structurallyOpposed = new Set(findContradictions(model, path));

    for (const idea of model.all()) {
        if (idea.path === path) continue;
        const structural = structurallyOpposed.has(idea.path);
        for (const claim of idea.claims) {
            const norm = normalize(claim.text);
            const stripped = stripNegation(norm);
            const negated = hasNegation(norm);

            let agrees = false;
            let contradicts = structural;
            for (const q of targetClaims) {
                if (norm === q.norm) agrees = true;
                if (stripped === q.stripped && negated !== q.negated) contradicts = true;
            }

            if (contradicts) contradicting.push({ path: idea.path, text: claim.text });
            else if (agrees) agreeing.push({ path: idea.path, text: claim.text });
        }
    }

    agreeing.sort(byPathThenText);
    contradicting.sort(byPathThenText);
    return { agreeing, contradicting };
}

function byPathThenText(a: ClaimMatch, b: ClaimMatch): number {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if (a.text !== b.text) return a.text < b.text ? -1 : 1;
    return 0;
}
