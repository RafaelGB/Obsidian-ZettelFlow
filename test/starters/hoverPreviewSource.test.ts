import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { HOVER_PREVIEW_SOURCE } from "architecture/components/core/a11y";

// test/starters → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("ZettelFlow registers as a Page preview source (#594)", () => {
    const component = read("src/starters/zcomponents/HoverPreviewComponent.ts");

    it("registers the hover-link source on load, requiring the Mod key by default", () => {
        expect(component).toContain("registerHoverLinkSource");
        expect(component).toContain("HOVER_PREVIEW_SOURCE");
        expect(component).toMatch(/defaultMod:\s*true/);
        expect(component).toContain('display: "ZettelFlow"');
    });

    it("emits under the same source id the hoverPreview helper uses", () => {
        expect(HOVER_PREVIEW_SOURCE).toBe("zettelflow");
    });

    it("is loaded with the other plugin components", () => {
        expect(read("src/starters/utils/StartersTools.ts")).toContain("new HoverPreviewComponent(plugin)");
    });
});
