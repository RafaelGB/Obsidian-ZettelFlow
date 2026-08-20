import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { isActionKind } from "architecture/knowledge/taxonomy/actionKind";

// test/architecture/api/categories → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
function actionSrc(rel: string): string {
    for (const ext of [".tsx", ".ts"]) {
        const p = join(ROOT, "src", "actions", `${rel}${ext}`);
        if (existsSync(p)) return readFileSync(p, "utf8");
    }
    throw new Error(`action source not found: ${rel}`);
}

/** The Command/Query classification of the 31 registered built-ins (#265, epic #262 Phase 3). */
const EXPECTED: Record<string, "command" | "query"> = {
    // Commands (14): manipulation (11) + relation/source mutators (3).
    "selector/SelectorAction": "command",
    "prompt/PromptAction": "command",
    "number/NumberAction": "command",
    "calendar/CalendarAction": "command",
    "checkbox/CheckboxAction": "command",
    "tags/TagsAction": "command",
    "cssClasses/CssClassesAction": "command",
    "script/ScriptAction": "command",
    "taskManagement/TaskManagementAction": "command",
    "dynamicSelector/DynamicSelectorAction": "command",
    "zettelId/ZettelIdAction": "command",
    "backlink/BackLinkAction": "command",
    "createSemanticRelation/CreateSemanticRelationAction": "command",
    "attachSource/AttachSourceAction": "command",
    // Queries (17): pure/offline (11) + AI network (6).
    "detectOrphan/DetectOrphanAction": "query",
    "calculateMaturity/CalculateMaturityAction": "query",
    "findContradiction/FindContradictionAction": "query",
    "findUnansweredQuestion/FindUnansweredQuestionAction": "query",
    "suggestNextMove/SuggestNextMoveAction": "query",
    "thinkingSimulator/ThinkingSimulatorAction": "query",
    "findRelated/FindRelatedAction": "query",
    "suggestLink/SuggestLinkAction": "query",
    "extractClaims/ExtractClaimsAction": "query",
    "compareClaims/CompareClaimsAction": "query",
    "findSources/FindSourcesAction": "query",
    "ai/SummarizeAction": "query",
    "ai/ClassifyAction": "query",
    "ai/GenerateQuestionsAction": "query",
    "ai/ChallengeIdeaAction": "query",
    "ai/SynthesizeAction": "query",
    "ai/SuggestConnectionsAction": "query",
};

/** The declared `kind = "…"` class field, or undefined when the action hasn't declared one yet. */
function declaredKind(source: string): string | undefined {
    return source.match(/kind\s*=\s*"(command|query)"/)?.[1];
}

describe("built-in action kind classification (#265, FR-2/FR-3, AC-2/AC-4)", () => {
    it("every DECLARED kind is a valid token and matches the locked classification", () => {
        for (const [rel, expected] of Object.entries(EXPECTED)) {
            const kind = declaredKind(actionSrc(rel));
            if (kind === undefined) continue; // not yet declared — tightened as the phase lands
            expect(isActionKind(kind)).toBe(true);
            expect(kind).toBe(expected);
        }
    });

    it("declared command and query sets are disjoint", () => {
        const declared = Object.keys(EXPECTED)
            .map((rel) => [rel, declaredKind(actionSrc(rel))] as const)
            .filter(([, k]) => k !== undefined);
        const commands = new Set(declared.filter(([, k]) => k === "command").map(([rel]) => rel));
        const queries = declared.filter(([, k]) => k === "query").map(([rel]) => rel);
        for (const q of queries) expect(commands.has(q)).toBe(false);
    });

    it("main.ts still registers all 31 built-ins (no removal/rename)", () => {
        const main = readFileSync(join(ROOT, "src", "main.ts"), "utf8");
        const registered = [...main.matchAll(/registerAction\(new (\w+)\(\)\)/g)].map((m) => m[1]);
        const expectedClasses = Object.keys(EXPECTED).map((rel) => rel.split("/")[1]);
        expect(expectedClasses.length).toBe(31);
        for (const cls of expectedClasses) expect(registered).toContain(cls);
    });
});
