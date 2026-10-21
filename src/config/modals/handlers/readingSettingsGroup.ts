import { getLanguage, type Setting, type SettingDefinitionItem } from "obsidian";
import type ZettelFlow from "main";
import { c, log, ObsidianApi } from "architecture";
import { t, tCount } from "architecture/lang";
import { rowContainer } from "architecture/components/settings/settingContainer";
import { DictionaryShelf, type DictionaryFiles, type DictionaryInfo } from "architecture/plugin/library/DictionaryShelf";
import { languageName } from "architecture/components/core/reader/readerLanguage";
import { validLanguage } from "application/library/stardict/languages";
import { DEFAULT_DICTIONARIES_FOLDER, dictionarySettings, translateChoices, type DictionarySettings } from "application/library/dictionarySettings";
import { DEFAULT_SETTINGS } from "config/typing";
import { addFolderField } from "./folderField";
import type { ShelfItem } from "application/library/shelf";
import { ARCHIVE_DEFAULT, archiveFolderOf, leaveOffer } from "application/library/archive";
import { articlesFolder } from "application/library/article";
import { gatherArchived } from "architecture/components/core/library/libraryShelf";
import { folderClashText } from "architecture/components/core/library/libraryFolders";
import { forgetArchive, moveArchive, realArchivePort } from "architecture/plugin/library/archiveWrites";
import { normalizeReaderPrefs } from "architecture/components/core/reader/readerPrefs";
import {
    CHAPTER_MOTIONS,
    OPEN_MOTIONS,
    readingMotion,
    type ChapterMotion,
    type OpenMotion,
    type ReadingMotion,
} from "architecture/components/core/reader/readingMotion";

type LocaleKey = Parameters<typeof t>[0];

const OPEN_LABEL: Record<OpenMotion, LocaleKey> = {
    shot: "settings_reading_open_shot",
    instant: "settings_reading_open_instant",
};

const CHAPTER_LABEL: Record<ChapterMotion, LocaleKey> = {
    leaf: "settings_reading_chapter_leaf",
    flow: "settings_reading_chapter_flow",
    stack: "settings_reading_chapter_stack",
};

/** Where a book's note goes until you choose (#743). */
export const BOOK_NOTES_DEFAULT = DEFAULT_SETTINGS.bookNotesFolder ?? "Library";
/** Where articles come from until you choose (#744): Web Clipper's own folder. */
export const ARTICLES_FOLDER_DEFAULT = DEFAULT_SETTINGS.articlesFolder ?? "Clippings";

/** What the archive's row needs of the vault (#865 FR-5): what lies in a folder, and the two answers. */
export interface ArchiveSettingsDeps {
    archivedIn(folder: string): ShelfItem[];
    move(items: readonly ShelfItem[], to: string): Promise<void>;
    forget(items: readonly ShelfItem[]): Promise<void>;
}

const realArchiveDeps = (plugin: Pick<ZettelFlow, "settings" | "saveSettings">): ArchiveSettingsDeps => ({
    archivedIn: (folder) => {
        try {
            return gatherArchived(ObsidianApi.globalApp(), plugin, folder);
        } catch (error) {
            log.debug(`[Library] the archive could not be read: ${String(error)}`);
            return [];
        }
    },
    move: async (items, to) => {
        await moveArchive(items, to, realArchivePort, plugin);
    },
    forget: (items) => forgetArchive(items.flatMap((item) => (item.file ? [item.file] : [])), plugin),
});

/**
 * The archive folder changed while things were in the old one (#865 FR-5): say what is there — books
 * and papers, and articles, apart — what *Leave them* means for each, and offer both answers inline.
 */
