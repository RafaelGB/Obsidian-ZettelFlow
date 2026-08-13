/**
 * Authoring help for workflow-trigger **conditions** (#150/#151, epic #246 B1). A condition is a small
 * `zf` script evaluated against the event payload (see {@link evaluateBindingCondition}); a blank one
 * means "always". Writing one is the sharpest authoring-friction point, so this pure, Obsidian-free
 * module gives a builder UI (and the docs) the referenceable vocabulary, worked examples, and a
 * lightweight sanity check — the guided-help core, independent of any rendering.
 */

/** A field the condition script can reference on the injected event context. */
export interface ConditionField {
    /** The dotted accessor to type, e.g. `event.newValue`. */
    accessor: string;
    /** One-line plain description of what it holds and when it is populated. */
    note: string;
}

/** The event-payload fields a condition can inspect (mirrors `WorkflowEventPayload`). */
export const CONDITION_FIELDS: readonly ConditionField[] = [
    { accessor: "event.event", note: "the event token, e.g. 'property.changed' or 'tag.added'" },
    { accessor: "event.notePath", note: "vault-relative path of the affected note" },
    { accessor: "event.property", note: "the frontmatter property that changed (property.changed only)" },
    { accessor: "event.tag", note: "the tag that was added (tag.added only)" },
    { accessor: "event.oldValue", note: "the property's previous value (property.changed only)" },
    { accessor: "event.newValue", note: "the property's new value (property.changed only)" },
];

/** A ready-to-use example condition, for a "insert an example" affordance. */
export interface ConditionExample {
    label: string;
    condition: string;
}

export const CONDITION_EXAMPLES: readonly ConditionExample[] = [
    { label: "Always (leave blank)", condition: "" },
    { label: "Only when a note is tagged #idea", condition: "event.tag === 'idea'" },
    { label: "When a property becomes done", condition: "event.property === 'status' && event.newValue === 'done'" },
    { label: "Only inside the Projects folder", condition: "event.notePath.startsWith('Projects/')" },
    { label: "When a property first gets a value", condition: "!event.oldValue && !!event.newValue" },
];

export interface ConditionCheck {
    ok: boolean;
    /** Present when `ok` is false: a short, human reason. */
    error?: string;
}

/**
 * A lightweight, dependency-free sanity check for a condition string (not a full JS parse). Catches the
 * two mistakes that actually bite: unbalanced brackets, and a bare `=` where `===` was meant. A blank
 * condition is valid ("always"). Deterministic and Obsidian-free.
 */
export function sanityCheckCondition(expr: string): ConditionCheck {
    const source = expr.trim();
    if (source === "") return { ok: true };

    const opposite: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    const stack: string[] = [];
    for (const char of source) {
        if (char === "(" || char === "[" || char === "{") stack.push(char);
        else if (char in opposite && stack.pop() !== opposite[char]) {
            return { ok: false, error: "unbalanced brackets" };
        }
    }
    if (stack.length > 0) return { ok: false, error: "unbalanced brackets" };

    // A single `=` that isn't part of ==, ===, !=, <=, >= is almost always a mistaken assignment.
    if (/[^=!<>]=[^=]/.test(source)) {
        return { ok: false, error: "use === for comparison, not a single =" };
    }
    return { ok: true };
}
