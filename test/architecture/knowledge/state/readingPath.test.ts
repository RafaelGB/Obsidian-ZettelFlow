import { describe, it, expect } from "@jest/globals";
import {
    aroundThisNote,
    argumentPath,
    essentialsPath,
    readFromHere,
    readingPathOf,
    readingPathOptions,
    regionPath,
    selectionPath,
    storyPath,
    READING_PATH_CAP,
    SELECTION_CAP,
} from "architecture/knowledge/state";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// The seed links out to B (supports) and C (plain); D contradicts the seed; E links in plainly.
// C leads on to F, a note two steps away.
const model = buildModel([
    idea("seed.md", "literature", [{ to: "B.md", type: "supports" }, { to: "C.md" }, { to: "ghost.md" }, { to: "seed.md" }]),
    idea("B.md", "permanent"),
    idea("C.md", "permanent", [{ to: "F.md" }]),
    idea("D.md", "permanent", [{ to: "seed.md", type: "contradicts" }]),
    idea("E.md", "permanent", [{ to: "seed.md" }]),
    idea("F.md", "permanent"),
]);

const paths = (p: { chapters: { path: string }[] } | null) => p?.chapters.map((c) => c.path) ?? null;
const roles = (p: { chapters: { role: string }[] } | null) => p?.chapters.map((c) => c.role) ?? null;

describe("around this note — the default reading (#669)", () => {
    it("reads the seed, its neighbours strongest first, then what they lead to", () => {
        // contradicts → supports → plain links (title order), then F two steps away.
        expect(paths(aroundThisNote(model, "seed.md"))).toEqual(["seed.md", "D.md", "B.md", "C.md", "E.md", "F.md"]);
    });

    it("tags each chapter with its role to the seed, from the typed relations", () => {
        expect(roles(aroundThisNote(model, "seed.md"))).toEqual(["thesis", "counter", "support", "context", "context", "context"]);
    });

    it("adds the notes near it that it never linked, after the linked ones", () => {
        const withNear = aroundThisNote(model, "seed.md", { near: ["far.md", "B.md"] });
        expect(paths(withNear)).not.toContain("far.md"); // not in the model: never read
        const known = buildModel([idea("a.md", "fleeting", [{ to: "b.md" }]), idea("b.md", "fleeting"), idea("z.md", "fleeting")]);
        expect(paths(aroundThisNote(known, "a.md", { near: ["z.md"] }))).toEqual(["a.md", "b.md", "z.md"]);
    });

    it("leaves out unresolved links and links to itself", () => {
        const read = paths(aroundThisNote(model, "seed.md"))!;
        expect(read).not.toContain("ghost.md");
        expect(read.filter((p) => p === "seed.md")).toHaveLength(1);
    });

    it("calls the seed context when nothing argues with or supports it", () => {
        const plain = buildModel([idea("a.md", "fleeting", [{ to: "b.md" }]), idea("b.md", "fleeting")]);
        expect(roles(aroundThisNote(plain, "a.md"))).toEqual(["context", "context"]);
    });

    it("never runs longer than the cap", () => {
        const many = buildModel([
            idea("hub.md", "permanent", Array.from({ length: 30 }, (_, i) => ({ to: `n${i}.md` }))),
            ...Array.from({ length: 30 }, (_, i) => idea(`n${i}.md`, "fleeting")),
        ]);
        expect(aroundThisNote(many, "hub.md").chapters).toHaveLength(READING_PATH_CAP);
    });

    it("still reads a note the model does not know, on its own", () => {
        expect(aroundThisNote(model, "outside.md")).toEqual({
            seed: "outside.md",
            kind: "around",
            chapters: [{ path: "outside.md", role: "context" }],
        });
    });

    it("is what Read from here opens (#668)", () => {
        expect(readFromHere(model, "seed.md")).toEqual(aroundThisNote(model, "seed.md"));
    });
});

describe("argument (#669)", () => {
    it("reads the thesis, then what supports it, then what argues back, then the synthesis", () => {
        const argued = buildModel([
            idea("t.md", "permanent", [{ to: "s.md", type: "supports" }]),
            idea("s.md", "permanent"),
            idea("x.md", "permanent", [{ to: "t.md", type: "contradicts" }]),
            // y speaks to both sides: it links to the support and to the counterpoint.
            idea("y.md", "permanent", [{ to: "s.md" }, { to: "x.md" }]),
        ]);
        const path = argumentPath(argued, "t.md");
        expect(paths(path)).toEqual(["t.md", "s.md", "x.md", "y.md"]);
        expect(roles(path)).toEqual(["thesis", "support", "counter", "synthesis"]);
    });

    it("is not offered when nothing supports or contradicts the seed", () => {
        const plain = buildModel([idea("a.md", "fleeting", [{ to: "b.md" }]), idea("b.md", "fleeting")]);
        expect(argumentPath(plain, "a.md")).toBeNull();
    });
});

