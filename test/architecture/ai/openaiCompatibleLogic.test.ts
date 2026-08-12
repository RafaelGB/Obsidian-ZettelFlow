import { describe, it, expect } from "@jest/globals";
import {
    buildChatRequestBody,
    parseChatCompletion,
    AiResponseError,
} from "architecture/ai/openaiCompatibleLogic";

describe("openai-compatible logic (#156, FR-2, AC-2)", () => {
    it("builds a single-user-message chat request body", () => {
        expect(buildChatRequestBody("gpt-4o-mini", "hello")).toEqual({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "hello" }],
        });
    });

    it("parses the first choice's message content", () => {
        const json = { choices: [{ message: { role: "assistant", content: "the answer" } }] };
        expect(parseChatCompletion(json)).toBe("the answer");
    });

    it("throws AiResponseError on a malformed response", () => {
        expect(() => parseChatCompletion(null)).toThrow(AiResponseError);
        expect(() => parseChatCompletion({})).toThrow(AiResponseError);
        expect(() => parseChatCompletion({ choices: [] })).toThrow(AiResponseError);
        expect(() => parseChatCompletion({ choices: [{ message: {} }] })).toThrow(AiResponseError);
        expect(() => parseChatCompletion({ choices: [{ message: { content: "" } }] })).toThrow(AiResponseError);
    });
});
