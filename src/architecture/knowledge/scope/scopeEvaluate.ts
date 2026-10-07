/**
 * The verdict: is a note knowledge, and if not, which rule says so (#713). Pure.
 *
 * One sentence decides it: **a note is left out when any rule leaves it out, unless an exception
 * keeps it in — and ZettelFlow's own folders are always out.** The order of the rules never changes
 * the answer; it only decides which rule is *named* (the first that matches), so every surface that
 * refuses a note can say the same thing about why.
 */
import { normalizeExcludedPaths } from "./knowledgeScope";
import { normalizeTag, normalizeValue, type ScopeRule, type ScopeRules } from "./scopeRules";

/** What the rules can see of a note: where it is, its tags, its properties. */
export interface ScopeFacts {
    path: string;
    /** As Obsidian reports them (`#tag`), frontmatter and body together. */
    tags: readonly string[];
    frontmatter: Readonly<Record<string, unknown>> | null;
}

/** Why a note is left out: one of ZettelFlow's own folders, or a rule by its position. */
export type ScopeReason = { kind: "system"; folder: string } | { kind: "rule"; index: number };

export type ScopeVerdict =
    | { in: true; keptBy?: number }
    | { in: false; by: ScopeReason; alsoBy: number[] };

/** The facts, read once per note however many rules look at them. */
interface FactView {
    /** Normalised once: slashes, no leading `/`, NFC — the same form the folder rules are stored in. */
    path: string;
    tags: () => Set<string>;
    value: (property: string) => { present: boolean; values: string[] };
}

type Matcher = (view: FactView) => boolean;

export interface CompiledScope {
    readonly rules: ScopeRules;
    readonly system: readonly string[];
    readonly leaveOut: readonly Matcher[];
    readonly keep: readonly Matcher[];
    /** Whether any rule reads tags or properties — when none does, a path is enough. */
    readonly needsFacts: boolean;
}

/** One note, classified against every rule — what the card computes once per render. */
export interface Classification {
    system: string | null;
    matched: number[];
    /** Every exception that matches (evaluated for every note outside the system folders). */
    kept: number[];
}

/** Anything outside plain ASCII, where Unicode normalisation can change the string. */
const NON_ASCII = /[\u0080-￿]/;

function normalizePath(path: string): string {
    let p = path.includes("\\") ? path.replace(/\\/g, "/") : path;
    if (p.startsWith("/")) p = p.replace(/^\/+/, "");
    // NFC only where it can matter: an ASCII path is already in every normal form.
    return NON_ASCII.test(p) ? p.normalize("NFC") : p;
}

/** A note tag as rules compare it — `normalizeTag`, with the ASCII fast path the build needs. */
function tagKey(tag: string): string {
    const bare = tag.charCodeAt(0) === 35 /* # */ ? tag.slice(1) : tag;
    return NON_ASCII.test(bare) || bare.startsWith("#") || bare.trim() !== bare ? normalizeTag(tag) : bare.toLowerCase();
}

/**
 * Folder-boundary match against a normalised path: the folder, its folder note `X.md`, or anything
 * under `X/` — byte for byte the match the previous version's `excludedPrefixOf` made, which is what
 * makes the migration provably lossless.
 */
function inFolderMatcher(folder: string, subfolders: boolean): (path: string) => boolean {
    const note = `${folder}.md`;
    const prefix = `${folder}/`;
    if (subfolders) return (path) => path === folder || path === note || path.startsWith(prefix);
    return (path) => path === folder || path === note || (path.startsWith(prefix) && path.indexOf("/", prefix.length) < 0);
}

function compileRule(rule: ScopeRule): Matcher {
    switch (rule.kind) {
        case "folder": {
            const inFolder = inFolderMatcher(rule.folder, rule.subfolders);
            return rule.op === "in" ? (v) => inFolder(v.path) : (v) => !inFolder(v.path);
        }
        case "tag": {
            const wanted = new Set(rule.tags);
            const nested = rule.nested;
            const has = (tags: Set<string>) => {
                for (const tag of tags) {
                    if (wanted.has(tag)) return true;
                    if (!nested) continue;
                    // `project/alpha/x` also answers for `project/alpha` and `project`.
                    for (let cut = tag.lastIndexOf("/"); cut > 0; cut = tag.lastIndexOf("/", cut - 1)) {
                        if (wanted.has(tag.slice(0, cut))) return true;
                    }
                }
                return false;
            };
            return rule.op === "any" ? (v) => has(v.tags()) : (v) => !has(v.tags());
        }
        case "property": {
            const { property, op } = rule;
            if (op === "set") return (v) => v.value(property).present;
            if (op === "notSet") return (v) => !v.value(property).present;
            const wanted = new Set(rule.values);
            return (v) => v.value(property).values.some((value) => wanted.has(value));
        }
    }
}

