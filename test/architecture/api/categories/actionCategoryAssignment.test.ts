import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { ACTION_CATEGORIES, isActionCategory } from "architecture/api/categories/categories";

// test/architecture/api/categories → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
const actionSrc = (rel: string) => readFileSync(join(ROOT, "src", "actions", `${rel}.tsx`), "utf8");

/** The locked #152 mapping: Backlink = relations, the other 11 = manipulation, none = ai. */
const EXPECTED: Record<string, string> = {
    "backlink/BackLinkAction": "relations",
    "calendar/CalendarAction": "manipulation",
    "checkbox/CheckboxAction": "manipulation",
    "cssClasses/CssClassesAction": "manipulation",
    "dynamicSelector/DynamicSelectorAction": "manipulation",
    "number/NumberAction": "manipulation",
    "prompt/PromptAction": "manipulation",
    "script/ScriptAction": "manipulation",
    "selector/SelectorAction": "manipulation",
    "tags/TagsAction": "manipulation",
    "taskManagement/TaskManagementAction": "manipulation",
    "zettelId/ZettelIdAction": "manipulation",
};

function declaredCategory(source: string): string | undefined {
    return source.match(/category\s*=\s*"([a-z-]+)"/)?.[1];
}

describe("built-in action category assignment (#152, AC-1/AC-5/AC-7)", () => {
    it("assigns exactly the locked mapping, every token valid (AC-1, FR-6)", () => {
        for (const [rel, expected] of Object.entries(EXPECTED)) {
            const category = declaredCategory(actionSrc(rel));
            expect(category).toBe(expected);
            expect(isActionCategory(category)).toBe(true);
        }
    });

    it("ships no AI action — no built-in declares the ai category (AC-7)", () => {
        for (const rel of Object.keys(EXPECTED)) {
            expect(declaredCategory(actionSrc(rel))).not.toBe("ai");
        }
    });

    it("only uses tokens from the closed vocabulary", () => {
        for (const rel of Object.keys(EXPECTED)) {
            expect(ACTION_CATEGORIES as readonly string[]).toContain(declaredCategory(actionSrc(rel)));
        }
    });

    it("main.ts registerActions() still registers all twelve original built-ins (AC-5)", () => {
        const main = readFileSync(join(ROOT, "src", "main.ts"), "utf8");
        const registered = [...main.matchAll(/registerAction\(new (\w+)\(\)\)/g)].map((m) => m[1]);
        const expected = Object.keys(EXPECTED).map((rel) => rel.split("/")[1]);
        // Later slices add actions (e.g. #153 knowledge actions); assert none were removed/renamed.
        for (const cls of expected) expect(registered).toContain(cls);
    });
});
