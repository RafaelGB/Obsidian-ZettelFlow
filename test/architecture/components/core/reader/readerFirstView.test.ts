/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest } from "@jest/globals";
import { TFile } from "obsidian";
import { firstSourceView, rememberSourceView } from "architecture/components/core/reader/readerSource";

describe("the view a source opens in (#813 FR-20 – FR-25)", () => {
    const pdf = (suggestedView?: "page" | "reading") => ({ hasPageView: true, ...(suggestedView ? { suggestedView } : {}) });

    it("takes what the tab or the link says first", () => {
        expect(firstSourceView(pdf("page"), { chosenView: "page" }, "reading")).toBe("reading");
    });

    it("then the view you chose for the paper, over what its pages suggest", () => {
        expect(firstSourceView(pdf("page"), { chosenView: "reading" })).toBe("reading");
    });

    it("then the suggestion — this copy's, else the one kept — then reflowed", () => {
        expect(firstSourceView(pdf("page"), undefined)).toBe("page");
        expect(firstSourceView(pdf(), { suggestedView: "page" })).toBe("page");
        expect(firstSourceView(pdf(), undefined)).toBe("reading");
    });

    it("leaves a scan and a book without page layout as they always read (FR-25)", () => {
        expect(firstSourceView({ hasPageView: false, suggestedView: "page" }, { chosenView: "page" }, "page")).toBe("reading");
    });

    it("keeps your choice in the plugin's data only — the paper is never written (FR-22, FR-24)", () => {
        const file = new TFile();
        file.path = "Papers/form.pdf";
        (file as any).stat = { size: 10, mtime: 20 };
        const app = { vault: { getAbstractFileByPath: () => file } } as any;
        const host = { settings: { library: {} } as any, saveSettings: jest.fn(async () => undefined) };
        rememberSourceView(app, host as any, "Papers/form.pdf", "reading");
        expect(host.settings.library["Papers/form.pdf"]).toMatchObject({ chosenView: "reading" });
        expect(host.saveSettings).toHaveBeenCalledTimes(1);
        // The same choice again writes nothing more.
        rememberSourceView(app, host as any, "Papers/form.pdf", "reading");
        expect(host.saveSettings).toHaveBeenCalledTimes(1);
    });
});
