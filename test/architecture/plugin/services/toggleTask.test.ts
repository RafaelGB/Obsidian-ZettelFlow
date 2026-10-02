import { describe, it, expect, beforeEach } from "@jest/globals";
import { TFile } from "obsidian";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — the jest mock exposes a setter the real barrel does not
import { __setMockObsidianApi } from "architecture";
import { FileService } from "architecture/plugin/services/FileService";
import { bufferedWrites, replaceBufferedWrites } from "architecture/plugin/writes/recordVaultWrite";

let content = "";
function wire(initial: string): TFile {
    content = initial;
    const file = new TFile();
    file.path = "Daily/2026-10-02.md";
    __setMockObsidianApi({
        vault: {
            process: async (_file: TFile, fn: (data: string) => string) => {
                content = fn(content);
                return content;
            },
        },
    });
    return file;
}

describe("FileService.toggleTask (#635)", () => {
    beforeEach(() => replaceBufferedWrites([]));

    it("changes exactly the one box, and records it without the text", async () => {
        const note = "# Day\n\n- [ ] call the supplier\n    - [ ] find the number\n";
        const file = wire(note);
        expect(await FileService.toggleTask(file, 2, { mark: " ", text: "call the supplier" })).toBe(true);
        expect(content).toBe("# Day\n\n- [x] call the supplier\n    - [ ] find the number\n");

        const [write] = bufferedWrites();
        expect(write.kind).toBe("task-toggled");
        expect(write.task).toMatchObject({ line: 2, from: " ", to: "x" });
        expect(JSON.stringify(write)).not.toContain("supplier"); // no note content, ever
    });

    it("ticking twice gives back the note byte-for-byte (the checkbox is its own undo)", async () => {
        const note = "- [ ] a\r\n- [ ] b\r\n";
        const file = wire(note);
        await FileService.toggleTask(file, 1, { mark: " ", text: "b" });
        expect(content).toBe("- [ ] a\r\n- [x] b\r\n");
        await FileService.toggleTask(file, 1, { mark: "x", text: "b" });
        expect(content).toBe(note);
    });

    it("refuses, writes nothing and records nothing when the line changed", async () => {
        const note = "- [ ] call the client\n";
        const file = wire(note);
        expect(await FileService.toggleTask(file, 0, { mark: " ", text: "call the supplier" })).toBe(false);
        expect(await FileService.toggleTask(file, 7, { mark: " ", text: "call the client" })).toBe(false);
        expect(content).toBe(note);
        expect(bufferedWrites()).toEqual([]);
    });
});
