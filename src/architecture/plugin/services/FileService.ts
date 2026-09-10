import { log, ObsidianApi } from "architecture";
import { DataWriteOptions, TAbstractFile, TFile, TFolder, Vault, normalizePath } from "obsidian";
import { safeInquiryPath } from 'architecture/knowledge/inquiry/inquiryState';
export type CreateFileVault = Pick<Vault, 'getAbstractFileByPath' | 'read' | 'create'>;
export interface CreateFileOperation { path: string; content: string }
export interface CreateFileResult { status: 'created' | 'already-created' | 'conflict' | 'failed'; path: string }
export const FILE_EXTENSIONS = Object.freeze({
    BASIC: ["md", "canvas"],
    ONLY_CANVAS: ["canvas"],
    ONLY_MD: ["md"],
});

export class FileService {
    /** Shared batch write for the existing gallery path. Preflight is not a lock or a transaction. */
    public static async createFilesOnce(vault: CreateFileVault & Pick<Vault, 'createFolder'>, files: readonly CreateFileOperation[]): Promise<'complete' | 'conflict' | 'partial'> {
        try {
            const seen = new Set<string>();
            for (const file of files) {
                if (!safeInquiryPath(file.path) || seen.has(file.path)) return 'conflict';
                seen.add(file.path);
                const existing = vault.getAbstractFileByPath(file.path);
                if (existing && (!(existing instanceof TFile) || await vault.read(existing) !== file.content)) return 'conflict';
                const parts = file.path.split('/').slice(0, -1);
                for (let i = 1; i <= parts.length; i++) {
                    const parent = vault.getAbstractFileByPath(parts.slice(0, i).join('/'));
                    if (parent && !(parent instanceof TFolder)) return 'conflict';
                }
            }
            for (const file of files) {
                const parts = file.path.split('/').slice(0, -1);
                for (let i = 1; i <= parts.length; i++) {
                    const folder = parts.slice(0, i).join('/');
                    if (!vault.getAbstractFileByPath(folder)) {
                        try { await vault.createFolder(folder); } catch { if (!(vault.getAbstractFileByPath(folder) instanceof TFolder)) return 'partial'; }
                    }
                }
                const written = await this.createFileOnce(vault, file);
                if (written.status === 'conflict' || written.status === 'failed') return 'partial';
            }
            return 'complete';
        } catch { return 'partial'; }
    }
    /** Create-only canonical boundary: exact retry is safe, any differing user prose is a conflict. */
    public static async createFileOnce(vault: CreateFileVault, operation: CreateFileOperation, allowed: (path: string) => boolean = () => true): Promise<CreateFileResult> {
        const { path, content } = operation;
        const result = (status: CreateFileResult['status']): CreateFileResult => ({ status, path });
        if (!safeInquiryPath(path) || path.split('/').some(part => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || !allowed(path)) return result('failed');
        const reconcile = async (): Promise<CreateFileResult> => {
            if (!allowed(path)) return result('failed');
            const existing = vault.getAbstractFileByPath(path);
            if (!(existing instanceof TFile)) return result(existing ? 'conflict' : 'failed');
            const actual = await vault.read(existing);
            if (!allowed(path)) return result('failed');
            return result(actual === content ? 'already-created' : 'conflict');
        };
        try {
            if (vault.getAbstractFileByPath(path)) return await reconcile();
            const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
            if (parent && !(vault.getAbstractFileByPath(parent) instanceof TFolder)) return result('failed');
            if (!allowed(path)) return result('failed');
            try { await vault.create(path, content); }
            catch { return await reconcile(); }
            if (!allowed(path)) return result('failed');
            return result('created');
        } catch { return result('failed'); }
    }
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

    /**
     * Write a file, creating the parent folder if needed and overwriting when it already exists
     * (idempotent). Uses the metadata-cache-backed `getAbstractFileByPath`/`getFileByPath` (never the
     * Adapter API), then optionally opens it.
     */
    public static async writeFile(path: string, content: string, openAfter = true): Promise<TFile> {
        const folder = path.substring(0, path.lastIndexOf(FileService.PATH_SEPARATOR));
        if (folder && !ObsidianApi.vault().getAbstractFileByPath(folder)) {
            await ObsidianApi.vault().createFolder(folder);
        }
        const existing = ObsidianApi.vault().getFileByPath(path);
        let file: TFile;
        if (existing instanceof TFile) {
            await ObsidianApi.vault().modify(existing, content);
            file = existing;
        } else {
            file = await ObsidianApi.vault().create(path, content);
        }
        if (openAfter) {
            await FileService.openFile(path);
        }
        return file;
    }

    /**
     * Write a **binary** file (e.g. an exported PNG/WebM, #386), creating the parent folder if needed
     * and overwriting when it already exists. Uses the metadata-cache-backed `getAbstractFileByPath`
     * (never the Adapter API), then `createBinary`/`modifyBinary`.
     */
    public static async writeBinaryFile(path: string, data: ArrayBuffer): Promise<TFile> {
        const folder = path.substring(0, path.lastIndexOf(FileService.PATH_SEPARATOR));
        if (folder && !ObsidianApi.vault().getAbstractFileByPath(folder)) {
            await ObsidianApi.vault().createFolder(folder);
        }
        const existing = ObsidianApi.vault().getFileByPath(path);
        if (existing instanceof TFile) {
            await ObsidianApi.vault().modifyBinary(existing, data);
            return existing;
        }
        return await ObsidianApi.vault().createBinary(path, data);
    }

    public static async deleteFile(file: TFile): Promise<void> {
        await ObsidianApi.fileManager().trashFile(file);
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

    public static async modify(file: TFile, content: string, options?: DataWriteOptions): Promise<void> {
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
        fileExtensions: string[] = FILE_EXTENSIONS.BASIC,
        allowRecursive = true
    ): Array<TFile> {
        let folder: TFolder;
        try {
            folder = FileService.getFolder(folder_str);
        } catch (err) {
            log.warn("Folder not found, trying to get parent folder", err);
            // Split the string into '/' and remove the last element
            folder = FileService.getFolder(folder_str.split(FileService.PATH_SEPARATOR).slice(0, -1).join(FileService.PATH_SEPARATOR));
        }
        let files: Array<TFile> = [];
        Vault.recurseChildren(folder, (file: TAbstractFile) => {

            if (!(file instanceof TFile)) {
                return;
            }
            const fileParent = file.parent;
            if (fileParent !== null && !allowRecursive && fileParent.path !== folder.path) {
                return;
            }
            files.push(file);
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

