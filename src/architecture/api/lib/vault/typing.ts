import { TFile, TFolder } from "obsidian";

/**
 * ZettelFlow Vault API for file and folder operations
 */
export interface IZfVault {
    /**
     * Resolves a folder path to a TFolder object
     * @param path Path to the folder
     * @returns TFolder object for the specified path
     * @throws Error if the path doesn't resolve to a folder
     */
    resolveTFolder(path: string): TFolder;

    /**
     * Retrieves files from a folder with optional extension filtering
     * @param folder The folder to search in
     * @param extensions File extensions to filter by (defaults to ["md", "canvas"])
     * @returns Array of files sorted alphabetically by basename
     */
    obtainFilesFrom(folder: TFolder, extensions: string[]): Array<TFile>;
}