import { FinalElement } from "notes";
import { HeadingCache } from "obsidian";

export type BacklinkElement = {
    hasDefault: boolean,
    defaultFile?: string,
    defaultHeading?: HeadingCache,
} & FinalElement;