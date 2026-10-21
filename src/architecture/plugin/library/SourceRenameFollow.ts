import { Notice } from "obsidian";
import { t } from "architecture/lang";
import { log } from "architecture/monitoring/Logger";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { PageInkStore } from "architecture/plugin/thinking/PageInkStore";
import { withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { ARTICLES_DEFAULT, articlesFolder } from "application/library/article";
import { followSettings, isFollowedSource, type FollowedSettings } from "application/library/renameFollow";
import { archiveFolderOf } from "application/library/archive";

/** What the follow needs of the plugin: its settings, and the one serialized way to save them. */
export interface RenameFollowHost {
    settings: FollowedSettings & { articlesFolder?: string; libraryArchiveFolder?: string };
    saveSettings(): Promise<void>;
}

type Followed = (from: string, to: string) => void;

/**
 * **What you made follows a renamed book** (#810 FR-1–FR-7).
 *
 * A PDF, an EPUB or an article renamed or moved in the vault takes its page ink, every thought about
 * it, the Library's place and bookmarks, its layers and its resume entries with it — with the Reader
 * and the Library open or closed, since the plugin's own rename listener calls it. A folder move
 * fires one rename per file; they are followed one after the other.
 *
 * Planned first: a book with nothing to follow writes nothing at all (FR-3). The vault writes go
 * through the seam as **one** batch (FR-5), plugin data is saved once, and the follow is silent unless
 * a part fails — then that part stays at the old path, and one Notice says so (FR-6).
 */
export class SourceRenameFollow {
    private static instance: SourceRenameFollow | undefined;

    public static getInstance(): SourceRenameFollow {
        if (!SourceRenameFollow.instance) SourceRenameFollow.instance = new SourceRenameFollow();
        return SourceRenameFollow.instance;
    }

    /** Injected at load (#374): `getOwnPlugin()` is undefined while the plugin is enabling. */
    private host: RenameFollowHost | null = null;
    private chain: Promise<void> = Promise.resolve();
    private readonly listeners = new Set<Followed>();

    public init(host: RenameFollowHost): void {
        this.host = host;
    }

    /** Told after a book's state has followed it: an open Reader reads it at its new path. */
    public onFollowed(listener: Followed): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Follow `from` → `to`, after any follow already under way. Resolves when this one is done. */
    public follow(from: string, to: string): Promise<void> {
        const next = this.chain.then(() => this.run(from, to));
        this.chain = next.catch(() => undefined);
        return next;
    }

    private async run(from: string, to: string): Promise<void> {
        const host = this.host;
        if (!host || from === to) return;
        const raw = host.settings.articlesFolder;
        const archive = archiveFolderOf(host.settings.libraryArchiveFolder);
        if (!isFollowedSource(from, to, articlesFolder(raw === undefined ? ARTICLES_DEFAULT : raw), archive)) return;
        const thoughts = ThoughtStore.getInstance();
        const ink = PageInkStore.getInstance();
        const hasThoughts = thoughts.aboutFiles(from).length > 0;
        const hasInk = ink.has(from);
        const change = followSettings(host.settings, from, to, archive);
        // Nothing of yours is keyed by it: no file, no plugin data (FR-3).
        if (!hasThoughts && !hasInk && !change.changed) return;

        const failed: string[] = [];
        if (hasInk || hasThoughts) {
            await withWriteBatch({ kind: "manual", ref: "reader-rename-follow", label: `${from} → ${to}` }, async () => {
                if (hasInk) {
                    try {
                        await ink.follow(from, to);
                    } catch (error) {
                        failed.push("ink");
                        log.error(`[Reader] the page ink of ${from} could not follow it to ${to}: ${String(error)}`);
                    }
                }
                if (hasThoughts) {
                    try {
                        await thoughts.reabout(from, to);
                    } catch (error) {
                        failed.push("thoughts");
                        log.error(`[Reader] the thoughts about ${from} could not follow it to ${to}: ${String(error)}`);
                    }
                }
            });
        }
        if (change.changed) {
            const settings = host.settings;
            const before = { library: settings.library, readerLayers: settings.readerLayers, readerResume: settings.readerResume, libraryArchive: settings.libraryArchive };
            if (change.library) settings.library = change.library;
            if (change.readerLayers) settings.readerLayers = change.readerLayers;
            if (change.readerResume) settings.readerResume = change.readerResume;
            if (change.libraryArchive) settings.libraryArchive = change.libraryArchive;
            try {
                await host.saveSettings();
            } catch (error) {
                // What could not follow stays at the old key, never lost (FR-6).
                Object.assign(settings, before);
                failed.push("settings");
                log.error(`[Reader] the place and bookmarks of ${from} could not follow it to ${to}: ${String(error)}`);
            }
        }
        // Off-surface — a rename in the file explorer — so a Notice, only when something failed.
        if (failed.length > 0) new Notice(t("reader_follow_failed", from.split("/").pop() ?? from));
        for (const listener of this.listeners) {
            try {
                listener(from, to);
            } catch (error) {
                log.warn(`[Reader] a view could not take a rename: ${String(error)}`);
            }
        }
    }
}
