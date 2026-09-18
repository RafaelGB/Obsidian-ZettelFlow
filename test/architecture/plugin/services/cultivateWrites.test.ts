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

/**
 * Capture lands in the lab (#475).
 *
 * It used to write `Inbox/<title>.md` with `state: fleeting` — three commitments before you had
 * decided anything: that it is a note, that it has a title, and that it has a lifecycle state.
 * An impulse has no subject, so it belongs where nothing is classified yet.
 */
describe("capture writes a thought, not a note (#475)", () => {
    it("creates no note anywhere", async () => {
        const h = wireHarness({});
        const modal = new QuickCaptureModal(h.plugin as never);
        await (modal as unknown as { capture: (t: string) => Promise<boolean> }).capture("My idea");
        const notes = [...h.vault.entries.keys()].filter((path) => path.startsWith("Inbox/"));
        expect(notes).toEqual([]);
    });

    it("says so and writes nothing when there is no lab to write to", async () => {
        // Falling back to creating a note is how you end up with the thing this change exists
        // to stop.
        const h = wireHarness({});
        const modal = new QuickCaptureModal(h.plugin as never);
        const kept = await (modal as unknown as { capture: (t: string) => Promise<boolean> }).capture("Idea");
        expect(kept).toBe(false);
        expect(h.vault.entries.size).toBe(0);
    });
});
