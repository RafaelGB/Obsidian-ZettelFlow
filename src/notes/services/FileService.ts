import { ObsidianApi } from "architecture";
import { TFile, normalizePath } from "obsidian";

export class FileService {

    public static async createFile(path: string, content: string, openAfter = true): Promise<TFile> {
        const folder = path.substring(0, path.lastIndexOf("/"));
        if (!await ObsidianApi.vault().adapter.exists(folder)) {
            await ObsidianApi.vault().createFolder(folder);
        }

        const file = await ObsidianApi.vault().create(path, content);
        if (openAfter) {
            await ObsidianApi.workspace().openLinkText(file.path, "");
        }
        return file;
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
}