function drawArchiveOffer(host: HTMLElement, old: string, to: string, items: readonly ShelfItem[], deps: ArchiveSettingsDeps): void {
    host.empty();
    const { sources, articles } = leaveOffer(items);
    if (sources + articles === 0 || !to) return;
    const box = host.createDiv({ cls: c("settings-archive-offer-box") });
    const counts = [
        ...(sources > 0 ? [tCount(sources, "settings_archive_offer_sources", String(sources))] : []),
        ...(articles > 0 ? [tCount(articles, "settings_archive_offer_articles", String(articles))] : []),
    ];
    box.createDiv({ text: t("settings_archive_offer_lead", old, counts.join(" · ")) });
    if (sources > 0) box.createDiv({ cls: c("settings-archive-offer-note"), text: t("settings_archive_offer_leave_sources") });
    if (articles > 0) box.createDiv({ cls: c("settings-archive-offer-note"), text: t("settings_archive_offer_leave_articles", old) });
    const row = box.createDiv({ cls: c("settings-archive-offer-row") });
    const said = (text: string) => {
        host.empty();
        host.createDiv({ cls: c("settings-archive-offer-box"), text });
    };
    const move = row.createEl("button", { cls: "mod-cta", text: t("settings_archive_offer_move", to), attr: { type: "button" } });
    const leave = row.createEl("button", { text: t("settings_archive_offer_leave"), attr: { type: "button" } });
    // One answer: both are put away the moment either is given.
    const answered = () => {
        move.setAttr("disabled", "true");
        leave.setAttr("disabled", "true");
    };
    move.addEventListener("click", () => {
        answered();
        void deps
            .move(items, to)
            .then(() => said(t("settings_archive_offer_moved", to)))
            .catch((error: unknown) => {
                log.error(`[Library] the archive could not move to ${to}: ${String(error)}`);
                said(t("settings_archive_offer_failed"));
            });
    });
    leave.addEventListener("click", () => {
        answered();
        void deps
            .forget(items)
            .then(() => said(t("settings_archive_offer_left", old)))
            .catch((error: unknown) => {
                log.error(`[Library] the archive's records could not be forgotten: ${String(error)}`);
                said(t("settings_archive_offer_failed"));
            });
    });
}

/**
 * **Reading** (#732, epic #729): how a book opens from the Library and how one chapter gives way to
 * the next. Reduced motion still wins over both — the section's purpose line says so.
 *
 * And where a book's note is kept (#743): a folder field like the plugin's other folder rows,
 * committed when you leave it, press Enter or pick a suggestion. Saving it creates no folder — the
 * folder is made with the first book's note — and changing it moves no note.
 *
 * And where articles come from (#744): the same folder field, which may be emptied to turn articles
 * off. The Library's *Articles* chip edits the same setting.
 */
