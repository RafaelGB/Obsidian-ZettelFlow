import { Literal } from "architecture/plugin";
import { TFile } from "obsidian";

export type HookEvent = {
    request: {
        oldValue: string;
        newValue: string;
        property: string;
    };
    file: TFile;
    response: {
        frontmatter: Record<string, Literal>;
    }
}