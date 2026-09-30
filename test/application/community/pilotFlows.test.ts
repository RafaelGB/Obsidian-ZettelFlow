import { describe, it, expect } from "@jest/globals";
import { join } from "path";
import { validateSystemTemplate, REGISTERED_ACTION_IDS } from "application/community/systemInstall";
import {
    loadPilot,
    shapeProblems,
    mechanicalOnCreationProblems,
    aiProblems,
    edgeCount,
    inlineSteps,
} from "./pilotShape";

/**
 * The pilot systems are drawn flows, not skeletal boxes (#612, Slice B).
 *
 * This is the shared harness the three rebuilt pilots (Zettelkasten/PARA/GTD) run through as each
 * lands (Slices C–E add its ref to `PILOTS`). Slice B proves the harness itself against the reference
 * fixture — the documented inline-flow pattern: one capture root branching to two phased outcomes,
 * drawn with edges + exits, mechanical-only on-creation.
 */
const FIXTURES = join(__dirname, "fixtures");

// Grows as the pilots land: Slice C adds zettelkasten-v2, D adds para-v2, E adds gtd.
const PILOTS: string[] = [join(FIXTURES, "reference-flow.zftemplate")];

describe("the inline-flow pilot pattern (#612)", () => {
    for (const file of PILOTS) {
        describe(file.split(/[/\\]/).pop() ?? file, () => {
            const template = loadPilot(file);

            it("is a valid, inline-linted system (Slice A guardrail)", () => {
                expect(validateSystemTemplate(template, REGISTERED_ACTION_IDS)).toEqual([]);
            });

            it("draws a flow: edges, inline steps, exactly one root", () => {
                expect(shapeProblems(template)).toEqual([]);
                expect(edgeCount(template)).toBeGreaterThan(0);
                expect(inlineSteps(template).length).toBeGreaterThan(1);
            });

            it("auto-writes only mechanical outputs on creation (§XII)", () => {
                expect(mechanicalOnCreationProblems(template)).toEqual([]);
            });

            it("carries no AI-category action (offline)", () => {
                expect(aiProblems(template)).toEqual([]);
            });
        });
    }
});
