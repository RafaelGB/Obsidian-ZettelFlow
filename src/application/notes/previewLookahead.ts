import type { PreviewElement } from "./previewAssembly";

/**
 * **What the live preview can show before the build gets there** (#816). Pure and Obsidian-free:
 * the companion pane hands in the step it is on, that step's children and what it already holds.
 * Nothing here is ever written into the note the build makes.
 */

/** A step, as much of it as the lookahead reads. */
export interface LookaheadNode {
    type?: string;
    path?: string;
}

/**
 * The template a group step leads to (#816 FR-1 – FR-4): a legacy group carries its template as the
 * file node inside it, which the walk only reaches once the group's questions are done. Shown from
 * the start of the group — but only when the group leads to exactly one step and it is a Markdown
 * file; a choice is never guessed. Once the walk holds that template itself, nothing is returned,
 * so it is never shown twice.
 */
export function upcomingGroupTemplate(current: LookaheadNode | undefined, children: readonly LookaheadNode[], known: Iterable<string>): string | null {
    if (current?.type !== "group" || children.length !== 1) return null;
    const [next] = children;
    if (next.type !== "file" || !next.path || !next.path.toLowerCase().endsWith(".md")) return null;
    for (const path of known) if (path === next.path) return null;
    return next.path;
}

/** A captured answer, with what names it. */
export type AnswerElement = PreviewElement & { label?: unknown; description?: unknown; hasUI?: unknown };

/** One of *Your answers* (#816 FR-7): its name, and what you said. */
export interface ContextAnswer {
    label: string;
    value: string;
}

function said(value: unknown): string {
    return Array.isArray(value) ? value.map((item) => String(item)).join(", ") : String(value);
}

function answered(value: unknown): boolean {
    return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
}

/**
 * **Your answers** (#816 FR-7 – FR-11): what you answered whose zone is `context` — not part of the
 * note, but what you just said — in the order given. A background or static value is not an answer.
 */
export function contextAnswers(elements: readonly AnswerElement[]): ContextAnswer[] {
    const out: ContextAnswer[] = [];
    for (const element of elements) {
        if (element.zone !== "context" || element.hasUI === false || element.staticBehaviour) continue;
        if (!answered(element.result)) continue;
        const name = [element.label, element.description, element.key].find((candidate): candidate is string => typeof candidate === "string" && candidate.trim() !== "");
        out.push({ label: name ?? "", value: said(element.result) });
    }
    return out;
}

/** Whether a captured element shows anywhere in the preview: the note, its tags, or *Your answers*. */
function shows(element: AnswerElement): boolean {
    const value = element.staticBehaviour ? element.staticValue : element.result;
    if (!answered(value)) return false;
    if (element.type === "tags" || element.key === "tags") return true;
    if (element.zone === "context") return element.hasUI !== false && !element.staticBehaviour;
    return typeof element.key === "string";
}

/**
 * Whether there is anything to preview (#816 FR-12): a title, a template — the walk's or the one a
 * group leads to — a crystallize seed, or an answer that shows. A background action alone is not.
 */
export function previewHasContent(input: { title: string; paths: number; crystallize: boolean; upcoming: string | null; elements: readonly AnswerElement[] }): boolean {
    return input.title.length > 0 || input.paths > 0 || input.crystallize || input.upcoming !== null || input.elements.some(shows);
}
