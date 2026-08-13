/**
 * Pure ranking core for the companion pane's connection suggestions.
 *
 * Obsidian-free: the React caller gathers candidate notes (tags/keywords) from the
 * `metadataCache` and hands them here to be scored by overlap with the emerging note.
 */

/** Default upper bound on how many suggestions are surfaced (FR-8). */
export const DEFAULT_MAX_SUGGESTIONS = 5;

const TAG_WEIGHT = 3;
const KEYWORD_WEIGHT = 1;
const MIN_KEYWORD_LENGTH = 3;

// Small bilingual stop-word set so common filler words don't create noise suggestions.
const STOP_WORDS = new Set([
    "the", "and", "for", "with", "from", "that", "this", "into", "your",
    "los", "las", "por", "con", "una", "del", "para", "como",
]);

export interface SuggestionCandidate {
    path: string;
    basename: string;
    tags: string[];
    /** Optional extra keywords (e.g. from aliases); the basename is always matched too. */
    keywords?: string[];
}

export interface ConnectionSuggestion {
    path: string;
    basename: string;
    score: number;
    sharedTags: string[];
}

export interface RankSuggestionsInput {
    tags: string[];
    titleKeywords: string[];
    candidates: SuggestionCandidate[];
    max?: number;
    excludePaths?: string[];
}

/**
 * Normalises a note title into ranking keywords: lowercased, split on non-alphanumerics,
 * short tokens and stop-words dropped, de-duplicated.
 */
export function extractTitleKeywords(title: string): string[] {
    if (!title) return [];
    const seen = new Set<string>();
    const keywords: string[] = [];
    for (const raw of title.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
        if (raw.length < MIN_KEYWORD_LENGTH) continue;
        if (STOP_WORDS.has(raw)) continue;
        if (seen.has(raw)) continue;
        seen.add(raw);
        keywords.push(raw);
    }
    return keywords;
}

/**
 * Scores candidate notes against the emerging note's tags and title keywords and returns a
 * bounded, relevance-ordered list (ties broken by basename). Zero-score candidates and any
 * path in `excludePaths` are omitted.
 */
export function rankConnectionSuggestions(input: RankSuggestionsInput): ConnectionSuggestion[] {
    const { tags, titleKeywords, candidates, max = DEFAULT_MAX_SUGGESTIONS, excludePaths = [] } = input;

    const noteTags = new Set(tags);
    const keywords = titleKeywords.map((keyword) => keyword.toLowerCase());
    const excluded = new Set(excludePaths);

    const scored: ConnectionSuggestion[] = [];
    for (const candidate of candidates) {
        if (excluded.has(candidate.path)) continue;

        const sharedTags = candidate.tags.filter((tag) => noteTags.has(tag));
        let score = sharedTags.length * TAG_WEIGHT;

        if (keywords.length > 0) {
            const haystack = candidate.basename.toLowerCase();
            const candidateKeywords = (candidate.keywords ?? []).map((k) => k.toLowerCase());
            for (const keyword of keywords) {
                if (haystack.includes(keyword) || candidateKeywords.includes(keyword)) {
                    score += KEYWORD_WEIGHT;
                }
            }
        }

        if (score <= 0) continue;
        scored.push({ path: candidate.path, basename: candidate.basename, score, sharedTags });
    }

    scored.sort((a, b) => (b.score - a.score) || a.basename.localeCompare(b.basename));
    return scored.slice(0, Math.max(0, max));
}
