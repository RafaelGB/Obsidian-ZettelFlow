import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { claimDoorEntry, type MenuLike, type MenuItemLike } from "starters/zcomponents/ClaimDoorComponent";
import { scopeExcludedPaths } from "architecture/knowledge/scope/knowledgeScope";

// test/application/claims → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const COMPONENT = read("src/starters/zcomponents/ClaimDoorComponent.ts");
const MODAL = read("src/architecture/components/core/claims/ClaimDoorModal.ts");

/** A menu that records what was put in it. Obsidian's `Menu` is not in the mock, and does not need to be. */
function fakeMenu(): MenuLike & { titles: string[] } {
    const titles: string[] = [];
    return {
        titles,
        addItem(build: (item: MenuItemLike) => void) {
            const item: MenuItemLike = {
                setTitle(title: string) {
                    titles.push(title);
                    return item;
                },
                setIcon() {
                    return item;
                },
                onClick() {
                    return item;
                },
            };
            build(item);
            return item;
        },
    };
}

/**
 * Only where a note is knowledge (#561, the #496 rule).
 *
 * An excluded path — a flow canvas, a script folder, the thinking space — never becomes an idea, so
 * it never carries a claim either. A refusal you cannot see is an invisible failure in a different
 * place, so the entry is **absent** rather than disabled.
 */
describe("the door appears only on a note that is knowledge (#561)", () => {
    const excluded = scopeExcludedPaths({ thoughtLabPath: "_ZettelFlow/lab" });

    it("adds one entry for a note in scope", () => {
        const menu = fakeMenu();
        const open = jest.fn();
        expect(claimDoorEntry(menu, "Notes/real.md", excluded, open)).toBe(true);
        expect(menu.titles).toHaveLength(1);
        expect(open).not.toHaveBeenCalled();
    });

    it("adds nothing for a thought", () => {
        const menu = fakeMenu();
        expect(claimDoorEntry(menu, "_ZettelFlow/lab/1700-aaa.md", excluded, jest.fn())).toBe(false);
        expect(menu.titles).toHaveLength(0);
    });

    it("adds nothing for something that is not a note", () => {
        const menu = fakeMenu();
        expect(claimDoorEntry(menu, "Attachments/diagram.png", excluded, jest.fn())).toBe(false);
        expect(menu.titles).toHaveLength(0);
    });

    it("reads the one place that decides what is not knowledge", () => {
        expect(COMPONENT).toContain("scopeExcludedPaths(this.plugin.settings)");
    });

    it("registers no command — the palette is not where anyone discovers anything (#496)", () => {
        expect(COMPONENT).not.toContain("addCommand(");
    });

    it("covers the three places a note is right-clicked with two listeners", () => {
        // A tab header's context menu fires `file-menu` with `source: "tab-header"`. Two listeners
        // reach all three places; a third would be wrong.
        for (const event of ["editor-menu", "file-menu"]) {
            expect((COMPONENT.match(new RegExp(`workspace\\.on\\("${event}"`, "g")) ?? [])).toHaveLength(1);
        }
    });
});

/**
 * One sentence box, and nothing else (#561 FR-2).
 *
 * The gesture asks one question. No kind picker, no source field, no confidence, no tags — a
 * gesture that opens a form is a gesture nobody repeats.
 */
describe("the sentence box asks one question (#561)", () => {
    it("is built and cleared the Obsidian way", () => {
        expect(MODAL).toContain("contentEl.empty()");
        expect(MODAL).not.toContain("innerHTML");
        expect(MODAL).not.toContain("el.style.");
    });

    it("commits on Enter as well as on its button", () => {
        expect(MODAL).toContain('"Enter"');
        expect(MODAL).toContain("mod-cta");
    });

    it("says what it is asking, from the locale layer", () => {
        expect(MODAL).toContain('t("claim_door_title")');
    });

    it("opens nothing else", () => {
        expect((MODAL.match(/new [A-Z]\w*Modal\(/g) ?? [])).toHaveLength(0);
    });
});
