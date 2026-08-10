import type { Claim, Source } from "../model/Idea";
import type { ClaimParseInput, ClaimSchema } from "../model/schema";
import { isClaimKey, isSourceKey } from "./keys";
import { classifySources } from "./sources";

function basename(path: string): string {
    const file = path.split("/").pop() ?? path;
    return file.replace(/\.md$/i, "");
}

/**
 * Pure {@link ClaimSchema} (#148) — hybrid, gated by declaration:
 * 1. explicit `claim` / `claim::` fields → those claims, each carrying the note-level sources;
 * 2. else source keys present (no explicit claim) → one synthesized note-level claim whose text is
 *    the note basename, carrying those sources;
 * 3. else → `[]` (the note does not enter the claims accounting — no MOC/index noise).
 *
 * Sources are classified link/text and deduped (link by resolved path, text by normalized value),
 * collapsing a source declared in both frontmatter and inline. Per-claim binding is deferred:
 * every claim shares the note-level sources. Never throws.
 */
export class ClaimSourceSchema implements ClaimSchema {
    parse(input: ClaimParseInput): Claim[] {
        const { path, frontmatter, inlineFields } = input;
        const resolved = input.resolvedTargets ?? {};

        const claimTexts: string[] = [];
        const sources: Source[] = [];
        const seenSource = new Set<string>();

        const addSources = (value: unknown): void => {
            for (const source of classifySources(value, resolved)) {
                const key =
                    source.kind === "link"
                        ? `link:${source.ref}`
                        : `text:${source.ref.toLowerCase()}`;
                if (seenSource.has(key)) continue;
                seenSource.add(key);
                sources.push(source);
            }
        };

        const addClaimTexts = (value: unknown): void => {
            const scan = (item: unknown): void => {
                if (typeof item !== "string") return;
                const text = item.trim();
                if (text.length > 0) claimTexts.push(text);
            };
            if (Array.isArray(value)) value.forEach(scan);
            else scan(value);
        };

        const keyed: { key: string; value: unknown }[] = [
            ...Object.entries(frontmatter ?? {}).map(([key, value]) => ({ key, value })),
            ...(inlineFields ?? []).map((field) => ({ key: field.key, value: field.value })),
        ];
        for (const { key, value } of keyed) {
            if (isClaimKey(key)) addClaimTexts(value);
            else if (isSourceKey(key)) addSources(value);
        }

        if (claimTexts.length > 0) {
            return claimTexts.map((text) => ({ text, sources: [...sources] }));
        }
        if (sources.length > 0) {
            return [{ text: basename(path), sources }];
        }
        return [];
    }
}
