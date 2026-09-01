/**
 * Member enumeration for the script editors (#351) — the replacement for the hand-written completion
 * tables that used to describe the API.
 *
 * Those tables were a mirror, and a mirror drifts: they offered `app` (which nothing injected until
 * #349) and admitted in a comment that they could not list the user's own library scripts. This walks
 * the **live object the script will actually receive**, so a completion cannot name something that is
 * not there, and `zf.internal.user.` lists your real functions — plus Dataview's and Templater's, if
 * you have them installed.
 *
 * Pure: values in, descriptors out. No CodeMirror, no Obsidian.
 */

/** One member of a live value, as the editor should present it. */
export interface ApiMember {
    readonly name: string;
    readonly kind: "function" | "object" | "value";
    /** Call signature — a documented one when the manifest has it, else recovered from the function. */
    readonly signature: string;
    /** Prose from the API manifest, when this member is part of the documented `zf` surface. */
    readonly summary?: string;
}

/** Longest parameter list we will render before giving up and showing a bare `(…)`. */
const MAX_SIGNATURE_CHARS = 80;

/**
 * The parameter list of a live function, recovered from its source. Types are erased at runtime but
 * **names survive**, so `add(content)` is true by construction rather than by a maintained copy.
 *
 * A bound or native function reports `[native code]` and yields `name(…)`; that is why a documented
 * signature from the manifest always wins when there is one.
 */
export function functionSignature(name: string, fn: unknown): string {
    if (typeof fn !== "function") return name;
    let source: string;
    try {
        source = Function.prototype.toString.call(fn);
    } catch {
        return `${name}(…)`;
    }
    if (source.includes("[native code]")) return `${name}(…)`;

    const open = source.indexOf("(");
    if (open === -1) {
        // A single-parameter arrow with no parentheses: `content => …`
        const arrow = source.indexOf("=>");
        return arrow > 0 ? `${name}(${source.slice(0, arrow).trim()})` : `${name}(…)`;
    }

    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")") {
            depth--;
            if (depth === 0) {
                const params = source.slice(open + 1, i).replace(/\s+/g, " ").trim();
                if (params.length > MAX_SIGNATURE_CHARS) return `${name}(…)`;
                return `${name}(${params})`;
            }
        }
    }
    return `${name}(…)`;
}

/** Follow a dotted path through a live object graph. Returns `undefined` when it does not resolve. */
export function resolvePath(root: unknown, segments: readonly string[]): unknown {
    let current = root;
    for (const segment of segments) {
        if (current === null || current === undefined) return undefined;
        if (typeof current !== "object" && typeof current !== "function") return undefined;
        try {
            current = (current as Record<string, unknown>)[segment];
        } catch {
            return undefined; // a getter that throws is not a member we can offer
        }
    }
    return current;
}

/** Property names that are noise in a completion list. */
const SKIPPED = new Set(["constructor", "prototype", "caller", "callee", "arguments"]);

function kindOf(value: unknown): ApiMember["kind"] {
    if (typeof value === "function") return "function";
    if (value !== null && typeof value === "object") return "object";
    return "value";
}

/**
 * The members of a live value: its own enumerable keys plus the methods on its prototype chain, so a
 * class instance (a `ContentDTO`, an Obsidian `Vault`) offers its methods and not just its fields.
 * `Object.prototype` is excluded — nobody wants `hasOwnProperty` in a completion list.
 */
export function membersOf(value: unknown): ApiMember[] {
    if (value === null || value === undefined) return [];
    if (typeof value !== "object" && typeof value !== "function") return [];

    const names = new Set<string>();
    for (const key of Object.keys(value)) names.add(key);

    let proto = Object.getPrototypeOf(value) as object | null;
    while (proto !== null && proto !== Object.prototype && proto !== Function.prototype) {
        for (const key of Object.getOwnPropertyNames(proto)) names.add(key);
        proto = Object.getPrototypeOf(proto) as object | null;
    }

    const members: ApiMember[] = [];
    for (const name of names) {
        if (SKIPPED.has(name) || name.startsWith("_")) continue;
        let member: unknown;
        try {
            member = (value as Record<string, unknown>)[name];
        } catch {
            continue;
        }
        members.push({
            name,
            kind: kindOf(member),
            signature: typeof member === "function" ? functionSignature(name, member) : name,
        });
    }
    return members.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Overlay the documented signature and summary from the API manifest onto introspected members.
 * The manifest wins on signature: it carries the types the runtime has erased, and it is the only
 * source that survives `fn.bind()` — which is exactly how `zf.internal.vault` is registered.
 */
export function withDocs(
    members: readonly ApiMember[],
    prefix: string,
    docs: ReadonlyMap<string, { signature: string; summary: string }>
): ApiMember[] {
    return members.map((member) => {
        const doc = docs.get(`${prefix}.${member.name}`);
        return doc ? { ...member, signature: `${member.name}${doc.signature}`, summary: doc.summary } : member;
    });
}
