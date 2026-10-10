import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea } from "architecture/knowledge/model/Idea";
import { buildVocabulary } from "architecture/knowledge/alongside/vocabulary";
import { nearPassage } from "architecture/knowledge/alongside/near";
import { vaultConnections, vaultContradictions, VAULT_MOVE_LIMIT } from "architecture/knowledge/alongside/vaultMoves";

function note(path: string, title: string, relations: { to: string; type?: string }[] = []): Idea {
    return {
        path,
        title,
        created: 0,
        modified: 0,
        state: "permanent",
        relations: relations.map((r) => ({ type: r.type ?? "link", from: path, to: r.to })),
        claims: [],
        maturitySignals: { inDegree: 0, outDegree: relations.length, degree: relations.length, hasSources: false },
    };
}

/**
 * The spec's walk: *Planning fallacy* is named in the passage; *Ship early* contradicts it;
 * *Reference-class forecasting* supports it; *Base rates* shares context with it (both cited by
 * *Forecasting*); *Optimism bias* is a plain link and is not offered.
 */
function vault(extra: Idea[] = []): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build([
        note("Notes/Planning fallacy.md", "Planning fallacy", [{ to: "Notes/Optimism bias.md" }]),
        note("Notes/Optimism bias.md", "Optimism bias"),
        note("Notes/Ship early.md", "Ship early", [{ to: "Notes/Planning fallacy.md", type: "contradicts" }]),
        note("Notes/Reference-class forecasting.md", "Reference-class forecasting", [{ to: "Notes/Planning fallacy.md", type: "supports" }]),
        note("Notes/Forecasting.md", "Forecasting", [{ to: "Notes/Planning fallacy.md" }, { to: "Notes/Base rates.md" }]),
        note("Notes/Base rates.md", "Base rates"),
        ...extra,
    ]);
    return model;
}

const BOOK = "Books/b.epub";
const PASSAGE = "This is the planning fallacy, or the planning bias as some call it.";

function nearOf(model: KnowledgeModel, text = PASSAGE) {
    return nearPassage(model, buildVocabulary(model), { text, book: BOOK });
}

describe("Contradict, from your vault (#756 FR-2, AC-1)", () => {
    it("offers the contradicts partners of the near notes, each saying which note it stands against", () => {
        const model = vault();
        expect(vaultContradictions(model, nearOf(model), { book: BOOK })).toEqual([
            { path: "Notes/Ship early.md", title: "Ship early", reason: { kind: "contradicts", of: "Notes/Planning fallacy.md", ofTitle: "Planning fallacy", named: true } },
        ]);
    });

    it("leaves out a note ruled out for this chapter, and one already in a tension with this passage", () => {
        const model = vault();
        const near = nearOf(model);
        expect(vaultContradictions(model, near, { ruledOut: new Set(["Notes/Ship early.md"]) })).toEqual([]);
        expect(vaultContradictions(model, near, { tensions: new Set(["Notes/Ship early.md"]) })).toEqual([]);
    });

    it("offers at most three, in the same order every time", () => {
        const others = ["E", "D", "C", "B", "A"].map((x) => note(`Notes/${x}.md`, x, [{ to: "Notes/Planning fallacy.md", type: "contradicts" }]));
        const model = vault(others);
        const once = vaultContradictions(model, nearOf(model));
        expect(once.map((c) => c.title)).toEqual(["A", "B", "C"]);
        expect(once).toHaveLength(VAULT_MOVE_LIMIT);
        expect(vaultContradictions(model, nearOf(model))).toEqual(once);
    });

    it("finds nothing when the passage names nothing of yours", () => {
        const model = vault();
        expect(vaultContradictions(model, nearOf(model, "Nothing to see in this sentence at all."))).toEqual([]);
    });
});

describe("Connect, from your vault (#756 FR-3, AC-2)", () => {
    it("offers the near note, then its supporting neighbour, then a note sharing context — never a plain link", () => {
        const model = vault();
        const offered = vaultConnections(model, nearOf(model), { book: BOOK });
        expect(offered).toEqual([
            { path: "Notes/Planning fallacy.md", title: "Planning fallacy", reason: { kind: "near", near: "named" } },
            { path: "Notes/Reference-class forecasting.md", title: "Reference-class forecasting", reason: { kind: "supports", of: "Notes/Planning fallacy.md", ofTitle: "Planning fallacy", toward: true } },
            { path: "Notes/Base rates.md", title: "Base rates", reason: { kind: "shared", of: "Notes/Planning fallacy.md", ofTitle: "Planning fallacy" } },
        ]);
        expect(offered.map((c) => c.path)).not.toContain("Notes/Optimism bias.md");
    });

    it("leaves out notes that already cite this passage, and notes ruled out", () => {
        const model = vault();
        const near = nearOf(model);
        const titles = (context: Parameters<typeof vaultConnections>[2]) => vaultConnections(model, near, context).map((c) => c.title);
        expect(titles({ cites: (path) => path === "Notes/Planning fallacy.md" })).toEqual(["Reference-class forecasting", "Base rates"]);
        expect(titles({ ruledOut: new Set(["Notes/Reference-class forecasting.md"]) })).toEqual(["Planning fallacy", "Base rates"]);
        expect(titles({ ruledOutGap: () => true })).toEqual(["Planning fallacy", "Reference-class forecasting"]);
    });

    it("offers at most three, deterministically, and nothing when nothing is near", () => {
        const others = ["Z", "Y", "X"].map((x) => note(`Notes/${x}.md`, x, [{ to: "Notes/Planning fallacy.md", type: "expands" }]));
        const model = vault(others);
        const once = vaultConnections(model, nearOf(model));
        expect(once.map((c) => c.title)).toEqual(["Planning fallacy", "Reference-class forecasting", "X"]);
        expect(vaultConnections(model, nearOf(model))).toEqual(once);
        expect(vaultConnections(model, nearOf(model, "Nothing to see in this sentence at all."))).toEqual([]);
    });
});

describe("no AI, ever (#756 FR-13, AC-9)", () => {
    it("the vault's moves import nothing from the AI layer", () => {
        const source = readFileSync(join(__dirname, "../../../../src/architecture/knowledge/alongside/vaultMoves.ts"), "utf8");
        expect(source).not.toMatch(/from\s+["'][^"']*\bai\b/);
    });
});

describe("near this passage, not just this book (#756)", () => {
    it("a note born from another chapter answers neither move; one born from this chapter does", () => {
        const model = vault([note("Notes/Elsewhere.md", "Elsewhere"), note("Notes/Here.md", "Here")]);
        const near = [
            { path: "Notes/Elsewhere.md", title: "Elsewhere", reason: "born-book" as const },
            { path: "Notes/Here.md", title: "Here", reason: "born-chapter" as const },
        ];
        expect(vaultConnections(model, near).map((c) => c.title)).toEqual(["Here"]);
    });
});
