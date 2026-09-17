import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const sources = [
    join(ROOT, "src", "config", "modals", "ZettelFlowSettingsTab.tsx"),
    join(ROOT, "src", "config", "modals", "handlers", "flowsSettingsGroup.ts"),
].map((path) => ({ path, text: readFileSync(path, "utf8") }));

/**
 * A settings row that draws its own content must survive being drawn again.
 *
 * Obsidian's declarative tab keeps the `Setting` elements and re-runs every `render` callback on
 * `update()`. A callback that does `settingEl.createDiv(...)` therefore adds a **second**
 * container each time — which is how toggling *show advanced settings* stacked a duplicate of
 * every dynamic list on the panel.
 */
describe("a settings row can be rendered twice (#440 follow-up)", () => {
    it("asks for its container by name instead of creating one blindly", () => {
        for (const { path, text } of sources) {
            expect({ path, creates: /settingEl\.createDiv\(/.test(text) }).toEqual({
                path,
                creates: false,
            });
        }
    });

    it("re-evaluates visibility in place rather than redrawing the tab", () => {
        const tab = sources[0].text;
        const toggle = tab.slice(tab.indexOf("settings_advanced_toggle"));
        expect(toggle).toContain("this.refreshDomState()");
        expect(toggle.slice(0, toggle.indexOf("},"))).not.toContain("this.update()");
    });
});
