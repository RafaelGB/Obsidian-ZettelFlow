import { TFile } from "obsidian";

export type ZettelNode = {
    id: string;
    type: "text" | "file" | "link" | "group"
    tooltip?: string;
    color?: string;
    children?: ZettelNode[];
    // EXCLUSIVE TO FILE
    file?: TFile;
    // EXCLUSIVE TO TEXT
    text?: string;
}
