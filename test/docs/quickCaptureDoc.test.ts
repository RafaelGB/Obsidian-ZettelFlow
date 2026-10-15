import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";

// test/docs → 2 ups → repo root
const DOCS = join(__dirname, "..", "..", "docs");
const PAGES = {
    "the quick capture page": readFileSync(join(DOCS, "development", "quick-capture.md"), "utf8"),
    "the capability reference": readFileSync(join(DOCS, "reference", "capabilities.md"), "utf8"),
};

/**
 * **Capture lands in the thinking space** (#800 D1, D2, AC-2). Since #475 it has written a thought,
 * not `Inbox/<title>.md` — and the two pages a tutorial would copy still said Inbox.
 */
describe("quick capture says where a thought lands (#800)", () => {
    it.each(Object.entries(PAGES))("%s never sends a capture to an Inbox", (_name, page) => {
        expect(page).not.toContain("Inbox/");
        expect(page).not.toMatch(/in your Inbox/i);
        expect(page).toContain("thinking space");
    });

    it("quotes what the product says after a capture", () => {
        expect(PAGES["the quick capture page"]).toContain(en.quick_capture_captured);
        expect(PAGES["the quick capture page"]).toContain(en.command_quick_capture);
    });
});
