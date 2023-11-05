import { TFile } from "obsidian";

export type ZettelNode = {
    id: string;
    tooltip?: string;
    file?: TFile;
    color?: string;
    children?: ZettelNode[];
}

export type ZettelNodeSource = {
    file: TFile;
    color: string;
    children: ZettelNode[];
} & ZettelNode
