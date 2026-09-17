/**
 * What a library function says about itself (#448, epic #443) — pure.
 *
 * A library module is `module.exports = fn`: no parameter names, no description, no statement of
 * which surface it is for. The editor can complete the *name*, because it reads the live object,
 * and nothing else — so the one place in ZettelFlow where you write reusable code is the one with
 * the least help.
 *
 * The contract is a **JSDoc block**, and it is optional: a documented function earns its
 * parameters and description in completions, hover, the generated `.d.ts` and the library
 * manager; an undocumented one keeps working exactly as it does today. Malformed input degrades
 * to "no documentation" — never to an error, because a comment must not break a module.
 */

export interface DocumentedParam {
    name: string;
    /** The declared type, when the block gives one. */
    type?: string;
    description?: string;
}

export interface LibraryContract {
    /** The first sentence of the block: what the function is for. */
    description?: string;
    params: DocumentedParam[];
    /** `@returns` text, when present. */
    returns?: string;
    /** `@zf-surface action|selector|hook|condition` — where the author means it to be used. */
    surface?: string;
    /** The module reaches `require`, which does not exist on mobile. */
    desktopOnly: boolean;
}

/** The last JSDoc block before the first export — the one that documents what the module exports. */
function leadingBlock(source: string): string | undefined {
    const blocks = [...source.matchAll(/\/\*\*([\s\S]*?)\*\//g)];
    if (blocks.length === 0) return undefined;
    const exportAt = source.search(/module\.exports|exports\.default|exports\s*=/);
    const before = blocks.filter((block) => exportAt === -1 || (block.index ?? 0) < exportAt);
    const candidates = before.length > 0 ? before : blocks;
    const chosen = candidates[candidates.length - 1];
    return chosen?.[1];
}

/** Strip the leading ` * ` decoration a JSDoc block carries on every line. */
function undecorate(block: string): string[] {
    return block
        .split("\n")
        .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
        .filter((line, index, all) => !(line === "" && (index === 0 || index === all.length - 1)));
}

const PARAM = /^@param\s+(?:\{([^}]*)\}\s+)?(\S+)\s*(?:-\s*)?(.*)$/;
const RETURNS = /^@returns?\s+(?:\{[^}]*\}\s+)?(.*)$/;
const SURFACE = /^@zf-surface\s+(\S+)/;

/**
 * Read a module's contract. Everything is optional; what is absent is simply absent, and the
 * caller treats that as "undocumented" rather than as a problem.
 */
export function parseLibraryContract(source: string): LibraryContract {
    const contract: LibraryContract = {
        params: [],
        // `require` resolves through `window.require`, which is absent on mobile (#448 FR-6).
        desktopOnly: /\brequire\s*\(/.test(source),
    };

    const block = leadingBlock(source);
    if (!block) return contract;

    const description: string[] = [];
    for (const raw of undecorate(block)) {
        // Trimmed before anything is matched: a single-line block (`/** @param */`) arrives with
        // its leading space, and a tag that is not recognised as one lands in the description.
        const line = raw.trim();
        const param = PARAM.exec(line);
        if (param) {
            contract.params.push({
                name: param[2],
                ...(param[1] ? { type: param[1].trim() } : {}),
                ...(param[3]?.trim() ? { description: param[3].trim() } : {}),
            });
            continue;
        }
        const returns = RETURNS.exec(line);
        if (returns) {
            if (returns[1].trim()) contract.returns = returns[1].trim();
            continue;
        }
        const surface = SURFACE.exec(line);
        if (surface) {
            contract.surface = surface[1];
            continue;
        }
        if (line.startsWith("@")) continue; // a tag we do not read is not an error
        if (line) description.push(line);
    }

    if (description.length > 0) contract.description = description.join(" ");
    return contract;
}

/** The signature a documented function shows in completions and in the generated `.d.ts`. */
export function contractSignature(contract: LibraryContract): string {
    const params = contract.params
        .map((param) => (param.type ? `${param.name}: ${param.type}` : param.name))
        .join(", ");
    return `(${params}) => unknown`;
}
