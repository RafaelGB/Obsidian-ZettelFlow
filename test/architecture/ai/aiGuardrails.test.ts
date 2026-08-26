import { describe, it, expect } from "@jest/globals";
import {
    capText,
    aiMaxInputChars,
    aiMaxOutputTokens,
    DEFAULT_AI_MAX_INPUT_CHARS,
    DEFAULT_AI_MAX_OUTPUT_TOKENS,
    type AiSettings,
} from "architecture/ai/aiGate";
import { buildChatRequestBody } from "architecture/ai/openaiCompatibleLogic";
import { AI_SYSTEM_GUARD, delimitContent, isEndpointAllowed, sanitizeAiText } from "architecture/ai/promptSafety";

const base: AiSettings = { enabled: true, endpoint: "https://x/v1", apiKey: "k", model: "m" };

describe("AI input caps (#301 S1)", () => {
    it("capText returns short text unchanged and truncates long text with a marker", () => {
        expect(capText("hello", 100)).toBe("hello");
        const out = capText("a".repeat(50), 10);
        expect(out.startsWith("a".repeat(10))).toBe(true);
        expect(out.startsWith("a".repeat(11))).toBe(false); // only the first 10 content chars survive
        expect(out).toContain("truncated");
    });

    it("effective caps fall back to defaults for missing/invalid values", () => {
        expect(aiMaxInputChars(base)).toBe(DEFAULT_AI_MAX_INPUT_CHARS);
        expect(aiMaxInputChars({ ...base, maxInputChars: 20_000 })).toBe(20_000);
        expect(aiMaxInputChars({ ...base, maxInputChars: 10 })).toBe(DEFAULT_AI_MAX_INPUT_CHARS); // too small
        expect(aiMaxOutputTokens(base)).toBe(DEFAULT_AI_MAX_OUTPUT_TOKENS);
        expect(aiMaxOutputTokens({ ...base, maxOutputTokens: 256 })).toBe(256);
        expect(aiMaxOutputTokens({ ...base, maxOutputTokens: 0 })).toBe(DEFAULT_AI_MAX_OUTPUT_TOKENS);
    });
});

describe("chat request body (#301 S1/S3)", () => {
    it("sends a system guard message before the user prompt and a max_tokens bound", () => {
        const body = buildChatRequestBody("m", "hi", { system: AI_SYSTEM_GUARD, maxTokens: 500 });
        expect(body.messages[0]).toEqual({ role: "system", content: AI_SYSTEM_GUARD });
        expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
        expect(body.max_tokens).toBe(500);
    });

    it("omits the system message and max_tokens when not provided", () => {
        const body = buildChatRequestBody("m", "hi");
        expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
        expect(body.max_tokens).toBeUndefined();
    });
});

describe("prompt/output safety (#301 S3/S4)", () => {
    it("delimits untrusted content with note-content tags", () => {
        expect(delimitContent("x")).toBe("<note-content>\nx\n</note-content>");
    });

    it("sanitizeAiText neutralises template tokens and trims", () => {
        const out = sanitizeAiText("  {{title}} and }} stuff  ");
        expect(out).not.toContain("{{");
        expect(out).not.toContain("}}");
        expect(out.startsWith(" ")).toBe(false);
    });

    it("sanitizeAiText caps length", () => {
        expect(sanitizeAiText("a".repeat(100), 10).length).toBe(10);
    });
});

describe("endpoint safety (#301 S5)", () => {
    it("allows https and loopback http, rejects remote http and other schemes", () => {
        expect(isEndpointAllowed("https://api.openai.com/v1/chat/completions")).toBe(true);
        expect(isEndpointAllowed("http://localhost:1234/v1")).toBe(true);
        expect(isEndpointAllowed("http://127.0.0.1:8080/v1")).toBe(true);
        expect(isEndpointAllowed("http://evil.example.com/v1")).toBe(false);
        expect(isEndpointAllowed("file:///etc/passwd")).toBe(false);
        expect(isEndpointAllowed("not a url")).toBe(false);
    });
});
