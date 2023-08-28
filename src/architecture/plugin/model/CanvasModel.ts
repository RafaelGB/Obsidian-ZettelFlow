import { TFile } from "obsidian";

export type CanvasFileTree = {
    file: TFile;
    color: string;
    children: CanvasFileTree[];
}