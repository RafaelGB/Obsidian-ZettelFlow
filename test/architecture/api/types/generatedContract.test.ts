import { describe, it, expect } from "@jest/globals";
import { readFileSync, writeFileSync, existsSync } from "fs";
import ts from "typescript";
import { join } from "path";
import type { App } from "obsidian";
import { ZfVaultImpl } from "architecture/api/lib/vault/service/ZfVault";
import { ZfKnowledge } from "architecture/api/lib/knowledge/service/ZfKnowledge";
import { ZfAi } from "architecture/api/lib/ai/service/ZfAi";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { ApiMemberDoc } from "architecture/api/lib/LibModule";
import { generateReference, GENERATED_HEADER } from "architecture/api/types/generateReference";
import { generateTypeDeclarations } from "architecture/api/types/generateTypes";
import { SCRIPT_ACTION_BINDINGS } from "architecture/api/bindings/scriptBindings";

// test/architecture/api/types → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
const REFERENCE_PAGE = join(ROOT, "docs", "api", "reference.md");

/**
 * The same manifest the runtime builds, assembled offline. `buildTools` needs a live vault; the modules
 * themselves do not, which is what makes the contract checkable in CI.
 */
async function manifest(): Promise<ApiMemberDoc[]> {
    const vault = new ZfVaultImpl({} as App);
    await vault.init();

    const knowledge = new ZfKnowledge({} as App, {
        model: () => new KnowledgeModel(),
        history: () => [],
        ready: () => true,
    });
    await knowledge.init();

    const ai = new ZfAi({} as App);
    await ai.init();

    return [...vault.describe(), ...knowledge.describe(), ...ai.describe()];
}

describe("the committed reference page is generated, not written (#352, FR-3/AC-2)", () => {
    /**
     * The hand-written reference is why `zf.dashboard()` sat in the docs as a promise for a release and
     * a half. Regenerate with `UPDATE_API_DOCS=1 npx jest generatedContract`.
     */
    it("matches the manifest exactly", async () => {
        const expected = generateReference(await manifest());

        if (process.env.UPDATE_API_DOCS) {
            writeFileSync(REFERENCE_PAGE, expected, "utf8");
        }

        expect(existsSync(REFERENCE_PAGE)).toBe(true);
        expect(readFileSync(REFERENCE_PAGE, "utf8").replace(/\r\n/g, "\n")).toBe(expected);
    });

    it("marks the page as generated, so nobody edits it by hand", () => {
        expect(readFileSync(REFERENCE_PAGE, "utf8")).toContain(GENERATED_HEADER);
    });

    it("documents every member of the live API", async () => {
        const page = readFileSync(REFERENCE_PAGE, "utf8");
        for (const member of await manifest()) {
            const name = member.path.slice(member.path.lastIndexOf(".") + 1);
            expect(`${member.path}:${page.includes(`\`${name}\``)}`).toBe(`${member.path}:true`);
        }
    });

    it("is listed in the docs navigation", () => {
        expect(readFileSync(join(ROOT, "mkdocs.yml"), "utf8")).toContain("api/reference.md");
    });
});

describe("the generated declarations describe the whole API (#352, FR-1/AC-1)", () => {
    it("declares every manifest member with its signature", async () => {
        const members = await manifest();
        const declarations = generateTypeDeclarations(members, SCRIPT_ACTION_BINDINGS, {
            userScripts: [],
            dataview: false,
            templater: false,
        });

        for (const member of members) {
            const name = member.path.slice(member.path.lastIndexOf(".") + 1);
            expect(`${member.path}:${declarations.includes(`${name}: ${member.signature};`)}`).toBe(
                `${member.path}:true`
            );
        }
    });

    it("nests the namespaces rather than flattening them", async () => {
        const declarations = generateTypeDeclarations(await manifest(), SCRIPT_ACTION_BINDINGS, {
            userScripts: [],
            dataview: false,
            templater: false,
        });

        expect(declarations).toMatch(/declare const zf: \{/);
        expect(declarations).toMatch(/\n {4}knowledge: \{/);
        expect(declarations).toMatch(/\n {4}internal: \{/);
        expect(declarations).toMatch(/\n {8}vault: \{/);
    });

    it("declares only one `internal` namespace, merging the manifest with the live scripts", async () => {
        const declarations = generateTypeDeclarations(await manifest(), SCRIPT_ACTION_BINDINGS, {
            userScripts: ["formatDate"],
            dataview: false,
            templater: false,
        });

        expect(declarations.match(/^ {4}internal: \{$/gm)).toHaveLength(1);
        expect(declarations).toContain("formatDate: (...args: any[]) => any;");
    });

    /**
     * The point of the file is what a library script cannot otherwise know: which functions *you* wrote
     * and which integrations *you* installed. That is why it is generated on demand in the vault.
     */
    it("names the user's own scripts and the installed integrations", async () => {
        const declarations = generateTypeDeclarations(await manifest(), SCRIPT_ACTION_BINDINGS, {
            userScripts: ["formatDate", "slugify"],
            dataview: true,
            templater: true,
        });

        expect(declarations).toContain("slugify:");
        expect(declarations).toContain("dv:");
        expect(declarations).toContain("tp:");
    });

    it("declares the other bindings a surface provides", async () => {
        const declarations = generateTypeDeclarations(await manifest(), SCRIPT_ACTION_BINDINGS, {
            userScripts: [],
            dataview: false,
            templater: false,
        });

        expect(declarations).toContain("declare const content: any;");
        expect(declarations).toContain("declare const note: any;");
        // `zf` is the object declared above; declaring it twice would not compile.
        expect(declarations).not.toContain("declare const zf: any;");
    });

    it("declares every internal result type it references, so the file stands alone", async () => {
        const declarations = generateTypeDeclarations(await manifest(), SCRIPT_ACTION_BINDINGS, {
            userScripts: [],
            dataview: false,
            templater: false,
        });

        const declared = new Set([...declarations.matchAll(/^type (\w+) = any;$/gm)].map((m) => m[1]));
        const referenced = [...declarations.matchAll(/=> ([A-Z]\w*)/g)].map((m) => m[1]);

        expect(referenced.filter((name) => !declared.has(name) && name !== "Promise")).toEqual([]);
    });

    /**
     * The strongest form of AC-1: the emitted file is handed to the actual TypeScript compiler. A
     * declaration that referenced a type it never declared would autocomplete fine until the user's
     * editor reported an error in a file ZettelFlow wrote for them.
     */
    it("compiles under the real compiler, in strict mode", async () => {
        const source = generateTypeDeclarations(await manifest(), SCRIPT_ACTION_BINDINGS, {
            userScripts: ["formatDate"],
            dataview: true,
            templater: true,
        });

        const fileName = "zettelflow.d.ts";
        const host = ts.createCompilerHost({});
        const original = host.getSourceFile.bind(host);
        host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
            name === fileName
                ? ts.createSourceFile(name, source, languageVersion, true, ts.ScriptKind.TS)
                : original(name, languageVersion, onError, shouldCreate);
        host.fileExists = (name) => name === fileName;
        host.readFile = (name) => (name === fileName ? source : undefined);

        const program = ts.createProgram([fileName], { strict: true, noEmit: true, skipLibCheck: true }, host);
        const problems = [
            ...program.getSyntacticDiagnostics(),
            ...program.getSemanticDiagnostics(),
        ].map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));

        expect(problems).toEqual([]);
    });
});
