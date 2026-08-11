import { describe, it, expect } from "@jest/globals";
import { isWaitSettings, isWaitNode } from "architecture/plugin/workflow/wait";

describe("WAIT settings and detection (FR-5)", () => {
    describe("isWaitSettings", () => {
        it("accepts the confirm marker, with or without a message", () => {
            expect(isWaitSettings({ mode: "confirm" })).toBe(true);
            expect(isWaitSettings({ mode: "confirm", message: "Ready?" })).toBe(true);
        });

        it("rejects a malformed or missing marker", () => {
            expect(isWaitSettings(undefined)).toBe(false);
            expect(isWaitSettings(null)).toBe(false);
            expect(isWaitSettings({})).toBe(false);
            expect(isWaitSettings({ mode: "delay" })).toBe(false);
            expect(isWaitSettings("confirm")).toBe(false);
        });
    });

    describe("isWaitNode", () => {
        it("is true for a node carrying a valid wait marker", () => {
            expect(isWaitNode({ wait: { mode: "confirm" } })).toBe(true);
        });

        it("is false for a node without a wait marker or with a malformed one", () => {
            expect(isWaitNode({})).toBe(false);
            expect(isWaitNode({ wait: undefined })).toBe(false);
            expect(isWaitNode({ wait: { mode: "delay" } })).toBe(false);
        });
    });
});
