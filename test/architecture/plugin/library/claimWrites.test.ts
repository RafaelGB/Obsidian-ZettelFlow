/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest } from "@jest/globals";
import { TFile, TFolder } from "obsidian";
import { createClaimNote } from "architecture/plugin/library/claimWrites";

/** A vault of a few paths: what is there, and every create and folder it is asked for. */
function vaultWith(files: Record<string, string>, folders: string[] = []) {
    const at = (path: string) => {
        if (path in files) return Object.assign(new TFile(), { path });
        if (folders.includes(path)) return Object.assign(new TFolder(), { path });
        return null;
    };
    const vault = {
        getAbstractFileByPath: jest.fn(at),
        read: jest.fn(async (file: any) => files[file.path]),
        create: jest.fn(async (path: string, content: string) => {
            files[path] = content;
            return Object.assign(new TFile(), { path });
        }),
        createFolder: jest.fn(async (path: string) => {
            folders.push(path);
        }),
    };
    return vault;
}

describe("the one writer of a claim note (#762 FR-3, FR-4)", () => {
    it("creates the note, making its folder first", async () => {
        const vault = vaultWith({});
        expect(await createClaimNote(vault as never, "Claims/A claim.md", "---\nclaim: \"A\"\n---\n")).toBe("created");
        expect(vault.createFolder).toHaveBeenCalledWith("Claims");
        expect(vault.create).toHaveBeenCalledWith("Claims/A claim.md", "---\nclaim: \"A\"\n---\n");
    });

    it("never overwrites a taken path: it says taken and writes nothing", async () => {
        const vault = vaultWith({ "A claim.md": "Something you wrote." });
        expect(await createClaimNote(vault as never, "A claim.md", "---\nclaim: \"A\"\n---\n")).toBe("taken");
        expect(vault.create).not.toHaveBeenCalled();
    });

    it("never writes anything that is not a markdown note — the book least of all", async () => {
        const vault = vaultWith({});
        expect(await createClaimNote(vault as never, "Books/Thinking.epub", "x")).toBe("failed");
        expect(vault.create).not.toHaveBeenCalled();
    });
});
