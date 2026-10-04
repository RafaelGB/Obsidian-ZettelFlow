import { describe, it, expect } from "@jest/globals";
import { previewBlobType, systemPreviewUrls } from "application/community/systemPreview";

describe("a system's preview image (#651)", () => {
    it("asks for the SVG drawing first and the PNG second", () => {
        expect(systemPreviewUrls("https://raw.example/main", "/docs/systems/gtd.zftemplate")).toEqual([
            "https://raw.example/main/docs/systems/gtd.svg",
            "https://raw.example/main/docs/systems/gtd.png",
        ]);
    });

    it("types an SVG as an image even when the server calls it text", () => {
        // GitHub raw serves .svg as text/plain; an <img> of a text/plain blob draws nothing.
        expect(previewBlobType("https://raw.example/x.svg", "text/plain; charset=utf-8")).toBe("image/svg+xml");
        expect(previewBlobType("https://raw.example/x.SVG", undefined)).toBe("image/svg+xml");
    });

    it("trusts the server for anything else", () => {
        expect(previewBlobType("https://raw.example/x.png", "image/png")).toBe("image/png");
        expect(previewBlobType("https://raw.example/x.png", undefined)).toBe("application/octet-stream");
    });
});
