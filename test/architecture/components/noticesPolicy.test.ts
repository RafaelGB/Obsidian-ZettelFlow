import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/** The body of one method, so a rule can be about *where* something happens. */
function methodBody(source: string, signature: string): string {
    const at = source.indexOf(signature);
    if (at === -1) return "";
    const rest = source.slice(at);
    const end = rest.indexOf("\n    }");
    return end === -1 ? rest : rest.slice(0, end);
}

/**
 * The messaging policy (#546 C), guarded.
 *
 * Where a message goes is decided by where the user is looking — off-surface is a `Notice`,
 * on-surface is an inline line, `log.error` always, and a user-triggered write **never** fails
 * silently. The policy is `docs/development/messaging-policy.md`; this holds the two halves of it a
 * test can hold: the toast budget only shrinks, and the #544-class fixes stay fixed.
 */
describe("the toast budget only shrinks (#546 C)", () => {
    // A ratcheting ceiling, like the off-grid px ceiling in themeGrid: the total number of `new
    // Notice(` may go *down* freely (an on-surface error becomes an inline line, a watched-it-happen
    // success is removed) but **up only deliberately** — raising this number is the review moment to
    // ask "is this message really off-surface?".
    //
    // History: 145 at the audit, before any policy. → 150 when the five #544-class silent failures
    // were given a voice (`CultivationService` advance + write, `PropertyHooksManager` sync + async,
    // `SelectorMenuModal` on close). It comes down from here as C2 removes redundant success toasts
    // and the 35 on-surface errors migrate to inline lines.
    const CEILING = 150;

    it("stays at or under the ceiling", () => {
        const total = sources(SRC).reduce(
            (count, file) => count + (readFileSync(file, "utf8").match(/new Notice\(/g)?.length ?? 0),
            0
        );
        expect({ total, ceiling: CEILING, over: total > CEILING }).toEqual({
            total,
            ceiling: CEILING,
            over: false,
        });
    });
});

describe("no user-triggered write fails silently (#546 C3, the #544 lesson)", () => {
    it("tells you when a cultivate move has no note to act on, in both paths", () => {
        const service = read("architecture/plugin/services/CultivationService.ts");
        // The `if (!file)` guard used to be a bare `return`. Both advance() and write() now surface it.
        for (const method of ["async advance(", "private async write("]) {
            const body = methodBody(service, method);
            expect({ method, guarded: /if \(!file\) \{[\s\S]*new Notice\(/.test(body) }).toEqual({
                method,
                guarded: true,
            });
        }
        expect(service.includes("if (!file) return;")).toBe(false);
    });

    it("keeps the unfinished note's loss from being silent on close", () => {
        const modal = read("zettelkasten/modals/SelectorMenuModal.ts");
        const close = methodBody(modal, "onClose(");
        expect(close).toContain("log.error");
        expect(close).toContain('t("note_builder_draft_keep_failed")');
    });

    it("surfaces a failed property-hooks save, sync and async", () => {
        const manager = read("config/modals/handlers/hooks/components/PropertyHooksManager.tsx");
        const persist = manager.slice(manager.indexOf("const persist ="), manager.indexOf("const handleDragEnd"));
        // Two failure paths: the synchronous build, and the awaited save that used to be `void`ed.
        expect((persist.match(/property_hooks_save_failed/g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect(persist).toContain(".catch(");
    });

    it("says so, inline, when the example flow cannot be created", () => {
        const tutorial = read("application/components/noteBuilder/WelcomeTutorial.tsx");
        // On-surface, so an inline line (not a toast): the `else` that used to be missing (#546 C3).
        expect(tutorial).toContain("setFailed(true)");
        expect(tutorial).toContain('t("onboarding_create_example_failed")');
        expect(tutorial.includes("new Notice(")).toBe(false);
    });

    it("stops warning 'already exists' and then overwriting the template anyway", () => {
        const modal = read("zettelkasten/modals/StepBuilderModal.ts");
        // The warning has to be true: a `return` now follows it, so the existing template is kept.
        expect(modal).toMatch(/step_template_already_exists[\s\S]{0,80}return;/);
    });
});
