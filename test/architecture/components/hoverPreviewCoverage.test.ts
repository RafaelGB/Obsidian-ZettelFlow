import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, basename } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

/**
 * One rule for every note name you can click (#594 follow-up).
 *
 * `hoverPreview` shipped on Cultivate as *the* reusable way to show Obsidian's native Page preview on
 * a `Ctrl`/`Cmd`-hover of a note name. A reusable helper used in one place is a private one — so the
 * rule is now the whole product: **anywhere you render a note name that opens the note, that same
 * name previews it.** A surface that opens a note but does not preview it is the inconsistency this
 * guards against, and a *new* one added later fails this test until it either wires the preview or
 * says, here, why it is exempt.
 */
describe("every clickable note name offers the native preview (#594)", () => {
    // A file may open a note without a hoverable name to attach the preview to. Each exemption is a
    // reason, not a pass: dropping the entry re-arms the rule for that file.
    const EXEMPT: Record<string, string> = {
        "Graph3DRenderer.ts": "a WebGL scene — a node is not a DOM element the popover can attach to",
        "LabRenderer.ts": "the thinking space names its subject note, and by design never shows it (#473)",
        "FileService.ts": "a service that opens files in code — there is no name element here",
        "SettingsTab.ts": "settings links, not a list of knowledge notes",
    };

    const opensANote = sources(SRC).filter((path) => readFileSync(path, "utf8").includes("openLinkText("));

    it("covers a surface that opens notes, or names why it is exempt", () => {
        const missing: string[] = [];
        for (const file of opensANote) {
            const name = basename(file);
            if (name in EXEMPT) continue;
            if (!readFileSync(file, "utf8").includes("hoverPreview(")) missing.push(relative(SRC, file));
        }
        expect(missing).toEqual([]);
    });

    it("keeps the exemptions honest — every one still opens a note", () => {
        // An exemption for a file that no longer opens a note is stale slack; remove it.
        const opening = new Set(opensANote.map((file) => basename(file)));
        const stale = Object.keys(EXEMPT).filter((name) => !opening.has(name));
        expect(stale).toEqual([]);
    });

    it("wires the preview through the one shared helper, never a bespoke hover-link trigger", () => {
        // The only place that may emit the raw `hover-link` event is the helper itself; a surface
        // reaching past it would drift the payload and the source id.
        const bespoke = sources(SRC)
            .filter((path) => !path.endsWith(join("core", "a11y.ts")))
            .filter((path) => readFileSync(path, "utf8").includes('trigger("hover-link"'))
            .map((path) => relative(SRC, path));
        expect(bespoke).toEqual([]);
    });
});
