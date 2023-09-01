import { ObsidianApi } from "architecture";
import { TAbstractFile, TFile, TFolder, Vault, normalizePath } from "obsidian";
export const FILE_EXTENSIONS = Object.freeze({
    BASIC: ["md", "canvas"],
    ONLY_CANVAS: ["canvas"],
});

export class FileService {
    public static PATH_SEPARATOR = "/";
    public static MARKDOWN_EXTENSION = ".md";
    public static async createFile(path: string, content: string, openAfter = true): Promise<TFile> {
        const folder = path.substring(0, path.lastIndexOf("/"));
        if (!await ObsidianApi.vault().adapter.exists(folder)) {
            await ObsidianApi.vault().createFolder(folder);
        }

        const file = await ObsidianApi.vault().create(path, content);
        if (openAfter) {
            await FileService.openFile(path);
        }
        return file;
    }

    public static async openFile(path: string): Promise<void> {
        await ObsidianApi.workspace().openLinkText(path, "");
    }

    public static async getFile(file_str: string, restrict = true): Promise<TFile | null> {
        file_str = normalizePath(file_str);

        const file = ObsidianApi.vault().getAbstractFileByPath(file_str);
        if (!file && restrict) {
            throw new Error(`File "${file_str}" doesn't exist`);
        }

        if (!(file instanceof TFile)) {
            if (restrict) {
                throw new Error(`${file_str} is a folder, not a file`);
            } else {
                return null;
            }
        }

        return file;
    }

    public static async getContent(file: TFile): Promise<string> {
        return await ObsidianApi.vault().read(file);
    }

    public static getFolder(folder_str: string): TFolder {
        folder_str = normalizePath(folder_str);

        let folder = ObsidianApi.vault().getAbstractFileByPath(folder_str);
        if (!folder) {
            folder = FileService.getFolder(folder_str.split("/").slice(0, -1).join("/"));
        }
        if (!(folder instanceof TFolder)) {
            throw new Error(`${folder_str} is a file, not a folder`);
        }
        return folder;
    }

    public static getTfilesFromFolder(
        folder_str: string,
        fileExtensions: string[] = FILE_EXTENSIONS.BASIC
    ): Array<TFile> {
        let folder;
        try {
            folder = FileService.getFolder(folder_str);
        } catch (err) {
            // Split the string into '/' and remove the last element
            folder = FileService.getFolder(folder_str.split("/").slice(0, -1).join("/"));
        }
        let files: Array<TFile> = [];
        Vault.recurseChildren(folder, (file: TAbstractFile) => {
            if (file instanceof TFile) {
                files.push(file);
            }
        });

        if (fileExtensions.length > 0) {
            files = files.filter((file) => {
                return fileExtensions.includes(file.extension);
            });
        }

        files.sort((a, b) => {
            return a.basename.localeCompare(b.basename);
        });

        return files;
    }
}

