import { HexString, RGB } from "obsidian";

export const CSS_PREFIX = 'zettelkasten-flow';

export function c(...classes: string[]): string {
    const wrappedClasses: string[] = [];
    classes.forEach((cls) => {
        wrappedClasses.push(`${CSS_PREFIX}__${cls}`);
    });
    return wrappedClasses.join(' ');
}

export function hex2RGB(color: HexString): RGB {
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    return { r, g, b }
}

export function RGB2String(rgb: RGB): string {
    return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}