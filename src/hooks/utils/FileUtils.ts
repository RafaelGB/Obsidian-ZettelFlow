import { TAbstractFile, TFile, TFolder } from "obsidian";

export function isMarkdownFile(file: TAbstractFile | null): file is TFile {
    return file instanceof TFile && file.extension === "md";
}

export function isCanvasFile(file: TAbstractFile | null): file is TFile {
    return file instanceof TFile && file.extension === "canvas";
}

export function isFolder(file: TAbstractFile): file is TFolder {
    return file instanceof TFolder;
}
