/**
 * What the settings card counts (#713, FR-11 to FR-13), and what its pickers offer (FR-9). Pure.
 *
 * Count definitions, settled once so every number on the card agrees with every other:
 * - a rule's *Leaves out N* is the notes it matches, outside ZettelFlow's own folders, that no
 *   exception keeps — rules may overlap, so a count never depends on the order of the rules;
 * - an exception's *Keeps N* is the notes it rescues from at least one matching rule;
 * - the list of left-out notes files each note under the rule that **names** it (the first that
 *   matches), so its groups are disjoint and add up to the summary;
 * - a draft's *Would leave out N* uses the rule definition, so once added the rule shows exactly N.
 */
import { classifyAll, compileOne, propertyValues, type Classification, type CompiledScope, type ScopeFacts } from "./scopeEvaluate";
import { normalizeTag, type ScopeRule } from "./scopeRules";

export interface ScopeCensus {
    total: number;
    knowledge: number;
    leftOutByRules: number;
    keptByExceptions: number;
    system: number;
    perRule: number[];
    perException: number[];
    /** The left-out notes, under the rule that names them; only rules that leave something out. */
    groups: { index: number; paths: string[] }[];
    /** The rules leave out every note there is (FR-15) — said, never refused. */
    allOut: boolean;
}

/**
 * One pass over the vault's facts. Pass the card's `classes` (from {@link classifyAll}) to reuse
 * them; without, they are computed here.
 */
export function scopeCensus(
    compiled: CompiledScope,
    facts: readonly ScopeFacts[],
    classes: readonly Classification[] = classifyAll(compiled, facts)
): ScopeCensus {
    const perRule = compiled.leaveOut.map(() => 0);
    const perException = compiled.keep.map(() => 0);
    const grouped = compiled.leaveOut.map((): string[] => []);
    let system = 0;
    let knowledge = 0;
    let leftOut = 0;
    let kept = 0;
    classes.forEach((verdict, at) => {
        if (verdict.system !== null) {
            system++;
            return;
        }
        if (verdict.matched.length === 0) {
            knowledge++;
            return;
        }
        if (verdict.kept.length > 0) {
            knowledge++;
            kept++;
            for (const index of verdict.kept) perException[index]++;
            return;
        }
        leftOut++;
        for (const index of verdict.matched) perRule[index]++;
        grouped[verdict.matched[0]].push(facts[at].path);
    });
    const byName = (a: string, b: string) => a.localeCompare(b);
    return {
        total: facts.length,
        knowledge,
        leftOutByRules: leftOut,
        keptByExceptions: kept,
        system,
        perRule,
        perException,
        groups: grouped.map((paths, index) => ({ index, paths: paths.sort(byName) })).filter((group) => group.paths.length > 0),
        allOut: facts.length - system > 0 && knowledge === 0,
    };
}

/** A note's name as a list shows it: no folders, no extension. */
export function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

export interface DraftPreview {
    /** *Would leave out N* (a rule) or *Would keep N* (an exception). */
    count: number;
    /** Of those, how many another rule already leaves out (or another exception already keeps). */
    already: number;
    /** The first few, by name. */
    sample: string[];
}

/**
 * What a rule being written would do, before it is added (AC-8). Only the draft is evaluated: the
 * other rules' verdicts are the card's `classes`, computed once per render. When a rule is being
 * edited, `editing` is its position, so it is not counted as "another rule".
 */
export function draftPreview(
    compiled: CompiledScope,
    draft: ScopeRule,
    mode: "leaveOut" | "keep",
    facts: readonly ScopeFacts[],
    editing = -1,
    classes: readonly Classification[] = classifyAll(compiled, facts),
    sampleSize = 3
): DraftPreview {
    const match = compileOne(draft);
    const names: string[] = [];
    let count = 0;
    let already = 0;
    facts.forEach((note, at) => {
        const verdict = classes[at];
        if (verdict.system !== null) return;
        if (mode === "leaveOut") {
            // An exception keeps it whatever the draft says.
            if (verdict.kept.length > 0 || !match(note)) return;
            count++;
            if (verdict.matched.some((index) => index !== editing)) already++;
        } else {
            if (verdict.matched.length === 0 || !match(note)) return;
            count++;
            if (verdict.kept.some((index) => index !== editing)) already++;
        }
        names.push(noteName(note.path));
    });
    return { count, already, sample: names.sort((a, b) => a.localeCompare(b)).slice(0, sampleSize) };
}


export interface VocabularyEntry {
    name: string;
    count: number;
}

export interface PropertyVocabulary extends VocabularyEntry {
    values: VocabularyEntry[];
}

export interface ScopeVocabulary {
    tags: VocabularyEntry[];
    properties: PropertyVocabulary[];
}

/** Properties a tag rule already covers, so the property picker never offers them twice. */
const TAG_KEYS = new Set(["tags", "tag"]);

function sorted(counts: Map<string, number>): VocabularyEntry[] {
    return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * What the pickers offer (FR-9): every tag, property and value notes carry, each with the number of
 * notes that carry it. Nothing here can be typed — a rule is made only of what the vault holds.
 */
export function scopeVocabulary(facts: readonly ScopeFacts[]): ScopeVocabulary {
    const tags = new Map<string, number>();
    const properties = new Map<string, { count: number; values: Map<string, number> }>();
    for (const note of facts) {
        for (const tag of new Set(note.tags.map(normalizeTag).filter((t) => t.length > 0))) {
            tags.set(tag, (tags.get(tag) ?? 0) + 1);
        }
        for (const [key, raw] of Object.entries(note.frontmatter ?? {})) {
            if (TAG_KEYS.has(key.toLowerCase())) continue;
            const entry = properties.get(key) ?? { count: 0, values: new Map<string, number>() };
            entry.count++;
            for (const value of new Set(propertyValues(raw))) entry.values.set(value, (entry.values.get(value) ?? 0) + 1);
            properties.set(key, entry);
        }
    }
    return {
        tags: sorted(tags),
        properties: [...properties.entries()]
            .map(([name, entry]) => ({ name, count: entry.count, values: sorted(entry.values) }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
}

/**
 * The vocabulary, plus whatever a stored rule names that no note carries any more — at zero, so the
 * rule being edited can still be read and its stale value unticked.
 */
export function withStoredValues(vocabulary: ScopeVocabulary, rule: ScopeRule): ScopeVocabulary {
    if (rule.kind === "tag") {
        const have = new Set(vocabulary.tags.map((tag) => tag.name));
        return { ...vocabulary, tags: [...vocabulary.tags, ...rule.tags.filter((tag) => !have.has(tag)).map((name) => ({ name, count: 0 }))] };
    }
    if (rule.kind === "property") {
        const properties = [...vocabulary.properties];
        let at = properties.findIndex((p) => p.name === rule.property);
        if (at < 0) {
            properties.push({ name: rule.property, count: 0, values: [] });
            at = properties.length - 1;
        }
        const have = new Set(properties[at].values.map((value) => value.name));
        properties[at] = {
            ...properties[at],
            values: [...properties[at].values, ...rule.values.filter((value) => !have.has(value)).map((name) => ({ name, count: 0 }))],
        };
        return { ...vocabulary, properties };
    }
    return vocabulary;
}
