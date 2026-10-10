import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { AiVisionError } from "architecture/ai/openaiCompatibleLogic";
import { OpenAiCompatibleProvider } from "architecture/ai/OpenAiCompatibleProvider";
import { __setRequestUrl, type RequestUrlResponse } from "obsidian";
import type { AiSettings } from "architecture/ai/aiGate";

const settings: AiSettings = { enabled: true, endpoint: "https://api.example.com/v1/chat", apiKey: "secret", model: "m" };

interface CapturedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
}

afterEach(() => {
    __setRequestUrl(async () => ({ status: 200, json: {} }));
});

describe("OpenAiCompatibleProvider (#317 S6 — mocked requestUrl, never a real request)", () => {
    it("returns the completion and sends the system guard + max_tokens + bearer key", async () => {
        let captured: CapturedRequest | undefined;
        __setRequestUrl(async (opts): Promise<RequestUrlResponse> => {
            captured = opts as CapturedRequest;
            return { status: 200, json: { choices: [{ message: { content: "hello" } }] } };
        });

        const out = await new OpenAiCompatibleProvider(settings).complete("summarise this");
        expect(out).toBe("hello");

        expect(captured!.url).toBe(settings.endpoint);
        expect(captured!.headers.Authorization).toBe("Bearer secret");
        const body = JSON.parse(captured!.body);
        expect(body.model).toBe("m");
        expect(body.messages[0].role).toBe("system"); // the injection guard
        expect(body.messages[1]).toEqual({ role: "user", content: "summarise this" });
        expect(body.max_tokens).toBeGreaterThan(0); // the cost cap
    });

    it("throws a status-only error on a non-2xx response (no body/key leaked)", async () => {
        __setRequestUrl(async () => ({ status: 500, json: { error: "boom" } }));
        await expect(new OpenAiCompatibleProvider(settings).complete("x")).rejects.toThrow(/500/);
    });

    it("blocks a non-https endpoint and never sends note content", async () => {
        let called = false;
        __setRequestUrl(async () => {
            called = true;
            return { status: 200, json: {} };
        });
        const bad = new OpenAiCompatibleProvider({ ...settings, endpoint: "http://evil.example.com/v1" });
        await expect(bad.complete("secret note content")).rejects.toThrow(/https/);
        expect(called).toBe(false); // the request was never made
    });

    it("throws on a malformed completion shape", async () => {
        __setRequestUrl(async () => ({ status: 200, json: { choices: [] } }));
        await expect(new OpenAiCompatibleProvider(settings).complete("x")).rejects.toThrow();
    });
});

describe("OpenAiCompatibleProvider.see (#748 — one ink note's image, mocked requestUrl)", () => {
    const image = { mime: "image/png" as const, base64: "AAAA" };

    it("sends the guard, the bearer key, max_tokens and the image at the same endpoint", async () => {
        let captured: CapturedRequest | undefined;
        __setRequestUrl(async (opts): Promise<RequestUrlResponse> => {
            captured = opts as CapturedRequest;
            return { status: 200, json: { choices: [{ message: { content: "{\"reading\":\"hi\"}" } }] } };
        });
        const out = await new OpenAiCompatibleProvider(settings).see("read", image);
        expect(out).toBe('{"reading":"hi"}');
        expect(captured!.url).toBe(settings.endpoint);
        expect(captured!.headers.Authorization).toBe("Bearer secret");
        const body = JSON.parse(captured!.body);
        expect(body.messages[0].role).toBe("system");
        expect(body.messages[1].content[1].image_url.url).toBe("data:image/png;base64,AAAA");
        expect(body.max_tokens).toBeGreaterThan(0);
    });

    it("refuses a non-https endpoint before anything is sent", async () => {
        let called = false;
        __setRequestUrl(async () => {
            called = true;
            return { status: 200, json: {} };
        });
        await expect(new OpenAiCompatibleProvider({ ...settings, endpoint: "http://evil.example.com/v1" }).see("read", image)).rejects.toThrow(/https/);
        expect(called).toBe(false);
    });

    it("throws status-only errors: a refused image is no-image, the rest failed", async () => {
        __setRequestUrl(async () => ({ status: 415, json: { error: "the image text" } }));
        const refused = await new OpenAiCompatibleProvider(settings).see("read", image).catch((e: unknown) => e);
        expect(refused).toBeInstanceOf(AiVisionError);
        expect((refused as AiVisionError).kind).toBe("no-image");
        expect(String(refused)).not.toContain("the image text");
        __setRequestUrl(async () => ({ status: 500, json: {} }));
        const failed = await new OpenAiCompatibleProvider(settings).see("read", image).catch((e: unknown) => e);
        expect((failed as AiVisionError).kind).toBe("failed");
    });

    it("times out at 30 s", async () => {
        jest.useFakeTimers();
        try {
            __setRequestUrl(() => new Promise(() => undefined));
            const pending = new OpenAiCompatibleProvider(settings).see("read", image).catch((e: unknown) => e);
            await jest.advanceTimersByTimeAsync(30_000);
            expect(String(await pending)).toMatch(/timed out after 30000ms/);
        } finally {
            jest.useRealTimers();
        }
    });
});
