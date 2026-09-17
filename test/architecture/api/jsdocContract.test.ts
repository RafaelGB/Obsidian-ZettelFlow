import { describe, it, expect } from "@jest/globals";
import {
    contractSignature,
    parseLibraryContract,
} from "architecture/api/lib/scripts/jsdocContract";

const documented = `
/**
 * Title a note after its source.
 * @param {string} title The note's current title
 * @param source - where it came from
 * @returns {string} the new title
 * @zf-surface action
 */
module.exports = (title, source) => \`\${title} — \${source}\`;
`;

describe("a library function can say what it is (#448)", () => {
    it("reads the description, the parameters, the return and the surface", () => {
        const contract = parseLibraryContract(documented);
        expect(contract.description).toBe("Title a note after its source.");
        expect(contract.params).toEqual([
            { name: "title", type: "string", description: "The note's current title" },
            { name: "source", description: "where it came from" },
        ]);
        expect(contract.returns).toBe("the new title");
        expect(contract.surface).toBe("action");
    });

    it("builds the signature a completion shows", () => {
        expect(contractSignature(parseLibraryContract(documented))).toBe(
            "(title: string, source) => unknown"
        );
    });

    it("says nothing about an undocumented module, rather than failing", () => {
        const contract = parseLibraryContract("module.exports = () => 42;");
        expect(contract).toEqual({ params: [], desktopOnly: false });
        expect(contractSignature(contract)).toBe("() => unknown");
    });

    it("degrades a malformed block to no documentation", () => {
        const contract = parseLibraryContract("/** @param */\nmodule.exports = () => 1;");
        expect(contract.params).toEqual([]);
        expect(contract.description).toBeUndefined();
    });

    it("ignores tags it does not read", () => {
        const contract = parseLibraryContract(
            "/**\n * Does a thing.\n * @author someone\n * @deprecated\n */\nmodule.exports = () => 1;"
        );
        expect(contract.description).toBe("Does a thing.");
    });

    it("takes the block that documents the export, not an earlier one", () => {
        const source = `/** A file header. */\n\n/** The real one. */\nmodule.exports = () => 1;`;
        expect(parseLibraryContract(source).description).toBe("The real one.");
    });

    it("marks a module that reaches require as desktop only", () => {
        // `window.require` does not exist on mobile, where it silently returned undefined.
        expect(parseLibraryContract('const fs = require("fs");').desktopOnly).toBe(true);
        expect(parseLibraryContract("module.exports = () => 1;").desktopOnly).toBe(false);
    });
});
