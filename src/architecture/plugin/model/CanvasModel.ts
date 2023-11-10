import { TFile } from "obsidian";

export type ZettelNodeType = "text" | "file" | "link" | "group";
export type ZettelNode = {
    id: string;
    type: ZettelNodeType
    tooltip?: string;
    color?: string;
    children?: ZettelNode[];
    // EXCLUSIVE TO FILE
    file?: TFile;
    // EXCLUSIVE TO TEXT
    text?: string;
}
