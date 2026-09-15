import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { writeSatellite } from "application/notes/satelliteWriter";
import { SatellitePlan } from "application/notes/satellitePlan";
import { FileService } from "architecture/plugin/services/FileService";
import { wireHarness } from "../../support/harness";

const MAIN = "zettel/sources/Luhmann 1992.md";
const TEMPLATE = "steps/permanent.md";

function plan(overrides: Partial<SatellitePlan> = {}): SatellitePlan {
    return {
        template: TEMPLATE,
        title: "Luhmann 1992 — idea",
        path: "zettel/ideas/Luhmann 1992 — idea.md",
        edge: {
            on: "satellite",
            target: "Luhmann 1992",
            key: "inspired-by",
            value: "[[Luhmann 1992]]",
        },
        ...overrides,
    };
}

function harness(extra: Record<string, { frontmatter?: Record<string, unknown>; body?: string }> = {}) {
    return wireHarness({
        files: {
            [MAIN]: { frontmatter: { state: "literature" }, body: "# Luhmann 1992\n" },
            [TEMPLATE]: { frontmatter: { state: "permanent" }, body: "## What I now think\n" },
            ...extra,
        },
    });
}

/**
 * **AC-4 is enforced by construction, not by a test**: `writeSatellite` takes the *created* main
 * `TFile`, so it cannot be called before the main note exists. A build that fails to create the
 * main note therefore cannot reach the satellite at all.
 */
describe("the satellite is written after the main note, or not at all (#419)", () => {
    beforeEach(() => jest.restoreAllMocks());

    it("creates the satellite from its template and writes the edge (AC-1)", async () => {
        const h = harness();
        const main = h.vault.getFileByPath(MAIN)!;

        const outcome = await writeSatellite(plan(), main);

        expect(outcome.status).toBe("created");
        const satellite = h.vault.getFileByPath("zettel/ideas/Luhmann 1992 — idea.md");
        expect(satellite).not.toBeNull();
        // The template's own content and frontmatter, plus the edge on the declared side.
        expect(h.vault.contentOf("zettel/ideas/Luhmann 1992 — idea.md")).toContain("What I now think");
        expect(h.vault.frontmatterOf("zettel/ideas/Luhmann 1992 — idea.md")["inspired-by"]).toBe(
            "[[Luhmann 1992]]"
        );
        // …and nothing on the main note, because the direction said otherwise.
        expect(h.vault.frontmatterOf(MAIN)["inspired-by"]).toBeUndefined();
    });

    it("writes the edge on the main note when that is the declared direction", async () => {
        const h = harness();
        const main = h.vault.getFileByPath(MAIN)!;

        await writeSatellite(
            plan({
                edge: {
                    on: "main",
                    target: "Luhmann 1992 — idea",
                    key: "expands",
                    value: "[[Luhmann 1992 — idea]]",
                },
            }),
            main
        );

        expect(h.vault.frontmatterOf(MAIN)["expands"]).toBe("[[Luhmann 1992 — idea]]");
        expect(h.vault.frontmatterOf("zettel/ideas/Luhmann 1992 — idea.md")["expands"]).toBeUndefined();
    });

    it("refuses to touch an existing note and writes nothing at all (AC-5)", async () => {
        const taken = "zettel/ideas/Luhmann 1992 — idea.md";
        const h = harness({ [taken]: { frontmatter: { state: "permanent" }, body: "mine\n" } });
        const main = h.vault.getFileByPath(MAIN)!;
        const before = h.vault.contentOf(taken);

        const outcome = await writeSatellite(plan(), main);

        expect(outcome.status).toBe("conflict");
        expect(h.vault.contentOf(taken)).toBe(before);
        expect(h.vault.frontmatterOf(taken)["inspired-by"]).toBeUndefined();
        expect(h.vault.frontmatterOf(MAIN)["inspired-by"]).toBeUndefined();
    });

    it("keeps the main note and writes no edge when the satellite cannot be created (AC-3)", async () => {
        const h = harness();
        const main = h.vault.getFileByPath(MAIN)!;
        jest.spyOn(FileService, "createFile").mockRejectedValue(new Error("disk is full"));

        const outcome = await writeSatellite(plan(), main);

        expect(outcome.status).toBe("failed");
        expect(outcome.error).toContain("disk is full");
        expect(h.vault.getFileByPath(MAIN)).not.toBeNull();
        // The edge is written last precisely so this cannot leave a dangling relation.
        expect(h.vault.frontmatterOf(MAIN)["inspired-by"]).toBeUndefined();
    });

    it("reports a missing template instead of creating an empty note (FR-12 at build time)", async () => {
        const h = harness();
        const main = h.vault.getFileByPath(MAIN)!;

        const outcome = await writeSatellite(plan({ template: "steps/absent.md" }), main);

        expect(outcome.status).toBe("failed");
        expect(h.vault.getFileByPath("zettel/ideas/Luhmann 1992 — idea.md")).toBeNull();
    });

    it("carries the template's body and frontmatter, not the main note's", async () => {
        const h = harness();
        const main = h.vault.getFileByPath(MAIN)!;

        await writeSatellite(plan(), main);

        const frontmatter = h.vault.frontmatterOf("zettel/ideas/Luhmann 1992 — idea.md");
        expect(frontmatter.state).toBe("permanent");
        expect(h.vault.contentOf("zettel/ideas/Luhmann 1992 — idea.md")).not.toContain(
            "# Luhmann 1992"
        );
    });
});
