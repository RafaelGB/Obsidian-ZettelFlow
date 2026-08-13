export const ZF_TEMPLATE_VERSION = "1.0";

export interface ZfTemplateFile {
    filename: string;
    content: string;
}

export interface ZfTemplate {
    zfVersion: string;
    name: string;
    description: string;
    author: string;
    canvas: ZfTemplateFile;
    steps: ZfTemplateFile[];
}

export function buildTemplate(
    name: string,
    description: string,
    author: string,
    canvas: ZfTemplateFile,
    steps: ZfTemplateFile[]
): ZfTemplate {
    return { zfVersion: ZF_TEMPLATE_VERSION, name, description, author, canvas, steps };
}

export function parseTemplate(json: string): ZfTemplate {
    const parsed: unknown = JSON.parse(json);
    if (!isValidTemplate(parsed)) {
        throw new Error("Invalid .zftemplate: missing required fields");
    }
    return parsed;
}

/** A `.zftemplate` file entry is valid only when both `filename` and `content` are strings. */
function isValidTemplateFile(value: unknown): value is ZfTemplateFile {
    if (typeof value !== "object" || value === null) return false;
    const file = value as Record<string, unknown>;
    return typeof file.filename === "string" && typeof file.content === "string";
}

export function isValidTemplate(value: unknown): value is ZfTemplate {
    if (typeof value !== "object" || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
        typeof obj.zfVersion === "string" &&
        typeof obj.name === "string" &&
        typeof obj.description === "string" &&
        typeof obj.author === "string" &&
        isValidTemplateFile(obj.canvas) &&
        Array.isArray(obj.steps) &&
        obj.steps.every(isValidTemplateFile)
    );
}
