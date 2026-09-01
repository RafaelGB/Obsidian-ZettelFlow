import { describe, it, expect } from "@jest/globals";
import { existsSync } from "fs";
import { join } from "path";
import {
    membersOf,
    resolvePath,
    functionSignature,
    withDocs,
} from "architecture/components/core/codeView/editor/extensions/apiCompletion/introspect";

// test/architecture/components/core → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");

/** A stand-in for a live `zf`: nested namespaces, and a user-scripts bag filled at runtime. */
const liveZf = {
    internal: {
        vault: { resolveTFolder: (path: string) => path, obtainFilesFrom: (folder: string) => [folder] },
        user: { formatDate: (date: Date) => date, slugify: (title: string) => title },
    },
    knowledge: { debt: () => ({}), neighbors: (path: string) => path },
};

class Probe {
    field = 1;
    add(content: string): string {
        return content;
    }
    get(): string {
        return "";
    }
}

describe("completions come from the live object, not a table (#351, FR-1/AC-1)", () => {
    it("lists what is actually on the object", () => {
        expect(membersOf(liveZf.internal.vault).map((m) => m.name)).toEqual([
            "obtainFilesFrom",
            "resolveTFolder",
        ]);
    });

    /**
     * The old table could not do this and said so in a comment: user scripts are resolved at runtime,
     * so a static list could only offer the namespace. Introspection lists them by name.
     */
    it("lists the user's own library scripts by name", () => {
        expect(membersOf(liveZf.internal.user).map((m) => m.name)).toEqual(["formatDate", "slugify"]);
    });

    it("walks a dotted path the way the editor does", () => {
        expect(resolvePath(liveZf, ["internal", "user"])).toBe(liveZf.internal.user);
        expect(resolvePath(liveZf, ["internal", "nope"])).toBeUndefined();
        expect(resolvePath(liveZf, ["internal", "nope", "deeper"])).toBeUndefined();
    });

    it("offers a class instance its methods, not just its fields", () => {
        expect(membersOf(new Probe()).map((m) => m.name)).toEqual(["add", "field", "get"]);
    });

    it("leaves Object.prototype out of the suggestions", () => {
        const names = membersOf(new Probe()).map((m) => m.name);
        expect(names).not.toContain("hasOwnProperty");
        expect(names).not.toContain("constructor");
    });

    it("says nothing about a value with no members", () => {
        expect(membersOf(null)).toEqual([]);
        expect(membersOf(undefined)).toEqual([]);
        expect(membersOf(42)).toEqual([]);
    });

    it("survives a property whose getter throws", () => {
        const hostile = Object.defineProperty({ safe: 1 }, "boom", {
            enumerable: true,
            get() {
                throw new Error("nope");
            },
        });

        expect(membersOf(hostile).map((m) => m.name)).toEqual(["safe"]);
    });
});

describe("signatures are recovered from the function itself (#351, FR-3)", () => {
    it("keeps the parameter names, which survive type erasure", () => {
        expect(functionSignature("add", (content: string) => content)).toBe("add(content)");
        expect(functionSignature("pair", (a: number, b: number) => a + b)).toBe("pair(a, b)");
    });

    it("handles a zero-argument method", () => {
        expect(functionSignature("get", () => "")).toBe("get()");
    });

    it("degrades to an ellipsis for a bound or native function", () => {
        const bound = function named(this: unknown) { /* probe */ }.bind(null);
        expect(functionSignature("named", bound)).toBe("named(…)");
    });

    it("is not a signature at all for a non-function", () => {
        expect(functionSignature("field", 1)).toBe("field");
    });
});

describe("the manifest supplies the prose and the real types (#351, FR-3/AC-3)", () => {
    const docs = new Map([
        ["zf.internal.vault.resolveTFolder", { signature: "(path: string) => TFolder", summary: "Resolve a folder." }],
    ]);

    it("prefers the documented signature, which is the only one that survives bind()", () => {
        const [documented] = withDocs(
            membersOf(liveZf.internal.vault).filter((m) => m.name === "resolveTFolder"),
            "zf.internal.vault",
            docs
        );

        expect(documented.signature).toBe("resolveTFolder(path: string) => TFolder");
        expect(documented.summary).toBe("Resolve a folder.");
    });

    it("leaves an undocumented member with its recovered signature and no prose", () => {
        const [plain] = withDocs(
            membersOf(liveZf.internal.vault).filter((m) => m.name === "obtainFilesFrom"),
            "zf.internal.vault",
            docs
        );

        expect(plain.signature).toBe("obtainFilesFrom(folder)");
        expect(plain.summary).toBeUndefined();
    });
});

describe("the static completion tables are gone, not supplemented (#351, AC-1)", () => {
    /** Design by subtraction: three near-identical providers replaced by one engine. */
    it.each([
        ["the zf/app table", "src/architecture/components/core/codeView/editor/extensions/autoconfiguration"],
        ["the script-action table", "src/actions/script/extensions"],
        ["the hook table", "src/config/modals/handlers/hooks/extensions"],
    ])("%s no longer exists", (_name, path) => {
        expect(existsSync(join(ROOT, path))).toBe(false);
    });
});
