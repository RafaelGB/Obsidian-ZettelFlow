/**
 * The closed rule vocabulary for what is left out of the thinking system (#713). Pure.
 *
 * Three kinds, and nothing that could be a formula: a note is in or out of a **folder**, it has or
 * lacks a **tag**, or one of its **properties** holds one of the values notes already carry. The
 * stored shape is plain on purpose — it is the escape hatch a person can read in `data.json`
 * (§XIII), and {@link normalizeScopeRules} makes sure a hand edit can never break a load.
 */
import { normalizeExcludedPaths } from "./knowledgeScope";

export interface FolderRule {
    kind: "folder";
    op: "in" | "notIn";
    folder: string;
    subfolders: boolean;
}

export interface TagRule {
    kind: "tag";
    op: "any" | "none";
    /** Lowercase, without the `#`. */
    tags: string[];
    nested: boolean;
}

export interface PropertyRule {
    kind: "property";
    op: "oneOf" | "set" | "notSet";
    property: string;
    /** Only for `oneOf`; empty otherwise. Values a note carried when the rule was made. */
    values: string[];
}

export type ScopeRule = FolderRule | TagRule | PropertyRule;
export type ScopeRuleKind = ScopeRule["kind"];

/** What is left out, and the exceptions that keep a note in anyway. Rules are named by position. */
export interface ScopeRules {
    leaveOut: ScopeRule[];
    keep: ScopeRule[];
}

/** No rules: every note counts. Compare against it; never mutate it. */
export const EMPTY_SCOPE: Readonly<ScopeRules> = { leaveOut: [], keep: [] };

/** A tag as rules compare it: no `#`, NFC, lowercase (Obsidian's tags are case-insensitive). */
export function normalizeTag(raw: string): string {
    return raw.trim().replace(/^#+/, "").normalize("NFC").toLowerCase();
}

/** A property value as rules compare it: its string form, NFC, trimmed. */
export function normalizeValue(raw: unknown): string {
    return String(raw).normalize("NFC").trim();
}

function dedupe(values: readonly string[]): string[] {
    return [...new Set(values.filter((value) => value.length > 0))];
}

function strings(raw: unknown): string[] {
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

/** One rule from whatever was stored, or `null` when it is not one of the three closed kinds. */
export function normalizeRule(raw: unknown): ScopeRule | null {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    switch (r.kind) {
        case "folder": {
            if (r.op !== "in" && r.op !== "notIn") return null;
            const [folder] = normalizeExcludedPaths(typeof r.folder === "string" ? [r.folder] : []);
            if (!folder) return null;
            return { kind: "folder", op: r.op, folder, subfolders: r.subfolders !== false };
        }
        case "tag": {
            if (r.op !== "any" && r.op !== "none") return null;
            const tags = dedupe(strings(r.tags).map(normalizeTag));
            if (tags.length === 0) return null;
            return { kind: "tag", op: r.op, tags, nested: r.nested !== false };
        }
        case "property": {
            if (r.op !== "oneOf" && r.op !== "set" && r.op !== "notSet") return null;
            const property = typeof r.property === "string" ? r.property.normalize("NFC").trim() : "";
            if (!property) return null;
            const values = r.op === "oneOf" ? dedupe(strings(r.values).map(normalizeValue)) : [];
            if (r.op === "oneOf" && values.length === 0) return null;
            return { kind: "property", op: r.op, property, values };
        }
        default:
            return null;
    }
}

function ruleList(raw: unknown): ScopeRule[] {
    return Array.isArray(raw) ? raw.map(normalizeRule).filter((rule): rule is ScopeRule => rule !== null) : [];
}

/** The stored rules, validated: malformed rules dropped, names normalised. Never throws. */
export function normalizeScopeRules(raw: unknown): ScopeRules {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { leaveOut: [], keep: [] };
    const r = raw as Record<string, unknown>;
    return { leaveOut: ruleList(r.leaveOut), keep: ruleList(r.keep) };
}

/** A folder the previous version excluded, as the rule that leaves out exactly the same notes. */
export function folderRule(folder: string): FolderRule {
    return { kind: "folder", op: "in", folder, subfolders: true };
}

/** The old excluded folders as rules (#713 migration): one each, in their order. */
export function rulesFromExcludedPaths(paths: readonly string[]): ScopeRule[] {
    return normalizeExcludedPaths(paths).map(folderRule);
}

/**
 * The part of the rules the previous version can still read: its excluded folders. Written beside
 * the rules for one release, so a downgrade keeps every folder it understood.
 */
export function folderMirror(leaveOut: readonly ScopeRule[]): string[] {
    return normalizeExcludedPaths(
        leaveOut.filter((rule): rule is FolderRule => rule.kind === "folder" && rule.op === "in" && rule.subfolders).map((rule) => rule.folder)
    );
}

/** Two rules that say the same thing. */
export function sameRule(a: ScopeRule, b: ScopeRule): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}
