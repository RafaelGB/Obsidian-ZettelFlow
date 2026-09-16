/**
 * What an option's **description** says to a person (#423, epic #422) — pure.
 *
 * A canvas edge has exactly one field, its label, and ZettelFlow makes it do three jobs: draw the
 * transition, store the `if:` gate (#119), and describe the option in the wizard
 * (`Flows.childrensOf` → `tooltip: edge.label`). Until #409 the description was an invisible `title`
 * attribute, so nobody noticed; #409 made it visible text and a conditional edge began printing
 * `if: frontmatter.state === "fleeting"` at someone writing a note.
 *
 * This is the display boundary, and the interim fix: the gate still reads the raw label, and a
 * person only ever reads the human half. #427 gives the three jobs three fields and supersedes it.
 */

/** A condition prefix, only when it opens the label (`motif:` and "a gift" are not conditions). */
const LEADING_CONDITION = /^\s*if\s*:/i;

/** An inline condition tail, e.g. `Fuente — if: x === 1`. */
const TRAILING_CONDITION = /\s*[—–-]?\s*\bif\s*:.*$/i;

/**
 * The part of an edge label meant for a human, or `undefined` when there is none. A label that is
 * only a gate describes nothing — which is the honest answer, not an empty string.
 */
export function describeOption(label: string | undefined): string | undefined {
    if (!label) return undefined;
    const trimmed = label.trim();
    if (trimmed.length === 0) return undefined;
    if (LEADING_CONDITION.test(trimmed)) return undefined;

    const human = trimmed.replace(TRAILING_CONDITION, "").trim();
    return human.length > 0 ? human : undefined;
}
