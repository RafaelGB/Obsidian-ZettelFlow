import { ObsidianApi } from "architecture";
import { TFile } from "obsidian";

class FileServiceManager {
    private static instance: FileServiceManager;

    public async createFile(path: string, content: string, openAfter = true): Promise<TFile> {
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

    public static getInstance(): FileServiceManager {
        if (!FileServiceManager.instance) {
            FileServiceManager.instance = new FileServiceManager();
        }
        return FileServiceManager.instance;
    }
}

export const FileService = FileServiceManager.getInstance();