export function readingSettingsGroup(
    plugin: Pick<ZettelFlow, "settings" | "saveSettings">,
    /** After the folder changes: the pointer in *Folders ZettelFlow uses* follows it. */
    bookNotesChanged: () => void = () => undefined,
    /** After the articles folder changes (#744): an open Library shows the shelf it now makes. */
    articlesChanged: () => void = () => undefined,
    /** After *Library shows books as* changes (#819): an open Library turns its books. */
    bookViewChanged: () => void = articlesChanged,
    /** After the archive folder changes (#865): an open Library shows its cabinet, and the pointer follows. */
    archiveChanged: () => void = articlesChanged,
    archiveDeps: ArchiveSettingsDeps = realArchiveDeps(plugin)
): SettingDefinitionItem {
    const clash = (self: "bookNotes" | "articles" | "archive") => (value: string) => folderClashText(plugin.settings, self, value);
    const save = async (change: Partial<ReadingMotion>) => {
        plugin.settings.readingMotion = { ...readingMotion(plugin.settings.readingMotion), ...change };
        await plugin.saveSettings();
    };
    return {
        type: "group",
        items: [
            {
                name: t("settings_reading_open_name"),
                desc: t("settings_reading_open_desc"),
                render: (setting) => {
                    setting.addDropdown((dropdown) => {
                        for (const motion of OPEN_MOTIONS) dropdown.addOption(motion, t(OPEN_LABEL[motion]));
                        dropdown.setValue(readingMotion(plugin.settings.readingMotion).open);
                        dropdown.onChange((value) => save({ open: value as OpenMotion }));
                    });
                },
            },
            {
                name: t("settings_reading_chapter_name"),
                desc: t("settings_reading_chapter_desc"),
                render: (setting) => {
                    setting.addDropdown((dropdown) => {
                        for (const motion of CHAPTER_MOTIONS) dropdown.addOption(motion, t(CHAPTER_LABEL[motion]));
                        dropdown.setValue(readingMotion(plugin.settings.readingMotion).chapter);
                        dropdown.onChange((value) => save({ chapter: value as ChapterMotion }));
                    });
                },
            },
            {
                // What survived? (#755 FR-8): the same value as the Type panel's switch and the leaf's own.
                name: t("settings_reading_pause_name"),
                desc: t("settings_reading_pause_desc"),
                render: (setting: Setting) => {
                    setting.addToggle((toggle) => {
                        toggle.setValue(normalizeReaderPrefs(plugin.settings.readerPrefs).chapterPause);
                        toggle.onChange(async (value) => {
                            plugin.settings.readerPrefs = { ...normalizeReaderPrefs(plugin.settings.readerPrefs), chapterPause: value };
                            await plugin.saveSettings();
                        });
                    });
                },
            },
            {
                // Covers | Spines (#819 FR-8): the same value as the switch in the Library's bar.
                name: t("settings_reading_book_view_name"),
                desc: t("settings_reading_book_view_desc"),
                render: (setting: Setting) => {
                    setting.addDropdown((dropdown) => {
                        dropdown.addOption("covers", t("shelf_view_covers"));
                        dropdown.addOption("spines", t("shelf_view_spines"));
                        dropdown.setValue(plugin.settings.libraryBookView === "spines" ? "spines" : "covers");
                        dropdown.onChange(async (value) => {
                            plugin.settings.libraryBookView = value === "spines" ? "spines" : "covers";
                            await plugin.saveSettings();
                            bookViewChanged();
                        });
                    });
                },
            },
            {
                name: t("settings_reading_book_notes_name"),
                desc: t("settings_reading_book_notes_desc"),
                render: (setting: Setting) => {
                    // Room for a whole path, like the thinking space; the class is the grid's way here.
                    setting.settingEl.addClass(c("settings-folder-wide"), c("settings-book-notes-row"));
                    const commit = addFolderField(setting, {
                        read: () => plugin.settings.bookNotesFolder ?? BOOK_NOTES_DEFAULT,
                        accept: (value) => {
                            plugin.settings.bookNotesFolder = value || BOOK_NOTES_DEFAULT;
                            return true;
                        },
                        saved: async () => {
                            await plugin.saveSettings();
                            bookNotesChanged();
                        },
                        placeholder: BOOK_NOTES_DEFAULT,
                        check: clash("bookNotes"),
                    });
                    setting.addExtraButton((button) =>
                        button
                            .setIcon("rotate-ccw")
                            .setTooltip(t("reset_to_default"))
                            .onClick(() => commit(BOOK_NOTES_DEFAULT))
                    );
                },
            },
            {
                name: t("settings_reading_articles_name"),
                desc: t("settings_reading_articles_desc"),
                render: (setting: Setting) => {
                    setting.settingEl.addClass(c("settings-folder-wide"), c("settings-articles-row"));
                    const commit = addFolderField(setting, {
                        read: () => plugin.settings.articlesFolder ?? ARTICLES_FOLDER_DEFAULT,
                        // Empty is a choice here: no articles on the shelf.
                        accept: (value) => {
                            plugin.settings.articlesFolder = value.replace(/^\/+|\/+$/g, "");
                            return true;
                        },
                        saved: async () => {
                            await plugin.saveSettings();
                            articlesChanged();
                        },
                        placeholder: ARTICLES_FOLDER_DEFAULT,
                        check: clash("articles"),
                    });
                    setting.addExtraButton((button) =>
                        button
                            .setIcon("rotate-ccw")
                            .setTooltip(t("reset_to_default"))
                            .onClick(() => commit(ARTICLES_FOLDER_DEFAULT))
                    );
                },
            },
            {
                // The archive (#865 FR-1–FR-5): its own folder, never one of the others nor around one.
                name: t("settings_reading_archive_name"),
                desc: t("settings_reading_archive_desc"),
                render: (setting: Setting) => {
                    setting.settingEl.addClass(c("settings-folder-wide"), c("settings-archive-row"));
                    const offer = rowContainer(setting, "settings-archive-offer");
                    const read = () => archiveFolderOf(plugin.settings.libraryArchiveFolder);
                    let left: { old: string; items: ShelfItem[] } | null = null;
                    const commit = addFolderField(setting, {
                        read,
                        accept: (value) => {
                            const old = read();
                            left = { old, items: archiveDeps.archivedIn(old) };
                            plugin.settings.libraryArchiveFolder = articlesFolder(value);
                            return true;
                        },
                        saved: async () => {
                            await plugin.saveSettings();
                            archiveChanged();
                            if (left) drawArchiveOffer(offer, left.old, read(), left.items, archiveDeps);
                        },
                        placeholder: ARCHIVE_DEFAULT,
                        check: clash("archive"),
                        hint: (value) => (articlesFolder(value) ? null : t("settings_reading_archive_off")),
                    });
                    setting.addExtraButton((button) =>
                        button
                            .setIcon("rotate-ccw")
                            .setTooltip(t("reset_to_default"))
                            .onClick(() => commit(ARCHIVE_DEFAULT))
                    );
                },
            },
        ],
    };
}

