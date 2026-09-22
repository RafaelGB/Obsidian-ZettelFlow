import { describe, it, expect } from "@jest/globals";
import { gapSeams } from "architecture/knowledge/map/gapSeams";
import { communitiesOf } from "architecture/knowledge/map/communities";
import { gapTally } from "architecture/knowledge/discovery/discoveries";
import { build3DGraph } from "architecture/knowledge/map/graph3d";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";
import type { Idea } from "architecture/knowledge/model/Idea";

/**
 * **Where the gaps concentrate** (#531, epic #529).
 *
 * A gap is a pair; a seam is what the pairs add up to over the neighbourhoods of #524. Every
 * fixture here is small enough that the answer is countable by eye, which is the only way a
 * counting projection can be checked without restating its implementation.
 */

/** A clique of `size` notes, every one linked to every other — a planted community. */
function clique(prefix: string, size: number): Idea[] {
    return Array.from({ length: size }, (_, n) =>
        idea(
            `${prefix}-${n}.md`,
            "permanent",
            Array.from({ length: size }, (_, m) => m)
                .filter((m) => m > n)
                .map((m) => ({ to: `${prefix}-${m}.md` }))
        )
    );
}

/**
 * Two dense neighbourhoods, joined by exactly one link.
 *
 * That single link is what makes the seam: `x-0` now cites `x-1`, `x-2`, `x-3` **and** `y-0`, so
 * `y-0` is co-cited with each of the three — three crossing gaps of score 2 — while inside either
 * clique every pair is already linked and therefore not a gap at all.
 */
const twoCliques = buildModel([...clique("x", 4), ...clique("y", 4)].map((entry) =>
    entry.path === "x-0.md"
        ? idea("x-0.md", "permanent", [{ to: "x-1.md" }, { to: "x-2.md" }, { to: "x-3.md" }, { to: "y-0.md" }])
        : entry
));

describe("gapSeams — the seam, countable by eye (#531, AC-1, FR-1)", () => {
    it("finds one seam between two neighbourhoods joined by one link", () => {
        expect(communitiesOf(twoCliques)).toHaveLength(2); // the precondition the count means nothing without
        expect(gapTally(twoCliques).size).toBe(3);

        const seams = gapSeams(twoCliques);
        expect(seams).toHaveLength(1);
        expect(seams[0]).toEqual({
            a: 0,
            b: 1,
            labelA: "x-0",
            labelB: "y-0",
            gaps: 3,
            score: 6,
            links: 1,
        });
    });

    it("names the lower community index first", () => {
        expect(gapSeams(twoCliques).every((seam) => seam.a < seam.b)).toBe(true);
    });
});

describe("gapSeams — a gap inside one neighbourhood is counted nowhere (#531, AC-2, AC-8, FR-2)", () => {
    it("has no seam when every gap is internal", () => {
        // A star: the hub co-cites its three leaves, so there are three gaps — all of them inside
        // the one neighbourhood the star is.
        const star = buildModel([
            idea("hub.md", "permanent", [{ to: "a.md" }, { to: "b.md" }, { to: "c.md" }]),
            idea("a.md", "permanent", []),
            idea("b.md", "permanent", []),
            idea("c.md", "permanent", []),
        ]);
        expect(communitiesOf(star)).toHaveLength(1);
        expect(gapTally(star).size).toBe(3);
        expect(gapSeams(star)).toEqual([]);
    });

    it("has nothing to say about an empty or unlinked model", () => {
        expect(gapSeams(buildModel([]))).toEqual([]);
        expect(
            gapSeams(
                buildModel([
                    idea("a.md", "permanent", []),
                    idea("b.md", "permanent", []),
                    idea("c.md", "permanent", []),
                ])
            )
        ).toEqual([]);
    });

    it("counts no seam where two neighbourhoods are linked and nothing across is missing", () => {
        // Four links cross here, and every pair they co-cite is already linked, so there is no gap
        // between the two neighbourhoods at all. A seam is about what is *missing*: links alone do
        // not make one, and this is the fixture that says so rather than a defensive branch nobody
        // ever reaches.
        const linkedNoGap = buildModel([
            idea("p-0.md", "permanent", [{ to: "p-1.md" }, { to: "p-2.md" }, { to: "p-3.md" }, { to: "q-0.md" }]),
            idea("p-1.md", "permanent", [{ to: "p-2.md" }, { to: "p-3.md" }, { to: "q-0.md" }]),
            idea("p-2.md", "permanent", [{ to: "p-3.md" }, { to: "q-0.md" }]),
            idea("p-3.md", "permanent", [{ to: "q-0.md" }]),
            idea("q-0.md", "permanent", [{ to: "q-1.md" }, { to: "q-2.md" }, { to: "q-3.md" }]),
            idea("q-1.md", "permanent", [{ to: "q-2.md" }, { to: "q-3.md" }]),
            idea("q-2.md", "permanent", [{ to: "q-3.md" }]),
            idea("q-3.md", "permanent", []),
        ]);
        expect(communitiesOf(linkedNoGap)).toHaveLength(2);
        expect(gapTally(linkedNoGap).size).toBe(0);
        expect(gapSeams(linkedNoGap)).toEqual([]);
    });
});

