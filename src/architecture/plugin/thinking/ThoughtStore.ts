import { TFile } from "obsidian";
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
} from "application/thinking/thought";

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

    /** The configured folder, or the default. Empty means the Lab is not usable yet. */
    public folder(): string {
        return ObsidianApi.getOwnPlugin()?.settings.thoughtLabPath ?? "";
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
        options: { respondsTo?: Response; about?: string } = {}
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

    private files(): TFile[] {
        const folder = this.folder();
        if (!folder) return [];
        return ObsidianApi.vault()
            .getMarkdownFiles()
            .filter((file) => file.path === folder || file.path.startsWith(`${folder}/`));
    }
}
