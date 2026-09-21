import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const WRITER = read("src/architecture/plugin/notes/writeMapOfContent.ts");
const DOOR = read("src/architecture/plugin/explore/createMapOfContent.ts");
const PURE = read("src/application/explore/mapOfContent.ts");
const RENDERER = read("src/architecture/components/core/askGraph/AskGraphRenderer.ts");
const MODAL = read("src/architecture/components/core/askGraph/MapOfContentModal.ts");
const MOC_MODAL = read("src/zettelkasten/modals/MocBuilderModal.ts");

/**
 * **One map of content** (#505, epic #504), and taking a selection somewhere safely (#486).
 *
 * There were two writers. `MocBuilderModal` has always written into a **machine-managed region**,
 * so running a map again updates that block and leaves your prose alone. #486 added a second
 * that wrote a fresh numbered note and could not be re-run — having declared re-running out of
 * scope **without checking that a re-runnable map already existed three folders away**.
 *
 * The door #486 added was the better one; the implementation was the weaker one. So the door
 * stays and the implementation is gone, and the rule that keeps it that way is here.
 */

/** Comments stripped, line-based — a rule about what the code does is judged on code. */
function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sources(full));
        else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
    }
    return out;
}

describe("one map of content (#505)", () => {
    it("has exactly one module that renders a map's body", () => {
        const rendering = sources(SRC)
            .map((path) => ({ rel: path.slice(SRC.length + 1).replace(/\\/g, "/"), code: code(readFileSync(path, "utf8")) }))
            .filter((file) => /renderMocRegion\(|MOC_REGION_START/.test(file.code))
            .map((file) => file.rel);
        expect(rendering.sort()).toEqual(["application/notes/mocMerge.ts"]);
    });

    it("has exactly one module that writes one", () => {
        const writing = sources(SRC)
            .map((path) => ({ rel: path.slice(SRC.length + 1).replace(/\\/g, "/"), code: code(readFileSync(path, "utf8")) }))
            .filter((file) => file.code.includes("mergeMocRegion("))
            .map((file) => file.rel);
        expect(writing.sort()).toEqual([
            "application/notes/mocMerge.ts",
            "architecture/plugin/notes/writeMapOfContent.ts",
        ]);
    });

    it("and both doors come through it", () => {
        expect(code(DOOR)).toContain("writeMapOfContent(");
        expect(code(MOC_MODAL)).toContain("writeMapOfContent(");
    });

    it("the selection module chooses members and renders nothing", () => {
        expect(code(PURE)).toContain("export function mapMembers");
        expect(code(PURE)).not.toContain("planMapOfContent");
        // Scoped to `mapMembers`: `asLinks` legitimately renders wikilinks, for the clipboard.
        const body = code(PURE).slice(code(PURE).indexOf("export function mapMembers"));
        const members = body.slice(0, body.indexOf("\n}"));
        expect(members).not.toContain("[[");
        expect(members).not.toContain("---");
    });
});

describe("the write is recorded, and never destructive (#486, #505)", () => {
    it("goes through FileService inside a write batch, never the vault directly", () => {
        expect(code(WRITER)).toContain("withWriteBatch(");
        expect(code(WRITER)).toContain("FileService.createFile(");
        expect(code(WRITER)).toContain("FileService.modify(");
        expect(code(WRITER)).not.toMatch(/vault\.(create|modify|delete|trash)\b/);
    });

    it("names an origin, so Recent can say what wrote the note", () => {
        expect(code(WRITER)).toContain('kind: "manual"');
        expect(code(DOOR)).toContain('"explore-map"');
        expect(code(MOC_MODAL)).toContain('"moc-builder"');
    });

    it("updates rather than overwrites — the managed region is the whole point", () => {
        // A map that cannot be re-run is a map you abandon the first time the selection changes.
        expect(code(WRITER)).toContain("mergeMocRegion(content,");
        expect(code(WRITER)).not.toContain("uniqueName");
    });

    it("never throws: a failed map must not take the surface down with it", () => {
        expect(code(WRITER)).toContain("catch (error)");
        expect(code(WRITER)).toContain("return undefined;");
    });
});

describe("the clipboard is only touched on purpose (#486)", () => {
    it("writes to it inside the copy handler and nowhere else", () => {
        const uses = RENDERER.match(/navigator\.clipboard/g) ?? [];
        expect(uses).toHaveLength(1);
        expect(RENDERER).toMatch(/explore_copy_links[\s\S]{0,200}navigator\.clipboard\.writeText/);
    });
});

describe("the map stays mechanical (#486)", () => {
    it("writes no conclusion: nothing in the path holds one", () => {
        // §XII: a gathered list needs no accept/reject gate. A "what these have in common"
        // section would, and this is the test that notices it arriving.
        for (const word of ["summary", "summarise", "summarize", "insight", "conclusion", "theme"]) {
            for (const [name, source] of [["pure", PURE], ["writer", WRITER]] as const) {
                expect({ word, name, present: code(source).toLowerCase().includes(word) }).toEqual({
                    word,
                    name,
                    present: false,
                });
            }
        }
    });

    it("reaches no AI and no network, from any side", () => {
        for (const source of [PURE, WRITER, DOOR, MODAL]) {
            expect(source).not.toMatch(/\bfetch\(|requestUrl|ZfAi|openai|anthropic/i);
        }
    });

    it("offers no map of everything — the action needs a selection", () => {
        expect(RENDERER).toMatch(/if \(this\.terms\.length === 0\) return;/);
    });
});
