import { SectionElement } from "zettelkasten";

export type BacklinkElement = {
    hasDefault: boolean,
    defaultFile?: string,
    defaultHeading?: string,
} & SectionElement;