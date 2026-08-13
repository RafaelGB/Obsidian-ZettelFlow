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

/** Last path segment of a vault path, handling both separators. Pure. */
function basename(path: string): string {
    const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return idx >= 0 ? path.slice(idx + 1) : path;
}

/**
 * Repoint the canvas' file-node paths to the install folder so a system installed anywhere resolves:
 * every `type:"file"` node whose basename matches a shipped step filename is rewritten to
 * `${prefix}${basename}`. Defensive — a canvas that is not parseable JSON (or has no `nodes`) is
 * returned unchanged. Pure & Obsidian-free; without this the authored (hardcoded) paths would only
 * resolve when the user keeps the exact folder the canvas was authored against (#215).
 *
 * Matches on basename only: systems ship flat, bare step filenames (enforced by `isUnsafeFilename`),
 * so a step and its canvas node always agree on basename — there is no nesting to disambiguate.
 */
function rewriteCanvasPaths(canvasContent: string, stepFilenames: ReadonlySet<string>, prefix: string): string {
    let data: unknown;
    try {
        data = JSON.parse(canvasContent);
    } catch {
        return canvasContent;
    }
    const nodes = (data as { nodes?: unknown } | null)?.nodes;
    if (!Array.isArray(nodes)) return canvasContent;
    let changed = false;
    for (const node of nodes) {
        if (typeof node !== "object" || node === null) continue;
        const fileNode = node as { type?: unknown; file?: unknown };
        if (fileNode.type === "file" && typeof fileNode.file === "string" && stepFilenames.has(basename(fileNode.file))) {
            fileNode.file = `${prefix}${basename(fileNode.file)}`;
            changed = true;
        }
    }
    return changed ? JSON.stringify(data) : canvasContent;
}

/**
 * Pure install plan for a `.zftemplate` system (#214): the canvas first, then every step, each written
 * under `targetFolder`. The canvas' file-node paths are rewritten to the install folder so its step
 * references resolve wherever the system is installed (#215). Deterministic, read-only, Obsidian-free —
 * the Obsidian shell writes these via the sanctioned `FileService.writeFile`.
 */
export function planSystemInstall(template: ZfTemplate, targetFolder: string): { files: PlannedFile[] } {
    const prefix = targetFolder === "/" || targetFolder === "" ? "" : `${targetFolder}/`;
    const stepFilenames = new Set(template.steps.map((step) => step.filename));
    const canvasContent = rewriteCanvasPaths(template.canvas.content, stepFilenames, prefix);
    const files: PlannedFile[] = [{ path: `${prefix}${template.canvas.filename}`, content: canvasContent }];
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

/**
 * Reduce an untrusted system `name` to a single safe folder segment for the default install location:
 * no path separators, no `..` traversal, no leading dots. Returns `""` when nothing safe remains (the
 * caller then falls back to the configured flows folder). Systems are remote content, so the
 * auto-derived default folder must not let a crafted name steer writes outside the flows folder (#215).
 */
export function sanitizeFolderSegment(name: string): string {
    if (typeof name !== "string") return "";
    return name
        .split(/[/\\]/) // break on any separator so subpaths/traversal cannot survive
        .filter((seg) => seg && seg !== "." && seg !== "..") // drop empty and traversal segments
        .join(" ")
        .replace(/^\.+/, "") // no leading dots (dotfolders)
        .trim();
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

/** YAML indicator characters that must not start an unquoted plain scalar value. */
const YAML_UNSAFE_LEAD: ReadonlySet<string> = new Set([
    "[", "]", "{", "}", ",", "#", "&", "*", "!", "|", ">", "%", "@", "`",
]);

/**
 * Frontmatter inline values that would break real YAML parsing if left unquoted — the failure the
 * regex-structural checks miss. A value like `[[note]]...` or `@home...` silently invalidates the whole
 * `zettelFlowSettings` block, so the engine drops the step as a flow root even though the JSON is fine
 * (#217 review). Returns the offending `key`s; authors must single-quote such values. Obsidian-free —
 * a targeted lint of the realistic authoring hazard, not a full YAML parse.
 */
function unsafeYamlValueKeys(frontmatter: string): string[] {
    const keys: string[] = [];
    for (const line of frontmatter.split("\n")) {
        const match = line.match(/^\s*(?:-\s+)?([\w-]+):\s+(\S.*?)\s*$/);
        if (!match) continue;
        const [, key, value] = match;
        if (value.startsWith("'") || value.startsWith('"')) continue; // already quoted → safe
        const needsQuote =
            YAML_UNSAFE_LEAD.has(value[0]) ||
            value.startsWith("- ") ||
            value.startsWith("? ") ||
            value.includes(": ") ||
            value.includes(" #");
        if (needsQuote) keys.push(key);
    }
    return keys;
}

/**
 * Pure structural validator for a shipped system (#214, AC-2). Returns the list of problems (empty =
 * valid): a malformed bundle, a step with no `zettelFlowSettings:` frontmatter, an action `type` not in
 * `knownActionTypes`, an orphaned/unparseable canvas, an unsafe filename, or a frontmatter value that
 * would break real YAML parsing (#217). Obsidian-free — a targeted structural lint, not a YAML parse.
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
    // The canvas must be parseable, and every markdown file-node must reference a shipped step —
    // otherwise a broken/orphaned canvas installs clean and only fails at flow-load time (#215 review).
    let canvasData: unknown = null;
    try {
        canvasData = JSON.parse(template.canvas.content);
    } catch {
        problems.push(`Canvas "${template.canvas.filename}" is not valid JSON`);
    }
    const nodes = (canvasData as { nodes?: unknown } | null)?.nodes;
    if (Array.isArray(nodes)) {
        const stepFilenames = new Set(template.steps.map((step) => step.filename));
        for (const node of nodes) {
            if (typeof node !== "object" || node === null) continue;
            const fileNode = node as { type?: unknown; file?: unknown };
            if (fileNode.type === "file" && typeof fileNode.file === "string" && fileNode.file.endsWith(".md") && !stepFilenames.has(basename(fileNode.file))) {
                problems.push(`Canvas file-node "${fileNode.file}" has no matching step`);
            }
        }
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
        for (const key of unsafeYamlValueKeys(frontmatter)) {
            problems.push(`Step "${step.filename}" has an unquoted YAML-unsafe value for "${key}"`);
        }
    }
    return problems;
}
