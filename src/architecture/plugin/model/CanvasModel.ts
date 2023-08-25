import { HexString, TFile } from "obsidian";

export type CanvasFileTree = {
    file: TFile;
    color: HexString;
    children: CanvasFileTree[];
}