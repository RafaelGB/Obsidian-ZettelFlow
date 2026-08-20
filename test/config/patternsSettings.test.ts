import { describe, it, expect } from "@jest/globals";
import { DEFAULT_SETTINGS } from "config/typing";

describe("knowledge-pattern settings defaults (#200, FR-7)", () => {
    it("ships the post-index re-run on by default", () => {
        expect(DEFAULT_SETTINGS.patterns).toEqual({ rerunOnIndex: true });
    });
});
