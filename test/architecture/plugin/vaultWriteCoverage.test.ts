import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const SERVICES = join(SRC, "architecture", "plugin", "services");

function read(...parts: string[]): string {
    return readFileSync(join(...parts), "utf8");
}

interface Method {
    name: string;
    body: string;
}

/** Every static method of a service, as a name and the text between it and the next one. */
function methodsOf(source: string): Method[] {
    const starts = [...source.matchAll(/^ {4}(?:public |private )?static (?:async )?(\w+)\(/gm)];
    return starts.map((match, index) => ({
        name: match[1],
        body: source.slice(match.index ?? 0, starts[index + 1]?.index ?? source.length),
    }));
}

/** A method that reaches the vault's mutating API — derived from the code, not listed here. */
function writes(method: Method): boolean {
    return /vault\(\)\.(create|createBinary|modify|modifyBinary)\(|vault\.create\(|fileManager\(\)\.(renameFile|trashFile)\(/.test(
        method.body
    );
}

/**
 * Every write ZettelFlow performs leaves a fact (#453, AC-2).
 *
 * `deleteFile` is the one deliberate exception, named here rather than quietly skipped: taking a
 * deletion back would mean keeping the note's body, which the record refuses to do. Obsidian's own
 * trash already holds the file.
 */
const NOT_RECORDED = ["deleteFile"];

describe("every write leaves a fact (#453)", () => {
    const fileService = methodsOf(read(SERVICES, "FileService.ts"));

    it("finds the writers from the source, not from a list in the test", () => {
        const names = fileService.filter(writes).map((method) => method.name);
        expect(names).toEqual(
            expect.arrayContaining([
                "createFileOnce",
                "createFile",
                "writeFile",
                "writeBinaryFile",
                "deleteFile",
                "modify",
                "moveFile",
            ])
        );
    });

    it("has each of them record, or be named as an exception", () => {
        const silent = fileService
            .filter(writes)
            .filter((method) => !NOT_RECORDED.includes(method.name))
            .filter((method) => !/recordVaultWrite\(|recordCreation\(/.test(method.body))
            .map((method) => method.name);
        expect(silent).toEqual([]);
    });

    it("records every property change at the one place they all pass through", () => {
        const frontmatter = read(SERVICES, "FrontmatterService.ts");
        // `processFrontMatter` is the single private choke point every property write goes through,
        // and the only moment at which the previous value still exists.
        expect(frontmatter).toContain("recordVaultWrite({");
        expect(frontmatter).toContain("snapshotFrontmatter(");
        expect(frontmatter).toContain("diffFrontmatter(");
    });

    it("keeps the recorder out of the write's way", () => {
        const recorder = read(SRC, "architecture", "plugin", "writes", "recordVaultWrite.ts");
        expect(recorder).toContain("catch");
        expect(recorder).toContain("log.warn");
    });

    it("never gives the record a place to put a note's body", () => {
        const record = read(SRC, "application", "writes", "vaultWriteLog.ts");
        const shape = record.slice(
            record.indexOf("export interface VaultWrite"),
            record.indexOf("export const DEFAULT_WRITE_RETENTION_DAYS")
        );
        expect(shape.length).toBeGreaterThan(200);
        for (const forbidden of ["content:", "body:", "text:", "markdown:"]) {
            expect(shape).not.toContain(forbidden);
        }
    });

    it("has the units of work say who they are", () => {
        // A record that cannot answer "who wrote this" is half a record. These are the actions a
        // user recognises; each wraps its writes in one batch, with an origin.
        const batched: [string[], string][] = [
            [["application", "notes", "NoteBuilder.ts"], 'kind: "flow"'],
            [["hooks", "VaultHooks.ts"], 'kind: "hook"'],
            [["application", "community", "CommunitySystemModal.tsx"], "kind: 'install'"],
            [["config", "modals", "AssignRoleModal.ts"], 'kind: "manual"'],
        ];
        for (const [parts, origin] of batched) {
            const source = read(SRC, ...parts);
            expect(source).toContain("withWriteBatch(");
            expect(source).toContain(origin);
        }
    });
});
