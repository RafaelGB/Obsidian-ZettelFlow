import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/architecture/plugin/judgement → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (relative: string): string => readFileSync(join(ROOT, relative), "utf8");

/**
 * The judgement record is only useful if it is wired and, above all, **flushed** — a verdict lost on
 * unload is a verdict the user gave and the system forgot. The journal and the timeline are wired the
 * same way, so this guards the shape at the source level, the way the action-registration tests do.
 */
describe("the judgement record is wired into the plugin lifecycle (#336, FR-7)", () => {
    const main = read("src/main.ts");

    it("main.ts wires the log to settings at load", () => {
        expect(main).toMatch(/JudgementLog\.getInstance\(\)\.init\(this\)/);
    });

    it("main.ts flushes any pending verdict on unload", () => {
        expect(main).toMatch(/JudgementLog\.getInstance\(\)\.flush\(\)/);
    });

    it("the flush happens in onunload, beside the journal and the timeline", () => {
        const onunload = main.slice(main.indexOf("onunload()"));
        expect(onunload).toContain("JudgementLog.getInstance().flush()");
        expect(onunload).toContain("DevelopmentJournal.getInstance().flush()");
    });
});

describe("the judgement record ships with a default (#336)", () => {
    const typing = read("src/config/typing.ts");

    it("is on by default, because #337/#338/#339 have nothing to read otherwise", () => {
        expect(typing).toMatch(/judgements:\s*\{\s*enabled:\s*true,\s*log:\s*\[\]\s*\}/);
    });
});
