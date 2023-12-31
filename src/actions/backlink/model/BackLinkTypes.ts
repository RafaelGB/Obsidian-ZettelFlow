import { FinalElement } from "application/notes";
import { HeadingCache } from "obsidian";

export type BacklinkElement = {
    hasDefault: boolean,
    insertPattern: string,
    defaultFile?: string,
    defaultHeading?: HeadingCache,
} & FinalElement;

export type BacklinkComponentResult = {
    file: string,
    heading: HeadingCache,
    regex: string
}