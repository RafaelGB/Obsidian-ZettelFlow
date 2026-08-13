import { describe, it, expect } from "@jest/globals";
import { aiGateDecision, AiSettings } from "architecture/ai/aiGate";

const ready: AiSettings = {
    enabled: true,
    endpoint: "https://api.example.com/v1/chat/completions",
    apiKey: "sk-test",
    model: "gpt-4o-mini",
};

describe("aiGateDecision (#156, FR-1, AC-1)", () => {
    it("is disabled when the switch is off, even with a full config", () => {
        expect(aiGateDecision({ ...ready, enabled: false })).toBe("disabled");
    });

    it("is unconfigured when any of endpoint/apiKey/model is blank", () => {
        expect(aiGateDecision({ ...ready, endpoint: "" })).toBe("unconfigured");
        expect(aiGateDecision({ ...ready, apiKey: "   " })).toBe("unconfigured");
        expect(aiGateDecision({ ...ready, model: "" })).toBe("unconfigured");
    });

    it("is ready only when enabled and fully configured", () => {
        expect(aiGateDecision(ready)).toBe("ready");
    });
});
