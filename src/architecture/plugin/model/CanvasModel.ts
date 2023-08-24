import { TFile } from "obsidian";

export type CanvasFileTree = {
    file: TFile;
    children: CanvasFileTree[];
}