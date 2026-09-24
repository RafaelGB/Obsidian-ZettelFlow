import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { dueClaims, DEFAULT_RETURN_INTERVAL_DAYS } from "architecture/knowledge/review/dueClaims";
import { horizonAt, type Wager } from "architecture/knowledge/claims/wager";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";
import type { Idea } from "architecture/knowledge/model/Idea";

// test/architecture/knowledge/review → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");

const DAY = 86_400_000;
const HORIZON = horizonAt("2026-12-01") as number;
const INTERVAL = DEFAULT_RETURN_INTERVAL_DAYS;

function idea(path: string, claim: string, modified: number): Idea {
    return {
        path,
        title: path,
        created: 0,
        modified,
        state: "fleeting",
        maturitySignals: { degree: 0, inbound: 0, outbound: 0, ageDays: 0, sourceCount: 0 },
        relations: [],
        claims: [{ text: claim, sources: [] }],
    } as unknown as Idea;
}

function modelOf(ideas: Idea[]): KnowledgeModel {
    const model = new KnowledgeModel();
    model.build(ideas);
    return model;
}

const wager = (at: number, expectation = "they stop waiting"): Wager => ({ expectation, at });

/**
 * A wager comes due on its day, and not before (#571, epic #560).
 *
 * The boundary is the **start of the horizon's local day** — built here through `horizonAt`, so the
 * assertion is in the runner's own zone rather than in UTC. West of Greenwich the difference is a
 * whole evening, and it is the one silent bug a user would notice.
 */
describe("a horizon is a day, and it arrives on that day (#571)", () => {
    const model = modelOf([idea("Notes/a.md", "a claim", HORIZON - 10 * DAY)]);
    const horizons = { "Notes/a.md": wager(HORIZON) };

    it("is not due the day before", () => {
        expect(dueClaims({ model, horizons, intervalDays: INTERVAL, now: HORIZON - 1 })).toEqual([]);
    });

    it("is due at the boundary, and stays due", () => {
        for (const now of [HORIZON, HORIZON + 1, HORIZON + DAY, HORIZON + 31 * DAY]) {
            const due = dueClaims({ model, horizons, intervalDays: INTERVAL, now });
            expect({ now, length: due.length, kind: due[0]?.kind }).toEqual({
                now,
                length: 1,
                kind: "wager",
            });
        }
    });

    it("carries the wager, so the caller need not read the note again", () => {
        const [due] = dueClaims({ model, horizons, intervalDays: INTERVAL, now: HORIZON });
        expect(due.wager).toEqual(wager(HORIZON));
        expect(due.claim).toBe("a claim");
    });

    it("changes nothing for a vault with no wagers", () => {
        const old = modelOf([idea("Notes/a.md", "a claim", HORIZON - 400 * DAY)]);
        const withoutInput = dueClaims({ model: old, intervalDays: INTERVAL, now: HORIZON });
        const withEmpty = dueClaims({ model: old, horizons: {}, intervalDays: INTERVAL, now: HORIZON });
        expect(withEmpty).toEqual(withoutInput);
        expect(withoutInput[0]?.kind).toBe("claim");
    });
});

/**
 * One thing at a time, across both kinds (#571 FR-2).
 *
 * The epic's promise is *at most one*, and it holds over the **union** — which is why this is one
 * selector and not two. A horizon is a date you set, so it takes the single slot from an interval
 * you merely accepted.
 */
describe("a wager and a claim never arrive together (#571)", () => {
    it("offers the wager, and only the wager", () => {
        const model = modelOf([
            idea("Notes/wager.md", "the wager", HORIZON - 5 * DAY),
            idea("Notes/old.md", "an old claim", HORIZON - 400 * DAY),
        ]);
        const due = dueClaims({
            model,
            horizons: { "Notes/wager.md": wager(HORIZON) },
            intervalDays: INTERVAL,
            now: HORIZON,
        });
        expect(due).toHaveLength(1);
        expect(due[0].path).toBe("Notes/wager.md");
    });

    it("offers the older horizon when two have arrived, ties by path", () => {
        const model = modelOf([
            idea("Notes/b.md", "b", 0),
            idea("Notes/a.md", "a", 0),
            idea("Notes/c.md", "c", 0),
        ]);
        const due = dueClaims({
            model,
            horizons: {
                "Notes/b.md": wager(HORIZON - DAY),
                "Notes/a.md": wager(HORIZON),
                "Notes/c.md": wager(HORIZON - DAY),
            },
            intervalDays: INTERVAL,
            now: HORIZON,
        });
        expect(due).toHaveLength(1);
        expect(due[0].path).toBe("Notes/b.md");
    });

    it("falls back to the ordinary return when no horizon has arrived", () => {
        const model = modelOf([idea("Notes/a.md", "a claim", HORIZON - 400 * DAY)]);
        const due = dueClaims({
            model,
            horizons: { "Notes/a.md": wager(HORIZON + 30 * DAY) },
            intervalDays: INTERVAL,
            now: HORIZON,
        });
        // A claim whose wager has not arrived is still a claim, and its own clock still runs.
        expect(due).toHaveLength(1);
        expect(due[0].kind).toBe("claim");
    });
});

/**
 * No thinking space, no wager (#571, the #562 precedent).
 *
 * Resolving writes the observation as a thought. A wager that comes due with nowhere to put the
 * answer is an invitation the product cannot honour, so the map is empty and Home stays quiet.
 */
describe("a wager needs somewhere to put the answer (#571)", () => {
    it("is read from the vault, and refuses without a Lab folder", () => {
        const source = readFileSync(join(ROOT, "src/architecture/plugin/claims/wagersOf.ts"), "utf8");
        expect(source).toContain("ThoughtStore.getInstance().folder()");
        expect(source).toContain("return {}");
        // It reads the metadata cache, never the files: this runs where Home recomputes.
        expect(source).toContain("metadataCache.getFileCache");
        expect(source).not.toContain("cachedRead");
    });

    it("is handed in rather than looked up, like every other frontmatter input", () => {
        const selection = readFileSync(join(ROOT, "src/architecture/knowledge/review/dueClaims.ts"), "utf8");
        expect(selection).not.toContain("ThoughtStore");
        expect(selection).not.toMatch(/from "obsidian"/);
    });
});