/** The shelf, as Settings reads it: the files by name, and each one's small `.ifo`. */
export interface SettingsShelf {
    list(folder: string): DictionaryFiles[];
    info(set: DictionaryFiles, saved?: { from?: string; to?: string }): Promise<DictionaryInfo>;
    forget(): void;
}

export interface DictionariesGroupDeps {
    shelf?: SettingsShelf;
    /** Obsidian's language, for the languages' names and *Translate into*'s default. */
    ui?: () => string;
    /** The folder changed: the *Folders ZettelFlow uses* grid shows the new one. */
    onFolder?: () => void;
}

/**
 * **Look up and Translate** (#766 FR-2, FR-3, FR-9, epic #741), under Reading: the folder your StarDict
 * dictionaries are in, what was found there and its languages, and the language *Translate* uses.
 * Nothing here writes into that folder: a dictionary's languages, when it declares none, are kept in
 * the plugin's settings.
 */
export function dictionariesSettingsGroup(plugin: Pick<ZettelFlow, "settings" | "saveSettings">, deps: DictionariesGroupDeps = {}): SettingDefinitionItem {
    const shelf = (): SettingsShelf => deps.shelf ?? DictionaryShelf.getInstance();
    const ui = deps.ui ?? (() => getLanguage());
    const read = () => dictionarySettings(plugin.settings.dictionaries);
    const save = async (change: Partial<DictionarySettings>) => {
        plugin.settings.dictionaries = { ...read(), ...change };
        await plugin.saveSettings();
    };
    let redrawFound: (() => void) | null = null;
    const said = (languages: DictionaryInfo["languages"]) =>
        languages ? [languages.from, languages.to].filter((tag): tag is string => Boolean(tag)).map((tag) => languageName(tag, ui())).join(" → ") : "";

    /** Two fields for a dictionary that declares no languages (FR-3), set once, kept in the settings. */
    const languageFields = (row: HTMLElement, line: HTMLElement, set: DictionaryFiles) => {
        const fields = row.createDiv({ cls: c("settings-dictionary-fields") });
        const saved = read().languages[set.base];
        const field = (key: "from" | "to") => {
            const label = t(key === "from" ? "settings_reading_dictionary_from" : "settings_reading_dictionary_to");
            const input = fields.createEl("input", { attr: { type: "text", placeholder: label, "aria-label": label, spellcheck: "false" } });
            input.value = saved?.[key] ?? "";
            return input;
        };
        const from = field("from");
        const to = field("to");
        const commit = async () => {
            const values = { from: from.value.trim(), to: to.value.trim() };
            const languages = { ...read().languages };
            if (!values.from || !validLanguage(values.from)) delete languages[set.base];
            else languages[set.base] = { from: values.from, ...(values.to && validLanguage(values.to) ? { to: values.to } : {}) };
            await save({ languages });
            // Folded on its *from* language the next time it opens.
            shelf().forget();
            line.setText(languages[set.base] ? said(languages[set.base]) : t("settings_reading_dictionary_set"));
        };
        for (const input of [from, to]) {
            input.addEventListener("blur", () => void commit());
            input.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.key === "Enter" && !event.isComposing) void commit();
            });
        }
    };

    const drawFound = (list: HTMLElement) => {
        list.empty();
        let sets: DictionaryFiles[] = [];
        try {
            sets = shelf().list(read().folder);
        } catch {
            sets = [];
        }
        if (sets.length === 0) {
            list.createDiv({ cls: c("settings-dictionary-line"), text: t("settings_reading_dictionaries_none") });
            return;
        }
        for (const set of sets) {
            const row = list.createDiv({ cls: c("settings-dictionary") });
            const name = row.createDiv({ cls: c("settings-dictionary-name"), text: set.base.split("/").pop() ?? set.base });
            const line = row.createDiv({ cls: c("settings-dictionary-line") });
            if (set.missing) {
                // Listed, with why, and never used (FR-3).
                line.setText(t("settings_reading_dictionary_missing", set.missing));
                row.addClass(c("settings-dictionary--unused"));
                continue;
            }
            void shelf()
                .info(set, read().languages[set.base])
                .then((info) => {
                    name.setText(info.name);
                    if (info.reason || !info.ifo) {
                        line.setText(t("settings_reading_dictionary_bad_ifo"));
                        row.addClass(c("settings-dictionary--unused"));
                        return;
                    }
                    if (info.ifo.lang) {
                        line.setText(said(info.languages));
                        return;
                    }
                    line.setText(info.languages ? said(info.languages) : t("settings_reading_dictionary_set"));
                    languageFields(row, line, set);
                });
        }
    };

    return {
        type: "group",
        items: [
            {
                name: t("settings_reading_dictionaries_name"),
                desc: t("settings_reading_dictionaries_desc"),
                render: (setting: Setting) => {
                    setting.settingEl.addClass(c("settings-dictionaries-folder"));
                    const commit = addFolderField(setting, {
                        read: () => read().folder,
                        accept: (value) => {
                            plugin.settings.dictionaries = { ...read(), folder: value };
                            return true;
                        },
                        saved: async () => {
                            await plugin.saveSettings();
                            shelf().forget();
                            redrawFound?.();
                            deps.onFolder?.();
                        },
                        placeholder: DEFAULT_DICTIONARIES_FOLDER,
                        check: (value) => folderClashText(plugin.settings, "dictionaries", value),
                    });
                    setting.addExtraButton((button) =>
                        button
                            .setIcon("rotate-ccw")
                            .setTooltip(t("reset_to_default"))
                            .onClick(() => commit(DEFAULT_DICTIONARIES_FOLDER))
                    );
                },
            },
            {
                name: t("settings_reading_dictionaries_found"),
                render: (setting: Setting) => {
                    setting.settingEl.addClass(c("settings-dictionaries-found-row"));
                    const list = rowContainer(setting, "settings-dictionaries-found");
                    redrawFound = () => drawFound(list);
                    drawFound(list);
                },
            },
            {
                name: t("settings_reading_translate_name"),
                desc: t("settings_reading_translate_desc"),
                render: (setting: Setting) => {
                    setting.addDropdown((dropdown) => {
                        dropdown.addOption("", t("settings_reading_translate_obsidian"));
                        for (const tag of translateChoices(ui())) dropdown.addOption(tag, languageName(tag, ui()));
                        dropdown.setValue(read().translateInto);
                        dropdown.onChange((value) => save({ translateInto: value }));
                    });
                },
            },
        ],
    };
}
