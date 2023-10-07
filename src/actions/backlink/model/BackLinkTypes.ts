import { FinalElement } from "notes";
import { HeadingCache } from "obsidian";

export type BacklinkElement = {
    hasDefault: boolean,
    insertPattern: string,
    defaultFile?: string,
    defaultHeading?: HeadingCache,
} & FinalElement;