import { TFile } from "obsidian";
import type { ThoughtRef } from "architecture/knowledge/timeline/timelineEvents";
import { v4 as uuid4 } from "uuid";
import { log } from "architecture/monitoring/Logger";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { FileService } from "architecture/plugin/services/FileService";
import {
    newThought,
    orderThoughts,
    parseThought,
    renderThought,
    thoughtPath,
    type Response,
    type Thought,
    type ThoughtQuote,
} from "application/thinking/thought";
import { dueHighlights, isDueInFrontmatter } from "application/thinking/highlightReview";

/**
 * Where thoughts live (#466, epic #465).
 *
 * Thoughts are **files in your vault**, in a folder the system has agreed not to judge. Not
 * `data.json`: data you cannot open with your own tools is not yours, and the whole promise of
 * this layer is that what you write here is still yours even though the system ignores it.
 *
 * Writes go through `FileService`, like every other write in the plugin (#456), so a thought
 * lands in the write record and can be taken back.
 */
export class ThoughtStore {
    private static instance: ThoughtStore | undefined;

    public static getInstance(): ThoughtStore {
        if (!ThoughtStore.instance) ThoughtStore.instance = new ThoughtStore();
        return ThoughtStore.instance;
    }

    /**
     * The configured folder. Empty means the Lab is not usable yet — and **empty is also the
     * honest answer before the plugin has finished enabling**, because `getPlugin(id)` can throw
     * or return undefined during load (#374). A capture that asked too early used to take the
     * whole command down with it.
     */
    public folder(): string {
        try {
            return ObsidianApi.getOwnPlugin()?.settings.thoughtLabPath ?? "";
        } catch {
            return "";
        }
    }

    /** Every thought, newest first. A file it cannot parse is still a thought — just text. */
    public async all(): Promise<Thought[]> {
        const folder = this.folder();
        if (!folder) return [];
        const thoughts: Thought[] = [];
        for (const file of this.files()) {
            try {
                thoughts.push(parseThought(await ObsidianApi.vault().cachedRead(file), file.path));
            } catch (error) {
                log.warn("[lab] could not read a thought", error);
            }
        }
        return orderThoughts(thoughts);
    }

    /** Start one. No title is asked for, because a thought does not have one. */
    public async write(
        text: string,
        options: { respondsTo?: Response; about?: string; alsoAbout?: string; quote?: ThoughtQuote } = {}
    ): Promise<Thought | undefined> {
        const folder = this.folder();
        if (!folder) return undefined;
        const thought = newThought({ text, id: uuid4().slice(0, 8), at: Date.now(), ...options });
        await this.save(thought);
        return thought;
    }

    /** Write a thought back where it already is, or create it if it is new. */
    public async save(thought: Thought): Promise<void> {
        const folder = this.folder();
        if (!folder) return;
        const path = this.pathOf(thought) ?? thoughtPath(folder, thought);
        await FileService.writeFile(path, renderThought(thought), false);
    }

    /**
     * Throw a thought away.
     *
     * To Obsidian's **trash**, never deleted — the same rule the rest of the plugin lives by
     * (#454). Some things you write here are a typo or a false start, and a refuge you cannot
     * tidy becomes a junk drawer; but nothing ZettelFlow removes should be unrecoverable.
     */
    public async discard(thought: Thought): Promise<void> {
        const path = this.pathOf(thought);
        if (!path) return;
        const file = ObsidianApi.vault().getFileByPath(path);
        if (file instanceof TFile) await FileService.deleteFile(file);
    }

    /** Put a discarded thought back, exactly as it was. */
    public async restore(thought: Thought): Promise<void> {
        const folder = this.folder();
        if (!folder) return;
        await FileService.writeFile(thoughtPath(folder, thought), renderThought(thought), false);
    }

    /** The file a thought came from, when it is already on disk. */
    private pathOf(thought: Thought): string | undefined {
        return this.files().find((file) => file.path.includes(thought.id))?.path;
    }

