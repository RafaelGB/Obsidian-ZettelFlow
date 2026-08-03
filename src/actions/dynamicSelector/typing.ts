export type ScriptResult = {
    output: unknown;
    error: string | null;
};

/** Type guard for the `[key, label][]` shape the dynamic selectors expect from a script. */
export function isStringTupleArray(value: unknown): value is [string, string][] {
    return Array.isArray(value) && value.every(
        (item): item is [string, string] =>
            Array.isArray(item) && item.length === 2 &&
            typeof item[0] === "string" && typeof item[1] === "string"
    );
}