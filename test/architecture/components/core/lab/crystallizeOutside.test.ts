import { describe, it, expect, afterEach } from "@jest/globals";
import { TFile } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { CrystallizeModal } from "architecture/components/core/lab/CrystallizeModal";

/**
 * **Crystallizing never writes into a note outside ZettelFlow** (#688). A thread about a note in an
 * excluded folder still becomes a note — a new one — and the modal says why it cannot go back.
 */
const keeps = (content: DomNode) => content.byClass("crystallize-keeps").map((el) => el.textContent);

describe("crystallize and a note outside ZettelFlow (#688)", () => {
    afterEach(() => KnowledgeIndex.getInstance().useSettingsHost(null));

    function open(subject: string) {
        const file = new TFile();
        file.path = subject;
        const app = { vault: { getAbstractFileByPath: (path: string) => (path === subject ? file : null) } };
        const modal = new CrystallizeModal(app as never, { title: "An idea", body: "Body", frozen: [], sources: [] } as never, () => undefined, subject);
        const content = new DomNode();
        (modal as unknown as { contentEl: DomNode }).contentEl = content;
        modal.onOpen();
        return content;
    }

    it("offers only a new note, and says the thread's note is outside", () => {
        KnowledgeIndex.getInstance().useSettingsHost({ settings: { excludedPaths: ["Templates"] } as never });
        const content = open("Templates/Daily.md");
        // Names the rule that left it out, in the settings card's words (#713, AC-5).
        expect(keeps(content)).toContain("Its note is left out of ZettelFlow (are in Templates and its subfolders), so this becomes a new note.");
    });

    it("still offers to go back into a note in scope", () => {
        KnowledgeIndex.getInstance().useSettingsHost({ settings: { excludedPaths: ["Templates"] } as never });
        const content = open("Notes/a.md");
        expect(keeps(content).some((text) => text.includes("left out of ZettelFlow"))).toBe(false);
    });
});
