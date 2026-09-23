import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { confirmsOn } from "architecture/components/core/confirmStep/ConfirmStep";

const ACTIONS = join(__dirname, "..", "..", "src", "actions");
const CORE = join(__dirname, "..", "..", "src", "architecture", "components", "core");

function componentFiles(): string[] {
    const out: string[] = [];
    for (const folder of readdirSync(ACTIONS)) {
        const dir = join(ACTIONS, folder);
        let entries: string[];
        try {
            entries = readdirSync(dir);
        } catch {
            continue; // index.ts and friends
        }
        for (const entry of entries) {
            if (/^[A-Z].*Component\.tsx$/.test(entry)) out.push(join(dir, entry));
        }
    }
    return out;
}

/**
 * Whether a component ends its step with the shared control — **or delegates to a core component
 * that does**, which is what the calendar and the checkbox do and is the shape to encourage.
 * Following the delegation is what keeps this a real check rather than an allowlist.
 */
function confirms(source: string): boolean {
    if (source.includes("ConfirmStep")) return true;
    const imported = /import \{([^}]+)\} from "architecture\/components\/core"/.exec(source);
    if (!imported) return false;
    return imported[1]
        .split(",")
        .map((name) => name.trim())
        .some((name) => {
            const folder = name.charAt(0).toLowerCase() + name.slice(1);
            try {
                return readFileSync(join(CORE, folder, `${name}.tsx`), "utf8").includes("ConfirmStep");
            } catch {
                return false; // not a core component with a folder of its own
            }
        });
}

/**
 * **One way to answer a step** (#547).
 *
 * The wizard asked a question nine different ways: a button the component owned (calendar,
 * checkbox), bare `Enter` (prompt, number), a `<button>` written inline (tags, css classes,
 * backlink), or the selection itself. Six implementations of *the control that ends this step*,
 * none of them carrying `mod-cta` — so in the flagship flow the primary action did not look like
 * Obsidian's primary action, and `Enter` meant four different things.
 */
describe("every step ends the same way (#547, AC-1, AC-2)", () => {
    const files = componentFiles();

    it("finds the components, so this is not passing on an empty list", () => {
        expect(files.length).toBeGreaterThanOrEqual(9);
    });

    it("writes no button of its own", () => {
        const offenders = files
            .filter((file) => readFileSync(file, "utf8").includes("<button"))
            .map((file) => file.split(/[\\/]/).pop() as string);
        // A step's button belongs to `ConfirmStep`, or the next one will be the seventh copy.
        expect(offenders).toEqual([]);
    });

    it("uses the shared control, itself or through the core component it delegates to", () => {
        const asking = files.filter((file) => {
            const src = readFileSync(file, "utf8");
            // A component that renders nothing asks nothing: zettel id generates its value.
            return !src.includes("return <></>");
        });

        const missing = asking
            .filter((file) => !confirms(readFileSync(file, "utf8")))
            .map((file) => file.split(/[\\/]/).pop() as string);

        // The dynamic selector is the one that genuinely has no button: choosing *is* the answer.
        expect(missing).toEqual(["DynamicSelectorComponent.tsx"]);
    });
});

describe("the control is Obsidian's primary button (#547, AC-3)", () => {
    const source = readFileSync(join(CORE, "confirmStep", "ConfirmStep.tsx"), "utf8");

    it("carries mod-cta, which the wizard never did", () => {
        expect(source).toContain('className="mod-cta"');
    });

    it("owns the hint, so a promised key is never a broken promise", () => {
        expect(source).toContain("confirm_hint_enter");
        expect(source).toContain("confirm_hint_mod_enter");
    });

    it("owns the refusal, so a step can decline without a Notice", () => {
        expect(source).toContain("canConfirm");
        expect(source).toContain("confirm-step--invalid");
    });

    it("is the only place in core that builds a confirm button", () => {
        const others = ["calendar/Calendar.tsx", "checkbox/Checkbox.tsx"]
            .filter((rel) => readFileSync(join(CORE, rel), "utf8").includes("<button"))
            .map((rel) => rel);
        expect(others).toEqual([]);
    });
});

describe("Enter means one thing (#547, AC-4)", () => {
    const key = (k: string, mod = false) => ({ key: k, metaKey: mod, ctrlKey: false });

    it("confirms a single-line answer on a bare Enter", () => {
        expect(confirmsOn(key("Enter"))).toBe(true);
        expect(confirmsOn(key("a"))).toBe(false);
    });

    it("does not confirm on Enter when the field is a text area", () => {
        // There, `Enter` is the newline the writer wanted -- the prompt step used to submit on it,
        // which made a multi-line box you could not write a second line in.
        expect(confirmsOn(key("Enter"), "mod-enter")).toBe(false);
        expect(confirmsOn(key("Enter", true), "mod-enter")).toBe(true);
    });

    it("does not treat a modified Enter as a plain one", () => {
        expect(confirmsOn(key("Enter", true))).toBe(false);
    });
});
