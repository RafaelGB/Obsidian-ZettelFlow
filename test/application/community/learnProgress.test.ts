/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "@jest/globals";
import { parseLearnCatalog, type LearnCatalog } from "application/community/learn/learnCatalog";
import {
    filmOf,
    nextUp,
    readProgress,
    ring,
    starters,
    trackProgress,
    upNext,
    withDone,
    withLast,
} from "application/community/learn/learnProgress";
import { learnRoomCatalog, tutorial } from "../../support/learnFixtures";

function catalog(raw: any = learnRoomCatalog()): LearnCatalog {
    const parsed = parseLearnCatalog(raw, { pluginVersion: "3.7.0" });
    if (parsed.status !== "ok") throw new Error(parsed.status);
    return parsed.catalog;
}

describe("progress, counted over what the tracks show (#802 AC-1, AC-2, FR-2)", () => {
    it("starts at nothing: 0 of N, Start here on the first tutorial of the first track, every track at 0", () => {
        const cat = catalog();
        expect(ring(cat, readProgress(undefined))).toEqual({ done: 0, total: 4 });
        const next = nextUp(cat, readProgress(undefined));
        expect(next.state).toBe("start");
        expect(next.state !== "all-done" && next.tutorial.id).toBe("get-started");
        expect(cat.tracks.map((track) => trackProgress(cat, track, readProgress(undefined)))).toEqual([
            { done: 0, total: 2 },
            { done: 0, total: 1 },
            { done: 0, total: 1 },
        ]);
    });

    it("one done and another opened last: 1 of N, and Pick up names the one opened last", () => {
        const cat = catalog();
        const progress = withLast(withDone(readProgress(undefined), "get-started", true), "think");
        expect(ring(cat, progress)).toEqual({ done: 1, total: 4 });
        const next = nextUp(cat, progress);
        expect(next).toMatchObject({ state: "pick-up", tutorial: { id: "think" } });
        expect(trackProgress(cat, cat.tracks[0], progress)).toEqual({ done: 1, total: 2 });
    });

    it("picks up the first not done, in track order, when the last opened is done", () => {
        const cat = catalog();
        const progress = withLast(withDone(readProgress(undefined), "get-started", true), "get-started");
        expect(nextUp(cat, progress)).toMatchObject({ state: "pick-up", tutorial: { id: "undo" } });
    });

    it("says you have done them all", () => {
        const cat = catalog();
        const progress = ["get-started", "undo", "think", "library"].reduce((all, id) => withDone(all, id, true), readProgress(undefined));
        expect(nextUp(cat, progress)).toEqual({ state: "all-done" });
        expect(ring(cat, progress)).toEqual({ done: 4, total: 4 });
    });

    it("leaves a hidden tutorial out of the denominator, even when it was marked done (AC-7)", () => {
        const raw = learnRoomCatalog();
        raw.tutorials.library.since = "9.0.0";
        const cat = catalog(raw);
        expect(ring(cat, { done: ["library", "undo"] })).toEqual({ done: 1, total: 3 });
    });

    it("reads a hand-edited record as nothing rather than failing", () => {
        expect(readProgress("nonsense")).toEqual({ done: [] });
        expect(readProgress({ done: ["a", 3, "a"], last: 7 })).toEqual({ done: ["a"] });
        expect(withDone({ done: ["a"] }, "a", false)).toEqual({ done: [] });
    });
});

describe("what comes next (#802 FR-9)", () => {
    it("is the next in the track, then the first of the next track, then nothing", () => {
        const cat = catalog();
        expect(upNext(cat, "get-started")?.id).toBe("undo");
        expect(upNext(cat, "undo")?.id).toBe("think");
        expect(upNext(cat, "library")).toBeNull();
    });

    it("offers the first tutorial of each of the first five tracks as starters", () => {
        expect(starters(catalog()).map((one) => one.id)).toEqual(["get-started", "think", "library"]);
    });
});

describe("the film the lesson's camera travels down (#802 FR-10)", () => {
    it("moves only when a step has a picture of its own", () => {
        const cat = catalog();
        // Steps 1, 2 and 4 have a picture; step 3 keeps step 2's.
        expect(filmOf(cat.tutorials["get-started"])).toEqual({
            frames: ["docs/resources/learn/step-1.svg", "docs/resources/learn/step-2.svg", "docs/resources/learn/step-4.svg"],
            at: [0, 1, 1, 2],
        });
    });

    it("opens on the hero when the first step has no picture", () => {
        const one = catalog().tutorials.undo;
        expect(filmOf(one)).toEqual({ frames: ["docs/resources/undo/undo.svg"], at: [0, 0, 0] });
        expect(filmOf({ ...tutorial("x"), id: "x", hero: undefined } as any)).toEqual({ frames: [], at: [0, 0, 0] });
    });
});
