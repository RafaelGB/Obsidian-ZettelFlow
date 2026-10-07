/**
 * The verdict: is a note knowledge, and if not, which rule says so (#713). Pure.
 *
 * One sentence decides it: **a note is left out when any rule leaves it out, unless an exception
 * keeps it in — and ZettelFlow's own folders are always out.** The order of the rules never changes
 * the answer; it only decides which rule is *named* (the first that matches), so every surface that
 * refuses a note can say the same thing about why.
 */
import { excludedPrefixOf, normalizeExcludedPaths } from "./knowledgeScope";
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

type Matcher = (facts: ScopeFacts, view: FactView) => boolean;

/** The facts, read once per note however many rules look at them. */
interface FactView {
    path: string;
    tags: () => Set<string>;
    value: (property: string) => { present: boolean; values: string[] };
}

export interface CompiledScope {
    readonly rules: ScopeRules;
    readonly system: readonly string[];
    readonly leaveOut: readonly Matcher[];
    readonly keep: readonly Matcher[];
    /** Whether any rule reads tags or properties — when none does, a path is enough. */
    readonly needsFacts: boolean;
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/^\/+/, "").normalize("NFC");
}

function folderMatcher(folder: string, subfolders: boolean): (path: string) => boolean {
    if (subfolders) return (path) => excludedPrefixOf(path, [folder]) !== null;
    const prefix = `${folder}/`;
    return (path) => {
        const p = normalizePath(path);
        if (p === folder || p === `${folder}.md`) return true;
        return p.startsWith(prefix) && !p.slice(prefix.length).includes("/");
    };
}

function compileRule(rule: ScopeRule): Matcher {
    switch (rule.kind) {
        case "folder": {
            const inFolder = folderMatcher(rule.folder, rule.subfolders);
            return rule.op === "in" ? (_f, v) => inFolder(v.path) : (_f, v) => !inFolder(v.path);
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
            return rule.op === "any" ? (_f, v) => has(v.tags()) : (_f, v) => !has(v.tags());
        }
        case "property": {
            const { property, op } = rule;
            if (op === "set") return (_f, v) => v.value(property).present;
            if (op === "notSet") return (_f, v) => !v.value(property).present;
            const wanted = new Set(rule.values);
            return (_f, v) => v.value(property).values.some((value) => wanted.has(value));
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
    return items
        .filter((item) => item !== null && item !== undefined && typeof item !== "object")
        .map(normalizeValue)
        .filter((value) => value.length > 0);
}

function findKey(frontmatter: Readonly<Record<string, unknown>>, property: string): string | undefined {
    if (Object.prototype.hasOwnProperty.call(frontmatter, property)) return property;
    const wanted = property.toLowerCase();
    return Object.keys(frontmatter).find((key) => key.toLowerCase() === wanted);
}

function viewOf(facts: ScopeFacts): FactView {
    let tags: Set<string> | undefined;
    return {
        path: facts.path,
        tags: () => (tags ??= new Set(facts.tags.map(normalizeTag))),
        value: (property) => {
            const fm = facts.frontmatter;
            const key = fm ? findKey(fm, property) : undefined;
            if (!fm || key === undefined) return { present: false, values: [] };
            return { present: true, values: propertyValues(fm[key]) };
        },
    };
}

/** The system folder `path` sits in, or `null`. */
export function systemFolderOf(compiled: CompiledScope, path: string): string | null {
    return excludedPrefixOf(path, compiled.system);
}

/** Every leave-out rule that matches, by position. */
export function matchingRules(compiled: CompiledScope, facts: ScopeFacts): number[] {
    const view = viewOf(facts);
    const out: number[] = [];
    compiled.leaveOut.forEach((match, index) => {
        if (match(facts, view)) out.push(index);
    });
    return out;
}

/** The first exception that matches, by position, or `-1`. */
export function keepingException(compiled: CompiledScope, facts: ScopeFacts): number {
    const view = viewOf(facts);
    return compiled.keep.findIndex((match) => match(facts, view));
}

/** Whether one compiled rule matches — for counting a draft without compiling the rest again. */
export function ruleMatches(rule: ScopeRule, facts: ScopeFacts): boolean {
    return compileRule(rule)(facts, viewOf(facts));
}

/** A rule compiled once, for counting it over many notes. */
export function compileOne(rule: ScopeRule): (facts: ScopeFacts) => boolean {
    const match = compileRule(rule);
    return (facts) => match(facts, viewOf(facts));
}

/** In or out, and why. System folders first: no exception rescues ZettelFlow's own files. */
export function scopeVerdict(compiled: CompiledScope, facts: ScopeFacts): ScopeVerdict {
    const system = systemFolderOf(compiled, facts.path);
    if (system !== null) return { in: false, by: { kind: "system", folder: system }, alsoBy: [] };
    if (compiled.leaveOut.length === 0) return { in: true };
    const view = viewOf(facts);
    const matched: number[] = [];
    compiled.leaveOut.forEach((match, index) => {
        if (match(facts, view)) matched.push(index);
    });
    if (matched.length === 0) return { in: true };
    const kept = compiled.keep.findIndex((match) => match(facts, view));
    if (kept >= 0) return { in: true, keptBy: kept };
    return { in: false, by: { kind: "rule", index: matched[0] }, alsoBy: matched.slice(1) };
}
