import { t } from "architecture/lang";
import { ARTICLES_DEFAULT, articlesFolder } from "application/library/article";
import { archiveFolderOf, folderClash, type LibraryFolder } from "application/library/archive";
import { dictionarySettings } from "application/library/dictionarySettings";

/**
 * **The Library's folders, each its own** (#865 FR-3, FR-4): the book notes, the articles, the
 * dictionaries and the archive, as the settings hold them — and, for a value typed into one of them,
 * the sentence that says which other it collides with. One rule for every field that edits one:
 * Settings → Reading and the Library's own articles editor alike.
 */
export interface LibraryFolderSettings {
    bookNotesFolder?: string;
    articlesFolder?: string;
    dictionaries?: unknown;
    libraryArchiveFolder?: string;
}

const BOOK_NOTES_DEFAULT = "Library";

export function libraryFolders(settings: LibraryFolderSettings | undefined): Record<LibraryFolder, string> {
    const articles = settings?.articlesFolder;
    return {
        bookNotes: articlesFolder(settings?.bookNotesFolder || BOOK_NOTES_DEFAULT),
        articles: articlesFolder(articles === undefined ? ARTICLES_DEFAULT : articles),
        dictionaries: dictionarySettings(settings?.dictionaries).folder,
        archive: archiveFolderOf(settings?.libraryArchiveFolder),
    };
}

const FOLDER_NAME: Record<LibraryFolder, Parameters<typeof t>[0]> = {
    bookNotes: "folder_name_book_notes",
    articles: "folder_name_articles",
    dictionaries: "folder_name_dictionaries",
    archive: "folder_name_archive",
};

/** Why `value` cannot be `self`'s folder, or `null` when it can. */
export function folderClashText(settings: LibraryFolderSettings | undefined, self: LibraryFolder, value: string): string | null {
    const others: Partial<Record<LibraryFolder, string>> = { ...libraryFolders(settings) };
    delete others[self];
    const clash = folderClash(value, others);
    if (!clash) return null;
    const name = t(FOLDER_NAME[clash.with]);
    const folder = others[clash.with] ?? "";
    if (clash.how === "is") return t("folder_clash_is", name);
    return t(clash.how === "inside" ? "folder_clash_inside" : "folder_clash_holds", name, folder);
}
