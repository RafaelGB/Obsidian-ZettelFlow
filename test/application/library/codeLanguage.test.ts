import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { CODE_LANGUAGES, codeLanguageName, codeLanguageOf, codeLanguageOfClass } from "application/library/codeLanguage";

const FIXTURE = join(__dirname, "..", "..", "fixtures", "prismLanguages.json");

/** The one fact about a listing a book may keep: the language, from a closed list (#824 FR-1, AC-2). */
describe("the languages a book's code is coloured in (#824)", () => {
    it("knows what books call a language", () => {
        const cases: [string, string][] = [
            ["python", "python"],
            ["py", "python"],
            ["js", "javascript"],
            ["sh", "bash"],
            ["zsh", "bash"],
            ["c++", "cpp"],
            ["c#", "csharp"],
            ["golang", "go"],
            ["yml", "yaml"],
            ["Python", "python"],
        ];
        for (const [raw, id] of cases) expect({ raw, id: codeLanguageOf(raw) }).toEqual({ raw, id });
    });

    it("names no language for anything that is not a plain name on the list", () => {
        for (const raw of ["", "language-", "x".repeat(200), "x<script>", "py thon", "brainfuck", "javascript:alert(1)", null, undefined]) {
            expect({ raw, id: codeLanguageOf(raw) }).toEqual({ raw, id: null });
        }
    });

    it("reads a language out of a class list", () => {
        expect(codeLanguageOfClass("language-python")).toBe("python");
        expect(codeLanguageOfClass("highlight highlight-py")).toBe("python");
        expect(codeLanguageOfClass("lang-rs numbered")).toBe("rust");
        expect(codeLanguageOfClass("programlisting")).toBeNull();
    });

    it("gives each language the name a reader knows it by", () => {
        for (const id of CODE_LANGUAGES) expect(codeLanguageName(id).length).toBeGreaterThan(0);
        expect(codeLanguageName("cpp")).toBe("C++");
    });

    it("lists only grammars the Prism Obsidian ships knows — the same colours as a note's code", () => {
        // Taken from the app's own Prism (Obsidian 1.14.4) over CDP: `Object.keys(Prism.languages)`.
        expect(existsSync(FIXTURE)).toBe(true);
        const shipped = new Set<string>(JSON.parse(readFileSync(FIXTURE, "utf8")).languages);
        for (const id of CODE_LANGUAGES) expect({ id, shipped: shipped.has(id) }).toEqual({ id, shipped: true });
    });
});

describe("no language hides on every object (#824 review)", () => {
    it("knows only its own names", () => {
        for (const raw of ["constructor", "toString", "__proto__", "hasownproperty"]) expect({ raw, id: codeLanguageOf(raw) }).toEqual({ raw, id: null });
    });
});
