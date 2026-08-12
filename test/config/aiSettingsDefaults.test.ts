import { describe, it, expect } from "@jest/globals";
import { DEFAULT_SETTINGS } from "config/typing";

describe("AI settings defaults (#156, FR-1, AC-1)", () => {
    it("ships AI off by default with an empty provider config", () => {
        expect(DEFAULT_SETTINGS.ai).toEqual({
            enabled: false,
            endpoint: "",
            apiKey: "",
            model: "",
        });
    });
});
