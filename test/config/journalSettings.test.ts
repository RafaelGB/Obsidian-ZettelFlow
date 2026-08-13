import { describe, it, expect } from "@jest/globals";
import { DEFAULT_SETTINGS } from "config/typing";

describe("development journal settings defaults (#162, AC-5)", () => {
    it("ships the journal on by default with an empty tally", () => {
        expect(DEFAULT_SETTINGS.journal).toEqual({ enabled: true, counts: {} });
    });
});
