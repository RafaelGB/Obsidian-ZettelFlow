import { CanvasData } from "obsidian/canvas";

/**
 * Serializes canvas data back to the on-disk `.canvas` JSON shape, pretty-printing `nodes` and
 * `edges` one entry per line (matching Obsidian's own format for a clean diff).
 *
 * Any OTHER top-level key present on `data` (e.g. a future `metadata` field) is preserved
 * verbatim — dropping unknown keys would silently lose canvas data on every programmatic save.
 */
export function canvasJsonFormatter(data: CanvasData): string {
    const nodesFormatted = data.nodes.map((node) => JSON.stringify(node));
    const edgesFormatted = data.edges.map((edge) => JSON.stringify(edge));

    const parts = [
        `\t"nodes":[\n\t\t${nodesFormatted.join(",\n\t\t")}\n\t]`,
        `\t"edges":[\n\t\t${edgesFormatted.join(",\n\t\t")}\n\t]`,
    ];

    // Preserve every other top-level key exactly as-is (no reordering of nodes/edges).
    for (const [key, value] of Object.entries(data)) {
        if (key === "nodes" || key === "edges") continue;
        parts.push(`\t${JSON.stringify(key)}:${JSON.stringify(value)}`);
    }

    return `{\n${parts.join(",\n")}\n}`;
}
