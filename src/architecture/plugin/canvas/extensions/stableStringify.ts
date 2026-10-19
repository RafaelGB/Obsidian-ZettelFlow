/**
 * **A canvas as JSON, its keys in a stable order** (#833) — a straight port of `json-stable-stringify`
 * 1.3.0's `stringify`, with only the `space` option the canvas patcher uses, and without the stack of
 * ES5 polyfills the package brought into the bundle (24 KB a current Chromium never needs).
 *
 * It keeps the library's output byte for byte, because that output is what users' `.canvas` files
 * already hold:
 * - keys sorted by the default `Array.prototype.sort`, so in string order (`"10"` before `"2"`);
 * - an empty array or object, with `space`, written as `[` + newline + indent + `]`, never `[]`;
 * - `toJSON()` honoured, `undefined` object values skipped, `undefined` array items written `null`;
 * - a cycle through objects throws a `TypeError` (the patcher then falls back to `JSON.stringify`).
 */
export function stableStringify(value: unknown, options: { space?: string | number } = {}): string | undefined {
    const space = typeof options.space === "number" ? " ".repeat(options.space) : options.space || "";
    const seen: object[] = [];

    const write = (node: unknown, level: number): string | undefined => {
        const indent = space ? `\n${space.repeat(level)}` : "";
        const colon = space ? ": " : ":";
        const toJSON = (node as { toJSON?: unknown } | null)?.toJSON;
        if (node && typeof toJSON === "function") node = (toJSON as () => unknown).call(node);
        if (node === undefined) return undefined;
        if (typeof node !== "object" || node === null) return JSON.stringify(node);

        const group = (out: string[], open: string, close: string) => `${open}${out.join(",")}${indent}${close}`;

        if (Array.isArray(node)) {
            const out: string[] = [];
            for (let i = 0; i < node.length; i++) out.push(indent + space + (write(node[i], level + 1) || JSON.stringify(null)));
            return group(out, "[", "]");
        }

        if (seen.includes(node)) throw new TypeError("Converting circular structure to JSON");
        seen.push(node);
        const record = node as Record<string, unknown>;
        const out: string[] = [];
        // The default sort: string order, as the library's `Array.prototype.sort` with no comparator.
        for (const key of Object.keys(record).sort()) {
            const written = write(record[key], level + 1);
            if (!written) continue;
            out.push(indent + space + JSON.stringify(key) + colon + written);
        }
        seen.splice(seen.indexOf(node), 1);
        return group(out, "{", "}");
    };

    return write(value, 0);
}