/** Compile the rules once; evaluate many notes with the result. */
export function compileScope(rules: ScopeRules, systemFolders: readonly string[]): CompiledScope {
    return {
        rules,
        system: normalizeExcludedPaths(systemFolders),
        leaveOut: rules.leaveOut.map(compileRule),
        keep: rules.keep.map(compileRule),
        needsFacts: [...rules.leaveOut, ...rules.keep].some((rule) => rule.kind !== "folder"),
    };
}

/** A property's values as rules read them: lists per item, objects never. */
export function propertyValues(raw: unknown): string[] {
    if (raw === null || raw === undefined) return [];
    const items = Array.isArray(raw) ? raw : [raw];
    const out: string[] = [];
    for (const item of items) {
        if (item === null || item === undefined || typeof item === "object") continue;
        const value = normalizeValue(item);
        if (value.length > 0) out.push(value);
    }
    return out;
}

function hasOwn(object: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, key);
}

/** The frontmatter key for `property`, case-insensitively, as Obsidian treats property names. */
function findKey(frontmatter: Readonly<Record<string, unknown>>, property: string, lower: string): string | undefined {
    if (hasOwn(frontmatter, property)) return property;
    for (const key in frontmatter) {
        if (key.length === lower.length && hasOwn(frontmatter, key) && key.toLowerCase() === lower) return key;
    }
    return undefined;
}

const ABSENT = Object.freeze({ present: false, values: [] as string[] });

/** One note seen by the rules: a class, so the build allocates one object per note, not four. */
class NoteView implements FactView {
    readonly path: string;
    private tagSet: Set<string> | undefined;

    constructor(private readonly facts: ScopeFacts) {
        this.path = normalizePath(facts.path);
    }

    tags(): Set<string> {
        if (this.tagSet) return this.tagSet;
        const set = new Set<string>();
        for (const tag of this.facts.tags) set.add(tagKey(tag));
        return (this.tagSet = set);
    }

    value(property: string): { present: boolean; values: string[] } {
        const fm = this.facts.frontmatter;
        if (!fm) return ABSENT;
        const key = findKey(fm, property, property.toLowerCase());
        if (key === undefined) return ABSENT;
        return { present: true, values: propertyValues(fm[key]) };
    }
}

function viewOf(facts: ScopeFacts): FactView {
    return new NoteView(facts);
}

function systemOf(compiled: CompiledScope, path: string): string | null {
    for (const folder of compiled.system) {
        if (path === folder || path === `${folder}.md` || path.startsWith(`${folder}/`)) return folder;
    }
    return null;
}

/** The system folder `path` sits in, or `null`. */
export function systemFolderOf(compiled: CompiledScope, path: string): string | null {
    return systemOf(compiled, normalizePath(path));
}

/** A rule compiled once, for counting it over many notes. */
export function compileOne(rule: ScopeRule): (facts: ScopeFacts) => boolean {
    const match = compileRule(rule);
    return (facts) => match(viewOf(facts));
}

/** Whether one rule matches a note. */
export function ruleMatches(rule: ScopeRule, facts: ScopeFacts): boolean {
    return compileOne(rule)(facts);
}

/** Everything the card needs about one note, read through one view of its facts. */
export function classify(compiled: CompiledScope, facts: ScopeFacts): Classification {
    const view = viewOf(facts);
    const system = systemOf(compiled, view.path);
    if (system !== null) return { system, matched: [], kept: [] };
    const matched: number[] = [];
    for (let index = 0; index < compiled.leaveOut.length; index++) if (compiled.leaveOut[index](view)) matched.push(index);
    const kept: number[] = [];
    for (let index = 0; index < compiled.keep.length; index++) if (compiled.keep[index](view)) kept.push(index);
    return { system: null, matched, kept };
}

/** Every note classified — once per card render; the counts and every draft preview reuse it. */
export function classifyAll(compiled: CompiledScope, facts: readonly ScopeFacts[]): Classification[] {
    return facts.map((note) => classify(compiled, note));
}

/** In or out, and why. System folders first: no exception rescues ZettelFlow's own files. */
export function scopeVerdict(compiled: CompiledScope, facts: ScopeFacts): ScopeVerdict {
    const view = viewOf(facts);
    const system = systemOf(compiled, view.path);
    if (system !== null) return { in: false, by: { kind: "system", folder: system }, alsoBy: [] };
    if (compiled.leaveOut.length === 0) return { in: true };
    const matched: number[] = [];
    for (let index = 0; index < compiled.leaveOut.length; index++) if (compiled.leaveOut[index](view)) matched.push(index);
    if (matched.length === 0) return { in: true };
    const kept = compiled.keep.findIndex((match) => match(view));
    if (kept >= 0) return { in: true, keptBy: kept };
    return { in: false, by: { kind: "rule", index: matched[0] }, alsoBy: matched.slice(1) };
}
