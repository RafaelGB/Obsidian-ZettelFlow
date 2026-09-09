import { describe, it, expect } from "@jest/globals";
import {
    mimeToExtension,
    buildExportBaseName,
    resolveAvailablePath,
} from "architecture/components/core/export/exportFilename";

/** A3 (#386) — the pure filename/path/mime helper behind the "share your universe" export. */
describe("export filename helper (A3, #386)", () => {
    describe("mimeToExtension", () => {
        it("maps png and webm, ignoring codec suffixes", () => {
            expect(mimeToExtension("image/png")).toBe("png");
            expect(mimeToExtension("video/webm;codecs=vp9")).toBe("webm");
        });
        it("falls back to bin for an unknown mime", () => {
            expect(mimeToExtension("application/x-thing")).toBe("bin");
        });
    });

    describe("buildExportBaseName", () => {
        it("is a stable, sortable, slugged base name", () => {
            expect(buildExportBaseName("universe", new Date(2026, 8, 9, 14, 30, 12))).toBe(
                "zettelflow-universe-20260909-143012"
            );
        });
        it("appends a slugged label (spaces/unsafe chars removed)", () => {
            expect(buildExportBaseName("universe", new Date(2026, 8, 9, 14, 30, 12), "My Notes!")).toBe(
                "zettelflow-universe-20260909-143012-my-notes"
            );
        });
    });

    describe("resolveAvailablePath", () => {
        it("returns folder/base.ext when the name is free", () => {
            expect(resolveAvailablePath("Attachments", "x", "png", () => false)).toBe("Attachments/x.png");
        });
        it("appends (1), (2) on collision", () => {
            const taken = new Set(["Attachments/x.png", "Attachments/x (1).png"]);
            expect(resolveAvailablePath("Attachments", "x", "png", (p) => taken.has(p))).toBe("Attachments/x (2).png");
        });
        it("handles an empty folder (vault root)", () => {
            expect(resolveAvailablePath("", "x", "png", () => false)).toBe("x.png");
        });
    });
});
