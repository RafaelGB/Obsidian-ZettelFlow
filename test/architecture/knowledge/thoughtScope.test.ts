import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { __setMockObsidianApi } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { scopeExcludedPaths } from "architecture/knowledge/scope/knowledgeScope";
import { classifyHealth } from "architecture/knowledge/state/classifyHealth";
import { computeKnowledgeDebt } from "architecture/knowledge/debt/knowledgeDebt";
import { findDiscoveries } from "architecture/knowledge/discovery/discoveries";
import { TFile } from "obsidian";

const SRC = join(__dirname, "..", "..", "..", "src");
const LAB = "_ZettelFlow/lab";

function file(path: string): TFile {
    const made = new TFile();
    made.path = path;
    made.basename = (path.split("/").pop() ?? path).replace(/\.md$/, "");
    made.extension = "md";
    (made as unknown as { stat: { ctime: number; mtime: number; size: number } }).stat = {
        ctime: 1,
        mtime: 1,
        size: 10,
    };
    return made;
}

/** A vault where half the notes are real and half are thoughts. */
function wire(): void {
    const files = [
        file("Notes/real one.md"),
        file("Notes/real two.md"),
        file(`${LAB}/1700-aaa.md`),
        file(`${LAB}/1701-bbb.md`),
        file(`${LAB}/deep/1702-ccc.md`),
    ];
    __setMockObsidianApi({
        vault: { getMarkdownFiles: () => files, on: jest.fn(() => ({})) } as never,
        metadataCache: {
            getFileCache: () => ({ frontmatter: {}, tags: [] }),
            resolvedLinks: {},
            on: jest.fn(() => ({})),
        } as never,
    });
}

/**
 * The Lab is not knowledge, by construction (#466).
 *
 * This does not check a setting — it builds a real model over a vault whose Lab is full and
 * demands zero. The distinction matters: the `useSettingsHost` load-order trap (#374) once made
 * `excludedPaths` silently return `[]`, and every exclusion a no-op, while the settings object
 * looked perfectly correct.
 */
describe("the Lab is not knowledge (#466)", () => {
    const index = KnowledgeIndex.getInstance();

    function buildWithLab(): void {
        wire();
        index.useSettingsHost({ settings: { excludedPaths: [], thoughtLabPath: LAB } as never });
        index.build();
    }

    it("reaches the one place that decides what is not knowledge", () => {
        // Not a second list: the same array that already carries ZettelFlow's own folders.
        expect(scopeExcludedPaths({ thoughtLabPath: LAB })).toContain(LAB);
    });

    it("keeps every thought out of the model, including in sub-folders", () => {
        buildWithLab();
        const paths = index.getModel().all().map((idea) => idea.path);
        expect(paths).toEqual(["Notes/real one.md", "Notes/real two.md"]);
        expect(paths.some((path) => path.startsWith(LAB))).toBe(false);
    });

    it("keeps them out of Health, debt and Discovery", () => {
        buildWithLab();
        const model = index.getModel();
        const health = classifyHealth(model);
        const mentioned = [
            ...health.orphans.map((note) => note.path),
            ...health.deadEnds.map((note) => note.path),
            ...computeKnowledgeDebt(model).categories.flatMap((category) => category.paths),
            ...findDiscoveries(model).flatMap((discovery) => [discovery.a, discovery.b]),
        ];
        expect(mentioned.filter((path) => path.startsWith(LAB))).toEqual([]);
    });

    it("counts a thought as out of scope even before the model is built", () => {
        buildWithLab();
        expect(index.inScope(`${LAB}/1700-aaa.md`)).toBe(false);
        expect(index.inScope("Notes/real one.md")).toBe(true);
    });

    it("has the Lab folder in the same system array as the rest, not in a branch of its own", () => {
        const scope = readFileSync(join(SRC, "architecture", "knowledge", "scope", "knowledgeScope.ts"), "utf8");
        const system = /const system = \[([\s\S]*?)\];/.exec(scope)?.[1] ?? "";
        expect(system).toContain("thoughtLabPath");
    });
});
