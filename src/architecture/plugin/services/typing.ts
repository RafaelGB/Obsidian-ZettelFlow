export type ObsidianPropertyType = "text" | "number" | "date" | "datetime" | "multitext" | "checkbox" | "aliases";

export function isObsidianPropertyType(type: string): type is ObsidianPropertyType {
    return (
        type === "text" ||
        type === "number" ||
        type === "date" ||
        type === "datetime" ||
        type === "multitext" ||
        type === "checkbox" ||
        type === "aliases"
    );
}