describe("gapSeams — the order, and the same answer twice (#531, AC-3, FR-3)", () => {
    // Three cliques: x↔y carries three gaps, x↔z and y↔z one each, so the order is decided first by
    // gaps and then, between the two ones, by links and labels.
    const threeCliques = buildModel([
        ...clique("x", 4).map((entry) =>
            entry.path === "x-0.md"
                ? idea("x-0.md", "permanent", [
                      { to: "x-1.md" },
                      { to: "x-2.md" },
                      { to: "x-3.md" },
                      { to: "y-0.md" },
                  ])
                : entry
        ),
        ...clique("y", 4),
        ...clique("z", 4),
        idea("join-xz.md", "permanent", [{ to: "x-1.md" }, { to: "z-0.md" }]),
        idea("join-yz.md", "permanent", [{ to: "y-1.md" }, { to: "z-1.md" }]),
    ]);

    it("gives the same answer twice, key for key", () => {
        expect(gapSeams(threeCliques)).toEqual(gapSeams(threeCliques));
        expect(JSON.stringify(gapSeams(threeCliques))).toBe(JSON.stringify(gapSeams(threeCliques)));
    });

    it("is ordered gaps desc, then links asc, then labels", () => {
        const seams = gapSeams(threeCliques);
        expect(seams.length).toBeGreaterThan(1);
        for (let index = 1; index < seams.length; index++) {
            const previous = seams[index - 1];
            const current = seams[index];
            if (previous.gaps !== current.gaps) {
                expect(previous.gaps).toBeGreaterThan(current.gaps);
                continue;
            }
            if (previous.links !== current.links) {
                expect(previous.links).toBeLessThan(current.links);
                continue;
            }
            expect(
                previous.labelA < current.labelA ||
                    (previous.labelA === current.labelA && previous.labelB <= current.labelB)
            ).toBe(true);
        }
    });
});

describe("gapSeams — a label nobody has to disambiguate by hand (#531, AC-5, FR-4)", () => {
    /** Two neighbourhoods whose most connected note is called `readme` in both cases. */
    function collidingCliques(folderA: string, folderB: string) {
        const wing = (folder: string, prefix: string): Idea[] => [
            // `readme` links four notes and so is the most connected of them -- strictly, because a
            // tie in degree resolves by path and would hand the name to `a-1` instead.
            idea(`${folder}/readme.md`, "permanent", [
                { to: `${folder}/${prefix}-1.md` },
                { to: `${folder}/${prefix}-2.md` },
                { to: `${folder}/${prefix}-3.md` },
                { to: `${folder}/${prefix}-4.md` },
            ]),
            idea(`${folder}/${prefix}-1.md`, "permanent", [{ to: `${folder}/${prefix}-2.md` }]),
            idea(`${folder}/${prefix}-2.md`, "permanent", [{ to: `${folder}/${prefix}-3.md` }]),
            idea(`${folder}/${prefix}-3.md`, "permanent", [{ to: `${folder}/${prefix}-4.md` }]),
            idea(`${folder}/${prefix}-4.md`, "permanent", []),
        ];
        return buildModel([
            ...wing(folderA, "a"),
            ...wing(folderB, "b"),
            // One link across, so there is a seam to label at all.
            idea("join.md", "permanent", [{ to: `${folderA}/a-1.md` }, { to: `${folderB}/b-1.md` }]),
        ]);
    }

    it("qualifies a name two neighbourhoods share, with the hub's folder path", () => {
        const seams = gapSeams(collidingCliques("one", "two"));
        expect(seams.length).toBeGreaterThan(0);
        const labels = seams.flatMap((seam) => [seam.labelA, seam.labelB]);
        expect(labels).toContain("readme (one)");
        expect(labels).toContain("readme (two)");
        expect(labels).not.toContain("readme");
    });

    it("qualifies by the path, not the folder name, when the folder name collides too", () => {
        // `a/docs/readme.md` and `b/docs/readme.md` share the basename *and* the folder name; only
        // the parent path tells them apart.
        const seams = gapSeams(collidingCliques("a/docs", "b/docs"));
        const labels = seams.flatMap((seam) => [seam.labelA, seam.labelB]);
        expect(labels).toContain("readme (a/docs)");
        expect(labels).toContain("readme (b/docs)");
    });

    it("leaves an unambiguous name bare", () => {
        expect(gapSeams(twoCliques)[0].labelA).toBe("x-0");
    });

    it("keeps every label in the result distinct", () => {
        for (const model of [twoCliques, collidingCliques("one", "two"), collidingCliques("a/docs", "b/docs")]) {
            const seams = gapSeams(model);
            const labels = new Map<number, string>();
            for (const seam of seams) {
                labels.set(seam.a, seam.labelA);
                labels.set(seam.b, seam.labelB);
            }
            expect(new Set(labels.values()).size).toBe(labels.size);
        }
    });
});

describe("gapSeams — the links are the bridges the map already shows (#531, FR-1)", () => {
    it("counts exactly the crossing edges build3DGraph marks as bridges", () => {
        for (const model of [twoCliques]) {
            const communities = communitiesOf(model);
            const communityOf = new Map<string, number>();
            communities.forEach((community, index) => {
                for (const path of [community.hub, ...community.members]) communityOf.set(path, index);
            });

            for (const seam of gapSeams(model)) {
                const bridges = build3DGraph(model).links.filter((link) => {
                    if (!link.bridge) return false;
                    const from = communityOf.get(link.source);
                    const to = communityOf.get(link.target);
                    if (from === undefined || to === undefined) return false;
                    return (
                        (from === seam.a && to === seam.b) || (from === seam.b && to === seam.a)
                    );
                });
                expect(seam.links).toBe(bridges.length);
            }
        }
    });
});
