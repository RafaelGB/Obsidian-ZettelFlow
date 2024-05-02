import { ObsidianApi } from "architecture";
import { DataWriteOptions, TAbstractFile, TFile, TFolder, Vault, normalizePath } from "obsidian";
export const FILE_EXTENSIONS = Object.freeze({
    BASIC: ["md", "canvas"],
    ONLY_CANVAS: ["canvas"],
    ONLY_MD: ["md"],
});

export class FileService {
    public static PATH_SEPARATOR = "/";
    public static MARKDOWN_EXTENSION = ".md";
    public static async createFile(path: string, content: string, openAfter = true): Promise<TFile> {
        const folder = path.substring(0, path.lastIndexOf(FileService.PATH_SEPARATOR));
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

    public static async deleteFile(file: TFile): Promise<void> {
        await ObsidianApi.vault().delete(file);
    }

    public static async getFile(file_str: string, restrict = true): Promise<TFile | null> {
        file_str = normalizePath(file_str);

        const file = ObsidianApi.vault().getFileByPath(file_str);
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
        return await ObsidianApi.vault().cachedRead(file);
    }

    public static async modify(file: TFile, content: string, options?: DataWriteOptions | undefined): Promise<void> {
        await ObsidianApi.vault().modify(file, content, options);
    }

    public static getFolder(folder_str: string): TFolder {
        folder_str = normalizePath(folder_str);

        let folder = ObsidianApi.vault().getAbstractFileByPath(folder_str);
        if (!folder) {
            folder = FileService.getFolder(folder_str.split(FileService.PATH_SEPARATOR).slice(0, -1).join(FileService.PATH_SEPARATOR));
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
            folder = FileService.getFolder(folder_str.split(FileService.PATH_SEPARATOR).slice(0, -1).join(FileService.PATH_SEPARATOR));
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

