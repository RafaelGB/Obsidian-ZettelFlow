import type { IdeaSnapshot } from "architecture/knowledge/model/Idea";

/**
 * A vault we can measure (#457, epic #452).
 *
 * The budgets need a vault of fifty thousand notes, and a real one is not available to CI. This
 * builds `IdeaSnapshot`s — the exact pure input `deriveIdea` takes from the Obsidian layer — so
 * the whole measuring harness runs with no Obsidian, no DOM and no files on disk.
 *
 * Two properties matter more than realism in the details:
 *
 * - **Deterministic.** A budget compared against a vault that changes shape between runs is a
 *   coin toss. Seeded, no `Math.random`, no clock.
 * - **Shaped like a vault, not like a benchmark.** Evenly connected notes with uniform tags would
 *   make every graph query cost the same, and the costs this epic is chasing come from exactly
 *   the opposite: a few hub notes, a long tail of orphans, and a handful of very common tags.
 */

/** A small, fast, deterministic PRNG (mulberry32). Same seed, same vault, on every machine. */
function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const FOLDERS = [
    "Notes",
    "Notes/Reading",
    "Notes/Projects",
    "Notes/Daily",
    "Permanent",
    "Permanent/Concepts",
    "Literature",
    "Inbox",
];

/** The lifecycle values a schema classifies — most notes have one, some have none. */
const STATES = ["fleeting", "literature", "developing", "permanent", "evergreen"];

/** Skewed on purpose: the first is on a fifth of the vault, the last on a handful of notes. */
const TAGS = [
    "#zettelkasten",
    "#reading",
    "#project",
    "#idea",
    "#question",
    "#method",
    "#archive",
    "#draft",
    "#reference",
    "#someday",
];

const RELATION_KEYS = ["supports", "contradicts", "extends", "refines"];
const INLINE_KEYS = ["supports", "contradicts", "claim", "source"];

const DAY = 24 * 60 * 60 * 1000;
/** A fixed epoch, so a vault generated today equals one generated next month. */
const EPOCH = 1_600_000_000_000;
/** Two years of history — long enough for the timeline and lifecycle analyses to have work. */
const SPAN = 730 * DAY;

/**
 * Build `count` notes.
 *
 * The link topology is the interesting part: a note links **backwards** only, to notes with a
 * lower index, which keeps the graph acyclic and every link resolvable without a second pass. A
 * small set of early notes act as hubs and collect most of the incoming links, which is what
 * makes in-degree — and therefore the maturity signals and the graph analyses — non-uniform.
 */
export function generateVault(count: number, seed = 1): IdeaSnapshot[] {
    const next = random(seed);
    const paths: string[] = [];
    for (let index = 0; index < count; index++) {
        const folder = FOLDERS[index % FOLDERS.length];
        paths.push(`${folder}/Note ${index}.md`);
    }

    // The hubs: the first few notes of a vault are the ones everything ends up pointing at.
    const hubCount = Math.max(1, Math.floor(count / 200));

    const vault: IdeaSnapshot[] = [];
    for (let index = 0; index < count; index++) {
        const path = paths[index];
        const created = EPOCH + Math.floor(next() * SPAN);
        const modified = created + Math.floor(next() * 90 * DAY);

        const outgoingLinks: string[] = [];
        const resolvedTargets: Record<string, string> = {};
        const frontmatter: Record<string, unknown> = {};
        const inlineFields: { key: string; value: string }[] = [];

        // Roughly a fifth of notes are orphans; the rest link backwards, often to a hub.
        const roll = next();
        if (index > 0 && roll > 0.2) {
            const links = 1 + Math.floor(next() * 4);
            for (let link = 0; link < links; link++) {
                const toHub = next() < 0.55 && hubCount > 0;
                const target = toHub
                    ? paths[Math.floor(next() * Math.min(hubCount, index))]
                    : paths[Math.floor(next() * index)];
                if (target && target !== path && !outgoingLinks.includes(target)) {
                    outgoingLinks.push(target);
                }
            }
        }

        // Three quarters of notes carry a lifecycle state; the rest are what "unknown" is for.
        if (next() < 0.75) frontmatter.state = STATES[Math.floor(next() * STATES.length)];
        frontmatter.title = `Note ${index}`;

        // A typed relation in frontmatter, on about a third of the notes that link at all.
        if (outgoingLinks.length > 0 && next() < 0.35) {
            const key = RELATION_KEYS[Math.floor(next() * RELATION_KEYS.length)];
            const target = outgoingLinks[0];
            const name = target.slice(target.lastIndexOf("/") + 1).replace(/\.md$/, "");
            frontmatter[key] = `[[${name}]]`;
            resolvedTargets[name] = target;
        }

        // Tags, skewed: index 0 is drawn far more often than index 9.
        const tags: string[] = [];
        const tagCount = Math.floor(next() * 3);
        for (let tag = 0; tag < tagCount; tag++) {
            const skewed = Math.floor(next() * next() * TAGS.length);
            const chosen = TAGS[Math.min(skewed, TAGS.length - 1)];
            if (!tags.includes(chosen)) tags.push(chosen);
        }

        // The inline fields the deferred enrichment pass exists to find (#147/#148) — on about a
        // tenth of notes, which is why reading every note to find them is the wrong shape.
        if (next() < 0.1) {
            const key = INLINE_KEYS[Math.floor(next() * INLINE_KEYS.length)];
            const target = outgoingLinks[0];
            inlineFields.push({
                key,
                value: target
                    ? `[[${target.slice(target.lastIndexOf("/") + 1).replace(/\.md$/, "")}]]`
                    : `An inline claim on note ${index}.`,
            });
        }

        vault.push({
            path,
            title: `Note ${index}`,
            created,
            modified,
            frontmatter,
            tags,
            outgoingLinks,
            inlineFields,
            resolvedTargets,
        });
    }
    return vault;
}

/** The note bodies the enrichment pass would read, for the budgets that measure reading. */
export function generateBody(note: IdeaSnapshot): string {
    const inline = note.inlineFields.map((field) => `${field.key}:: ${field.value}`).join("\n");
    const links = note.outgoingLinks
        .map((link) => `[[${link.slice(link.lastIndexOf("/") + 1).replace(/\.md$/, "")}]]`)
        .join(" ");
    return `# ${note.title}\n\n${inline}\n\nSome prose about ${note.title}. ${links}\n`;
}
