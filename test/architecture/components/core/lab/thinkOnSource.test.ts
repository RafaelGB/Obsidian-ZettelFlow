import { describe, it, expect, jest } from "@jest/globals";

const opened: unknown[][] = [];
jest.mock("architecture/plugin/services/ViewActivation", () => ({
    activateSurface: jest.fn(async (...args: unknown[]) => {
        opened.push(args);
    }),
}));

import { thinkOnSource } from "architecture/components/core/lab/thinkOnSource";

describe("thinkOnSource (#874 FR-6)", () => {
    it("opens Think on Home, on the source — not about it", () => {
        const app = {} as never;
        thinkOnSource(app, "Books/Thinking in Systems.epub");
        expect(opened).toEqual([[app, "zettelflow-home", "lab", { source: "Books/Thinking in Systems.epub" }]]);
    });
});
