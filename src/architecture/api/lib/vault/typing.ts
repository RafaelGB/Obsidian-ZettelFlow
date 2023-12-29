import { TFile, TFolder } from "obsidian";

export interface IZfVault {
    resolveTFolder(path: string): TFolder;
    obtainFilesFrom(folder: TFolder, extensions: string[]): Array<TFile>;
}