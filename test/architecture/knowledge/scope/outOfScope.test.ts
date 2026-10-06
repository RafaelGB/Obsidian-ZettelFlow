import { describe, it, expect, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { excludedPrefixOf, isPathExcluded } from "architecture/knowledge/scope/knowledgeScope";

/**
 * **A note in an excluded folder is outside ZettelFlow** (#688). One predicate decides it — the
 * index's — and every surface that takes "the note in front of you" asks that same one. The
 * prefix it names is the one that matched, so This note can say *which* folder kept the note out.
 */
describe("the excluded prefix a path falls under (#688)", () => {
    it("names the folder that matched, folder-boundary aware, exactly like the index's filter", () => {
        const prefixes = ["Templates", "_ZettelFlow/flows"];
        expect(excludedPrefixOf("Templates/Daily.md", prefixes)).toBe("Templates");
        expect(excludedPrefixOf("Templates.md", prefixes)).toBe("Templates");
        expect(excludedPrefixOf("_ZettelFlow/flows/x/Step.md", prefixes)).toBe("_ZettelFlow/flows");
        expect(excludedPrefixOf("Templates-other/x.md", prefixes)).toBeNull();
        expect(excludedPrefixOf("Notes/a.md", prefixes)).toBeNull();
    });

    it("takes raw settings values, the way the user typed them", () => {
        expect(excludedPrefixOf("Templates/Daily.md", ["/Templates/ "])).toBe("Templates");
        expect(excludedPrefixOf("Archivo/Diario.md", ["Archivo".normalize("NFD")])).toBe("Archivo");
    });

    it("is the predicate isPathExcluded is built on — they can never disagree", () => {
        const prefixes = ["Templates", "Inbox/old"];
        for (const path of ["Templates/a.md", "Inbox/old/b.md", "Inbox/new/c.md", "a.md", "Templates"]) {
            expect(isPathExcluded(path, prefixes)).toBe(excludedPrefixOf(path, prefixes) !== null);
        }
    });
});

describe("the index answers which folder keeps a note out (#688)", () => {
    const index = KnowledgeIndex.getInstance();
    afterEach(() => index.useSettingsHost(null));

    it("reads the user's folders and ZettelFlow's own, through the one settings host", () => {
        index.useSettingsHost({ settings: { excludedPaths: ["Templates"], foldersFlowsPath: "_ZettelFlow/flows" } as never });
        expect(index.excludedBy("Templates/Daily.md")).toBe("Templates");
        expect(index.excludedBy("_ZettelFlow/flows/Step.md")).toBe("_ZettelFlow/flows");
        expect(index.excludedBy("Notes/a.md")).toBeNull();
        expect(index.inScope("Templates/Daily.md")).toBe(false);
        expect(index.inScope("Notes/a.md")).toBe(true);
    });

    it("excludes nothing before settings are wired", () => {
        index.useSettingsHost(null);
        expect(index.excludedBy("Templates/Daily.md")).toBeNull();
    });
});

/** Every door that takes "this note" asks the index, so an excluded note is offered none of them. */
describe("the active-note doors refuse an excluded note (#688)", () => {
    const read = (rel: string) => readFileSync(join(__dirname, "..", "..", "..", "..", "src", rel), "utf8");

    it.each([
        ["starters/zcomponents/ReaderComponent.ts", 4],
        ["starters/zcomponents/ThinkAboutComponent.ts", 2],
        ["starters/zcomponents/RemoveRelationComponent.ts", 2],
        ["starters/zcomponents/DeriveProjectComponent.ts", 1],
    ])("%s guards every door it opens", (file, doors) => {
        const source = read(file);
        const guards = (source.match(/inScope\(/g) ?? []).length;
        expect(guards).toBeGreaterThanOrEqual(doors);
    });

    it("the claim door and the move picker keep their own scope check", () => {
        expect(read("starters/zcomponents/ClaimDoorComponent.ts")).toContain("isPathExcluded(path, excluded)");
        expect(read("starters/zcomponents/MoveCommandsComponent.ts")).toContain("this.isKnowledge(file.path)");
    });
});
