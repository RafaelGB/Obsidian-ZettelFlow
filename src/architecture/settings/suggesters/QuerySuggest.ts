import { TextInputSuggest } from "./AbstractSuggester";
import { GRAPH_QUERY_PREDICATES } from "architecture/knowledge/query/graphQuery";

/**
 * Completion for the Explore query box (#483, epic #481).
 *
 * The text field is the **escape hatch**, not the front door — clicking facets is how a query gets
 * built. But someone who already knows the language should not have to remember it, so what they
 * type completes against exactly two sources and no third:
 *
 * - the **grammar**, derived from `GRAPH_QUERY_PREDICATES`;
 * - the **values in this vault**, handed in by the surface from the same facets the buttons use.
 *
 * A third, hardcoded list beside those is precisely how the deleted term builder went wrong.
 */

/**
 * The grammar as text you can actually insert. The predicate table documents `state:<value>`,
 * which reads well and runs badly; completion offers the part you type and leaves the rest to you.
 */
function grammarTokens(): string[] {
    return GRAPH_QUERY_PREDICATES.map((predicate) => predicate.token)
        .map((token) => token.replace(/\[.*?\]/g, "").replace(/<.*?>/g, "").trim())
        .filter((token) => token !== "" && token !== "!");
}

/** Where the term being typed starts: everything before it, and the fragment itself. */
export function splitLastTerm(text: string): { prefix: string; fragment: string } {
    const separator = /\s+(and|or)\s+/gi;
    let last = 0;
    for (let match = separator.exec(text); match !== null; match = separator.exec(text)) {
        last = match.index + match[0].length;
    }
    return { prefix: text.slice(0, last), fragment: text.slice(last) };
}

/** The completions for a fragment, against the grammar and the vault's own values. */
export function completionsFor(fragment: string, values: readonly string[]): string[] {
    const needle = fragment.trim().toLowerCase().replace(/^!/, "");
    const pool = [...grammarTokens(), ...values];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const candidate of pool) {
        if (!candidate.toLowerCase().includes(needle) || seen.has(candidate)) continue;
        seen.add(candidate);
        out.push(candidate);
    }
    return out;
}

export class QuerySuggest extends TextInputSuggest<string> {
    constructor(inputEl: HTMLInputElement, private readonly values: () => string[]) {
        super(inputEl);
    }

    getSuggestions(input: string): string[] {
        return completionsFor(splitLastTerm(input).fragment, this.values());
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    selectSuggestion(value: string): void {
        const { prefix, fragment } = splitLastTerm(this.inputEl.value);
        // A fragment that was being negated keeps its `!` — completing a term must not undo a choice.
        const negated = fragment.trim().startsWith("!") ? "!" : "";
        this.inputEl.value = `${prefix}${negated}${value}`;
        this.inputEl.trigger("input");
        this.close();
    }
}