    /**
     * The thoughts written **about** a note (#540), oldest first.
     *
     * Read from the **metadata cache**, not from disk: a thought's frontmatter already carries the
     * note it is about, so this answers *which thoughts are about this one* without opening a
     * single file. That matters because the caller is a view that recomputes on every change of
     * active file, and `all()` reads every thought in the folder.
     *
     * Returns references only — an id, a time and a path, never the text. The timeline is opt-in
     * because it stores claim texts; a strand that carried more past that opt-in would break the
     * bargain it was granted under.
     */
    public about(notePath: string): ThoughtRef[] {
        if (!notePath) return [];
        const out: ThoughtRef[] = [];
        for (const file of this.files()) {
            try {
                const front = ObsidianApi.metadataCache().getFileCache(file)?.frontmatter?.[
                    "zfThought"
                ] as Record<string, unknown> | undefined;
                // Either subject counts (#567): a collision's answer is about **two** notes, and
                // both of their timelines read this same link that was already in the data.
                if (!front) continue;
                if (front["about"] !== notePath && front["alsoAbout"] !== notePath) continue;
                const at = Number(front["at"]);
                const id = front["id"];
                const quote = front["quoteExact"];
                out.push({
                    id: typeof id === "string" && id ? id : file.basename,
                    at: Number.isFinite(at) ? at : file.stat.ctime,
                    path: file.path,
                    ...(typeof quote === "string" && quote && front["about"] === notePath ? { quote } : {}),
                });
            } catch (error) {
                // A half-written or hand-edited thought is not worth a broken timeline.
                log.warn("[lab] could not read a thought's frontmatter", error);
            }
        }
        return out.sort((a, b) => a.at - b.at);
    }

    /**
     * The highlights made in the Reader on a note (#671): the thoughts about it that carry a
     * passage, read in full because the reader needs the anchor and the margin note. Which files
     * to read is decided from the metadata cache, so a lab of a thousand thoughts reads a handful.
     */
    public async highlightsAbout(notePath: string): Promise<Thought[]> {
        if (!notePath || !this.folder()) return [];
        const out: Thought[] = [];
        for (const file of this.files()) {
            try {
                const front = ObsidianApi.metadataCache().getFileCache(file)?.frontmatter?.["zfThought"] as
                    | Record<string, unknown>
                    | undefined;
                if (!front || front["about"] !== notePath || !front["quoteExact"]) continue;
                const thought = parseThought(await ObsidianApi.vault().cachedRead(file), file.path);
                if (thought.quote?.exact && thought.about === notePath) out.push(thought);
            } catch (error) {
                log.warn("[lab] could not read a highlight", error);
            }
        }
        return out.sort((a, b) => a.at - b.at);
    }

    /**
     * Whether anything you marked is due a second look today (#678) — answered from the metadata
     * cache, so Home and Think can decide whether to offer the door without reading a file.
     */
    public anyHighlightDue(now: number = Date.now()): boolean {
        if (!this.folder()) return false;
        return this.files().some((file) => {
            try {
                return isDueInFrontmatter(this.frontOf(file), now);
            } catch {
                return false;
            }
        });
    }

    /**
     * The few highlights to look at again now (#678), read in full. The cache picks which files;
     * the pure {@link dueHighlights} decides, so the answer is the same one the door gave.
     */
    public async dueHighlights(now: number = Date.now()): Promise<Thought[]> {
        if (!this.folder()) return [];
        const out: Thought[] = [];
        for (const file of this.files()) {
            try {
                if (!isDueInFrontmatter(this.frontOf(file), now)) continue;
                out.push(parseThought(await ObsidianApi.vault().cachedRead(file), file.path));
            } catch (error) {
                log.warn("[lab] could not read a highlight to review", error);
            }
        }
        return dueHighlights(out, now);
    }

    private frontOf(file: TFile): Record<string, unknown> | undefined {
        return ObsidianApi.metadataCache().getFileCache(file)?.frontmatter?.["zfThought"] as
            | Record<string, unknown>
            | undefined;
    }

    private files(): TFile[] {
        const folder = this.folder();
        if (!folder) return [];
        return ObsidianApi.vault()
            .getMarkdownFiles()
            .filter((file) => file.path === folder || file.path.startsWith(`${folder}/`));
    }
}
