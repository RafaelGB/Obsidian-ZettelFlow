import { describe, it, expect } from "@jest/globals";
import {
    ORIGIN_LABEL_KEY,
    originName,
    UNATTRIBUTED,
    type WriteOriginKind,
} from "application/writes/writeAttribution";

describe("who wrote (#456)", () => {
    it("names a flow by its canvas, not by its path", () => {
        expect(originName({ kind: "flow", ref: "_ZettelFlow/flows/Create note.canvas" })).toBe(
            "Create note"
        );
    });

    it("names a hook by its property", () => {
        expect(originName({ kind: "hook", ref: "hook:status" })).toBe("status");
        expect(originName({ kind: "hook", ref: "status" })).toBe("status");
    });

    it("names an action and an install by what they called themselves", () => {
        expect(originName({ kind: "action", ref: "zettel-id" })).toBe("zettel-id");
        expect(originName({ kind: "install", ref: "Zettelkasten starter" })).toBe(
            "Zettelkasten starter"
        );
    });

    it("prefers a label over a reference, when one was given", () => {
        expect(originName({ kind: "flow", ref: "a/b.canvas", label: "Daily note" })).toBe("Daily note");
    });

    it("says nothing for a write nobody claimed, rather than inventing a name", () => {
        expect(originName(UNATTRIBUTED)).toBe("");
        expect(UNATTRIBUTED.kind).toBe("unknown");
    });

    it("has a label key for every kind there is", () => {
        const kinds: WriteOriginKind[] = ["flow", "hook", "action", "install", "manual", "unknown"];
        for (const kind of kinds) expect(ORIGIN_LABEL_KEY[kind]).toBeTruthy();
        expect(Object.keys(ORIGIN_LABEL_KEY).sort()).toEqual([...kinds].sort());
    });
});
