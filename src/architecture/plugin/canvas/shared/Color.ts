import { RGB2String, hex2RGB } from "architecture/styles/helper";
import { HexString } from "obsidian";

export function getCanvasColor(color: HexString | undefined) {
    return !color
        ? "var(--embed-background)"
        : color.length === 1
            ? `var(--canvas-color-${color})`
            : RGB2String(hex2RGB(color.substring(1))
            )
}