describe("story of an idea (#669)", () => {
    const dated = buildModel([
        idea("a.md", "permanent", [{ to: "b.md" }, { to: "c.md" }], { created: 300 }),
        idea("b.md", "permanent", [], { created: 100 }),
        idea("c.md", "permanent", [], { created: 200 }),
    ]);

    it("reads the same notes in the order you came to them", () => {
        expect(paths(storyPath(dated, "a.md"))).toEqual(["b.md", "c.md", "a.md"]);
    });

    it("lets a recorded decision or move date a note earlier than its creation", () => {
        const firstSeen = new Map([["a.md", 50]]);
        expect(paths(storyPath(dated, "a.md", { firstSeen }))).toEqual(["a.md", "b.md", "c.md"]);
    });

    it("is not offered when the notes carry no dates to order them by", () => {
        const undated = buildModel([idea("a.md", "permanent", [{ to: "b.md" }, { to: "c.md" }]), idea("b.md", "permanent"), idea("c.md", "permanent")]);
        expect(storyPath(undated, "a.md")).toBeNull();
    });
});

describe("essentials (#669)", () => {
    it("keeps only the seed and the hubs around it, most connected first", () => {
        const hubs = buildModel([
            idea("seed.md", "permanent", [{ to: "h1.md" }, { to: "h2.md" }, { to: "leaf.md" }]),
            idea("h1.md", "permanent", [{ to: "x1.md" }, { to: "x2.md" }, { to: "x3.md" }]),
            idea("h2.md", "permanent", [{ to: "x1.md" }, { to: "x2.md" }]),
            idea("leaf.md", "permanent"),
            idea("x1.md", "permanent"),
            idea("x2.md", "permanent"),
            idea("x3.md", "permanent"),
        ]);
        expect(paths(essentialsPath(hubs, "seed.md"))).toEqual(["seed.md", "h1.md", "h2.md"]);
    });

    it("is not offered when it would leave nothing out", () => {
        expect(essentialsPath(model, "seed.md")).toBeNull();
    });
});

describe("region (#669)", () => {
    it("reads the seed's community when it reaches beyond its own neighbours", () => {
        // A chain a → b → c → d → e splits into {b: a, c} and {d: e}; a only touches b, so its
        // region (a, the hub b, then c) reaches a note a never links with.
        const chain = buildModel([
            idea("a.md", "permanent", [{ to: "b.md" }]),
            idea("b.md", "permanent", [{ to: "c.md" }]),
            idea("c.md", "permanent", [{ to: "d.md" }]),
            idea("d.md", "permanent", [{ to: "e.md" }]),
            idea("e.md", "permanent"),
        ]);
        expect(paths(regionPath(chain, "a.md"))).toEqual(["a.md", "b.md", "c.md"]);
    });

    it("is not offered when the community is only the seed's own neighbours", () => {
        const star = buildModel([
            idea("hub.md", "permanent", [{ to: "a.md" }, { to: "b.md" }, { to: "c.md" }]),
            idea("a.md", "permanent"),
            idea("b.md", "permanent"),
            idea("c.md", "permanent"),
        ]);
        expect(regionPath(star, "hub.md")).toBeNull();
    });

    it("is not offered for a note in no community", () => {
        expect(regionPath(buildModel([idea("lonely.md", "fleeting")]), "lonely.md")).toBeNull();
    });
});

describe("the chooser's options (#669)", () => {
    it("always offers around first, and only paths that read something different", () => {
        const options = readingPathOptions(model, "seed.md");
        expect(options[0].kind).toBe("around");
        const signatures = options.map((o) => o.path.chapters.map((c) => c.path).join("|"));
        expect(new Set(signatures).size).toBe(signatures.length);
        expect(options.map((o) => o.kind)).toContain("argument");
    });

    it("offers a single way through a note with nothing to choose between", () => {
        const plain = buildModel([idea("a.md", "fleeting", [{ to: "b.md" }]), idea("b.md", "fleeting")]);
        expect(readingPathOptions(plain, "a.md").map((o) => o.kind)).toEqual(["around"]);
    });

    it("rebuilds one kind, falling back to around when the vault no longer gives it substance", () => {
        expect(readingPathOf(model, "seed.md", "argument").kind).toBe("argument");
        const plain = buildModel([idea("a.md", "fleeting", [{ to: "b.md" }]), idea("b.md", "fleeting")]);
        expect(readingPathOf(plain, "a.md", "argument").kind).toBe("around");
    });
});

describe("read these — a selection in the order its links suggest (#669)", () => {
    const chain = buildModel([
        idea("one.md", "permanent", [{ to: "two.md" }]),
        idea("two.md", "permanent", [{ to: "three.md" }]),
        idea("three.md", "permanent"),
        idea("aside.md", "permanent"),
    ]);

    it("starts where the links start and follows them", () => {
        expect(paths(selectionPath(chain, ["three.md", "two.md", "one.md"]))).toEqual(["one.md", "two.md", "three.md"]);
    });

    it("reads an unlinked note after the linked ones, and leaves out what the model does not know", () => {
        expect(paths(selectionPath(chain, ["aside.md", "two.md", "one.md", "ghost.md"]))).toEqual(["one.md", "two.md", "aside.md"]);
    });

    it("reads nothing for a selection of nothing", () => {
        expect(selectionPath(chain, ["ghost.md"])).toBeNull();
    });

    it("reads more of what you picked than of a neighbourhood", () => {
        const many = buildModel(Array.from({ length: 80 }, (_, i) => idea(`n${i}.md`, "fleeting")));
        expect(selectionPath(many, Array.from({ length: 80 }, (_, i) => `n${i}.md`))!.chapters).toHaveLength(SELECTION_CAP);
    });
});
