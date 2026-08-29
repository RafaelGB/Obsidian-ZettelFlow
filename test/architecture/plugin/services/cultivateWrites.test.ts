import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { CultivationService } from "architecture/plugin/services/CultivationService";
import { QuickCaptureModal } from "zettelkasten/modals/QuickCaptureModal";
import { wireHarness } from "../../../support/harness";

const cultivation = () => CultivationService.getInstance();

describe("Cultivate writes (#317 S3)", () => {
    beforeEach(() => jest.restoreAllMocks());

    it("link appends a wikilink to the body, preserving the frontmatter", async () => {
        const h = wireHarness({ files: { "a.md": { frontmatter: { state: "permanent" }, body: "Body." } } });
        await cultivation().link(h.app as never, "a.md", "Other note");
        const content = h.vault.contentOf("a.md");
        expect(content).toContain("[[Other note]]");
        expect(content).toContain("state: permanent"); // frontmatter block untouched
        expect(content).toContain("Body.");
    });

    it("addQuestion appends a question:: field; addSource writes source frontmatter", async () => {
        const h = wireHarness({ files: { "a.md": { frontmatter: {}, body: "Body." } } });
        await cultivation().addQuestion(h.app as never, "a.md", "What if?");
        expect(h.vault.contentOf("a.md")).toContain("question:: What if?");

        await cultivation().addSource(h.app as never, "a.md", "A citation");
        expect(h.vault.frontmatterOf("a.md").source).toBe("A citation");
    });

    it("advance moves the lifecycle state via the validated transition", async () => {
        const h = wireHarness({
            files: { "a.md": { frontmatter: { state: "permanent" } } },
            settings: { lifecycle: { stateProperty: "state" } },
        });
        await cultivation().advance(h.app as never, h.plugin as never, "a.md", "developing");
        expect(h.vault.frontmatterOf("a.md").state).toBe("developing");
    });

    it("a missing target file is a safe no-op (never throws)", async () => {
        const h = wireHarness({});
        await expect(cultivation().link(h.app as never, "missing.md", "X")).resolves.toBeUndefined();
        await expect(cultivation().addSource(h.app as never, "missing.md", "s")).resolves.toBeUndefined();
    });
});

describe("QuickCapture writes (#317 S3 / #285)", () => {
    it("writes a fleeting note to Inbox with the title as the heading", async () => {
        const h = wireHarness({});
        const modal = new QuickCaptureModal(h.plugin as never);
        await (modal as unknown as { capture: (t: string) => Promise<void> }).capture("My idea");
        const content = h.vault.contentOf("Inbox/My idea.md");
        expect(content).toContain("state: fleeting");
        expect(content).toContain("# My idea");
    });

    it("never overwrites an existing note — a collision gets a timestamp suffix", async () => {
        const h = wireHarness({ files: { "Inbox/Dup.md": { body: "original" } } });
        const modal = new QuickCaptureModal(h.plugin as never);
        await (modal as unknown as { capture: (t: string) => Promise<void> }).capture("Dup");
        expect(h.vault.contentOf("Inbox/Dup.md")).toBe("original"); // untouched
        const suffixed = [...h.vault.entries.keys()].find((p) => /^Inbox\/Dup \d+\.md$/.test(p));
        expect(suffixed).toBeDefined();
    });
});
