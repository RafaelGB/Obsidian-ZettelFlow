import { ZfTemplate, isValidTemplate } from "application/template/zfTemplate";

/** A file a system install writes: an absolute-in-vault path and its content. */
export interface PlannedFile {
    path: string;
    content: string;
}

/**
 * The registered action `type` ids (#214) — kept in sync with `main.ts registerActions()`. A system's
 * step frontmatter may only reference these; the validity harness rejects anything else. Obsidian-free.
 */
export const REGISTERED_ACTION_IDS: ReadonlySet<string> = new Set([
    "prompt", "number", "checkbox", "selector", "dynamic-selector", "calendar",
    "backlink", "tags", "cssclasses", "script", "task-management", "zettel-id",
    "detect-orphan", "calculate-maturity", "find-contradiction", "find-unanswered-question",
    "suggest-next-move", "thinking-simulator", "find-related", "suggest-link",
    "create-semantic-relation", "extract-claims", "compare-claims", "find-sources",
    "attach-source", "summarize", "classify", "generate-questions",
]);

/**
 * Pure install plan for a `.zftemplate` system (#214): the canvas first, then every step, each written
 * under `targetFolder`. Deterministic, read-only, Obsidian-free — the Obsidian shell writes these via
 * the sanctioned `FileService.writeFile`.
 */
export function planSystemInstall(template: ZfTemplate, targetFolder: string): { files: PlannedFile[] } {
    const prefix = targetFolder === "/" || targetFolder === "" ? "" : `${targetFolder}/`;
    const files: PlannedFile[] = [{ path: `${prefix}${template.canvas.filename}`, content: template.canvas.content }];
    for (const step of template.steps) files.push({ path: `${prefix}${step.filename}`, content: step.content });
    return { files };
}

/**
 * A canvas/step `filename` is safe only when it is a bare in-folder name: no path separator, no `.`/`..`
 * segment, no drive-absolute prefix. Systems are **remote, untrusted, one-click-installed** content, so
 * a crafted name like `../../.obsidian/plugins/x/main.js` must never reach the disk (#214 hardening).
 */
export function isUnsafeFilename(filename: unknown): boolean {
    if (typeof filename !== "string") return true;
    const name = filename.trim();
    if (name === "") return true;
    if (name.includes("/") || name.includes("\\")) return true; // no subpaths, traversal or leading-slash
    if (name === "." || name === "..") return true;
    if (/^[a-zA-Z]:/.test(name)) return true; // Windows drive-absolute (e.g. C:foo)
    return false;
}

/** The leading `---\n…\n---` frontmatter block of a note's content, or `null` if absent. */
function frontmatterBlock(content: string): string | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    return match ? match[1] : null;
}

/** Every action `type` declared in a frontmatter block (structural, no YAML dependency). */
function extractActionTypes(frontmatter: string): string[] {
    const types: string[] = [];
    const pattern = /^\s*-?\s*type:\s*["']?([\w-]+)/gm;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(frontmatter)) !== null) types.push(match[1]);
    return types;
}

/**
 * Pure structural validator for a shipped system (#214, AC-2). Returns the list of problems (empty =
 * valid): a malformed bundle, a step with no `zettelFlowSettings:` frontmatter, or any action `type`
 * not in `knownActionTypes`. Obsidian-free — no YAML parse, just the load-bearing action-id invariant.
 */
export function validateSystemTemplate(template: ZfTemplate, knownActionTypes: ReadonlySet<string>): string[] {
    const problems: string[] = [];
    if (!isValidTemplate(template)) {
        problems.push("Not a valid .zftemplate: missing required fields");
        return problems;
    }
    if (isUnsafeFilename(template.canvas.filename)) {
        problems.push(`Canvas "${template.canvas.filename}" has an unsafe path`);
    }
    for (const step of template.steps) {
        if (isUnsafeFilename(step.filename)) {
            problems.push(`Step "${step.filename}" has an unsafe path`);
        }
        const frontmatter = frontmatterBlock(step.content);
        if (!frontmatter || !frontmatter.includes("zettelFlowSettings:")) {
            problems.push(`Step "${step.filename}" has no zettelFlowSettings frontmatter`);
            continue;
        }
        for (const type of extractActionTypes(frontmatter)) {
            if (!knownActionTypes.has(type)) {
                problems.push(`Step "${step.filename}" uses unknown action type "${type}"`);
            }
        }
    }
    return problems;
}
