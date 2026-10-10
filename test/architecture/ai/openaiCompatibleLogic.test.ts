import { describe, it, expect } from "@jest/globals";
import {
    buildChatRequestBody,
    parseChatCompletion,
    AiResponseError,
} from "architecture/ai/openaiCompatibleLogic";
import { AiVisionError, buildVisionRequestBody, classifyVisionFailure } from "architecture/ai/openaiCompatibleLogic";

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

describe("a request about an image (#748, FR-3, FR-4)", () => {
    const image = { mime: "image/png", base64: "iVBORw0KGgo=" };

    it("sends the system guard first, then one user message of the prompt and the image as a data URL", () => {
        const body = buildVisionRequestBody("m", "read this", image, { system: "guard", maxTokens: 300 });
        expect(body.messages).toHaveLength(2);
        expect(body.messages[0]).toEqual({ role: "system", content: "guard" });
        expect(body.messages[1]).toEqual({
            role: "user",
            content: [
                { type: "text", text: "read this" },
                { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
            ],
        });
        expect(body.max_tokens).toBe(300);
        expect(body.model).toBe("m");
    });

    it("classifies a refused image by its status alone", () => {
        for (const status of [400, 415, 422]) expect(classifyVisionFailure(status)).toBe("no-image");
        for (const status of [401, 429, 500, 503]) expect(classifyVisionFailure(status)).toBe("failed");
        const error = new AiVisionError("no-image", 415);
        expect(error.kind).toBe("no-image");
        expect(error.message).toMatch(/415/);
    });
});
