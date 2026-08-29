import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { FileService } from "architecture/plugin/services/FileService";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import { StateTransitionService } from "architecture/plugin/services/StateTransitionService";
import { LifecycleStateSchema } from "architecture/knowledge/lifecycle";
import { wireHarness } from "../../../support/harness";

describe("write paths — vault services (#317 S2)", () => {
    beforeEach(() => jest.restoreAllMocks());

    describe("FrontmatterService", () => {
        it("reads flat + nested properties and writes only the given keys", async () => {
            const h = wireHarness({ files: { "a.md": { frontmatter: { state: "fleeting", nested: { x: 1 }, keep: "me" }, body: "hi" } } });
            const fm = FrontmatterService.instance(h.vault.getFileByPath("a.md")!);

            expect(fm.getProperty("state")).toBe("fleeting");
            expect(fm.getProperty("nested.x")).toBe(1);
            expect(fm.contains("keep")).toBe(true);
            expect(fm.equals("state", "fleeting")).toBe(true);

            await fm.setProperty("source", "a book");
            expect(h.vault.frontmatterOf("a.md").source).toBe("a book");
            expect(h.vault.frontmatterOf("a.md").keep).toBe("me"); // untouched
        });

        it("setProperties adds, overwrites and removes without clobbering others", async () => {
            const h = wireHarness({ files: { "a.md": { frontmatter: { state: "fleeting", keep: "me" } } } });
            const fm = FrontmatterService.instance(h.vault.getFileByPath("a.md")!);

            await fm.setProperties({ state: "permanent", tags: ["x"] }, ["keep"]);
            const out = h.vault.frontmatterOf("a.md");
            expect(out.state).toBe("permanent");
            expect(out.tags).toEqual(["x"]);
            expect("keep" in out).toBe(false);
        });
    });

    describe("FileService", () => {
        it("reads, modifies, creates and overwrites content", async () => {
            const h = wireHarness({ files: { "a.md": { body: "hello" } } });
            const a = h.vault.getFileByPath("a.md")!;

            expect(await FileService.getContent(a)).toBe("hello");
            await FileService.modify(a, "world");
            expect(h.vault.contentOf("a.md")).toBe("world");

            await FileService.createFile("b.md", "new", false);
            expect(h.vault.contentOf("b.md")).toBe("new");

            await FileService.writeFile("a.md", "over", false); // overwrite existing
            expect(h.vault.contentOf("a.md")).toBe("over");
            await FileService.writeFile("c.md", "fresh", false); // create when missing
            expect(h.vault.contentOf("c.md")).toBe("fresh");
        });

        it("getFile returns null for a missing file when not restricted", async () => {
            wireHarness({});
            expect(await FileService.getFile("nope.md", false)).toBeNull();
        });
    });

    describe("StateTransitionService", () => {
        const schema = new LifecycleStateSchema("state", {});

        it("writes only the state token on a valid transition (fleeting -> literature)", async () => {
            const h = wireHarness({ files: { "a.md": { frontmatter: { state: "fleeting" } } } });
            const fm = FrontmatterService.instance(h.vault.getFileByPath("a.md")!);
            const ok = await StateTransitionService.getInstance().transition(fm, "state", schema, "literature", "a.md");
            expect(ok).toBe(true);
            expect(h.vault.frontmatterOf("a.md").state).toBe("literature");
        });

        it("REJECTS a non-adjacent transition and writes nothing (fleeting -> evergreen)", async () => {
            const setProperty = jest.fn(async () => undefined);
            const accessor = { getProperty: () => "fleeting", setProperty };
            const ok = await StateTransitionService.getInstance().transition(accessor, "state", schema, "evergreen", "a.md");
            expect(ok).toBe(false);
            expect(setProperty).not.toHaveBeenCalled(); // the sharp edge: no write on a rejected transition
        });

        it("returns false (not throws) when the write fails", async () => {
            const accessor = { getProperty: () => "fleeting", setProperty: async () => { throw new Error("disk"); } };
            const ok = await StateTransitionService.getInstance().transition(accessor, "state", schema, "literature", "a.md");
            expect(ok).toBe(false);
        });
    });
});
