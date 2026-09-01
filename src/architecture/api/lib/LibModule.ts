import { App } from "obsidian";

/**
 * What one member of the `zf` API is, in words (#350). Required at registration, so a function cannot
 * join the API without documenting itself — the editor's completions, its hover text, the generated
 * `.d.ts` and the reference page all read this one description instead of keeping their own copies.
 *
 * Signatures and summaries stay in English: they are code documentation, not UI chrome.
 */
export interface ApiMemberDoc {
    /** Dotted path as the user writes it, e.g. `zf.knowledge.debt`. */
    readonly path: string;
    /** Call signature, e.g. `(path: string) => EvidenceMap`. */
    readonly signature: string;
    /** One line: what it answers. */
    readonly summary: string;
}

export abstract class LibModule {
    public abstract name: string;
    constructor(protected app: App) {

    }

    protected static_functions: Map<string, unknown> = new Map();
    protected static_object: { [x: string]: unknown };

    protected dynamic_functions: Map<string, unknown> = new Map();

    /** Documentation for the statically registered members, keyed by member name. */
    protected docs: Map<string, ApiMemberDoc> = new Map();

    /**
     * Register one API member together with its documentation. The only sanctioned way to add to `zf`:
     * `meta` is required by the compiler, so an undocumented member cannot exist.
     */
    protected register(name: string, fn: unknown, meta: Omit<ApiMemberDoc, "path">): void {
        this.static_functions.set(name, fn);
        this.docs.set(name, { path: `${this.namespace()}.${name}`, ...meta });
    }

    /** The dotted prefix these members live under, e.g. `zf.internal.vault`. */
    protected namespace(): string {
        return `zf.${this.name}`;
    }

    async init(): Promise<void> {
        await this.create_static_functions();
        this.static_object = Object.fromEntries(this.static_functions);
    }

    getName(): string {
        return this.name;
    }

    /** The manifest for this module — every statically registered member, documented. */
    describe(): ApiMemberDoc[] {
        return [...this.docs.values()];
    }

    abstract create_static_functions(): Promise<void>;
    create_dynamic_functions(): Promise<void> {
        // By default, do nothing
        return Promise.resolve();
    }

    async generate_object(): Promise<Record<string, unknown>> {
        await this.create_dynamic_functions();

        return {
            ...this.static_object,
            ...Object.fromEntries(this.dynamic_functions),
        };
    }
}
