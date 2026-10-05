import { describe, it, expect } from "@jest/globals";
import { settingsGlance, type GlanceText } from "config/settingsSummary";
import en from "architecture/lang/locale/en";

/** What a reader sees: the key resolved with its arguments, the way `t()` would. */
function read(text: GlanceText): string {
    if ("text" in text) return text.text;
    let value = (en as Record<string, string>)[text.key];
    expect({ key: text.key, exists: value !== undefined }).toEqual({ key: text.key, exists: true });
    // A counted text reads the `_one` form at one, the way `tCount` does.
    const one = (en as Record<string, string>)[`${text.key}_one`];
    if (text.count !== undefined && Math.abs(text.count) === 1 && one !== undefined) value = one;
    (text.args ?? []).forEach((arg, i) => (value = value.replace(`{${i}}`, arg)));
    return value;
}

/**
 * At a glance (#660, epic #659). It replaced *What is on right now*, which printed `undefined` for
 * every on/off value: the model returned a key and the tab read a value. Every card here resolves
 * to words a reader can read, and each one says which section it opens.
 */
describe("the settings at a glance (#660)", () => {
    it("is four cards, each opening its section", () => {
        expect(settingsGlance({}).map((card) => [card.id, card.section])).toEqual([
            ["create", "flows"],
            ["thinking", "thinking"],
            ["ai", "ai"],
            ["hooks", "automation"],
        ]);
    });

    it("never reads undefined, on a default install or a busy one", () => {
        const quiet = settingsGlance({});
        const busy = settingsGlance(
            {
                ribbonCanvas: "_ZettelFlow/flows/Zettel.canvas",
                ai: { enabled: true, model: "gpt-4o-mini", endpoint: "https://api.openai.com/v1/chat/completions" },
                cultivateFriction: false,
                cultivateMoves: ["connect"],
                hooks: { properties: { a: {}, b: { enabled: false } } },
            },
            { otherFlows: 2 }
        );
        for (const card of [...quiet, ...busy]) {
            for (const text of [card.value, card.detail]) {
                expect(read(text)).not.toMatch(/undefined|\{\d\}/);
            }
        }
    });

    it("says nothing creates notes yet, and warns about it", () => {
        const [create] = settingsGlance({});
        expect(create.tone).toBe("warn");
        expect(read(create.value)).toBe("Nothing yet");
    });

    it("names the canvas you create with, not its path, and counts the other flows", () => {
        const [create] = settingsGlance({ ribbonCanvas: "_ZettelFlow/flows/Zettel.canvas" }, { otherFlows: 2 });
        expect(create.tone).toBe("on");
        expect(read(create.value)).toBe("Zettel");
        expect(read(create.detail)).toBe("+ 2 other flows");
        expect(read(settingsGlance({ ribbonCanvas: "Z.canvas" }, { otherFlows: 1 })[0].detail)).toBe("+ 1 other flow");
    });

    it("counts the moves on and says whether it asks before revealing", () => {
        const thinking = settingsGlance({ cultivateMoves: ["connect", "challenge"], cultivateFriction: true })[1];
        expect(read(thinking.value)).toBe("2 of 5 moves");
        expect(read(thinking.detail)).toBe("Asks before revealing");
        expect(read(settingsGlance({ cultivateFriction: false })[1].detail)).toBe("Reveals at once");
        // Unset means every move, the way the session reads it.
        expect(read(settingsGlance({})[1].value)).toBe("5 of 5 moves");
    });

    it("reads AI as off by default, and names the model and host when on", () => {
        const off = settingsGlance({})[2];
        expect([off.tone, read(off.value)]).toEqual(["off", "Off"]);
        const on = settingsGlance({
            ai: { enabled: true, model: "llama3", endpoint: "http://localhost:11434/v1/chat/completions" },
        })[2];
        expect([on.tone, read(on.value), read(on.detail)]).toEqual(["on", "On · llama3", "localhost"]);
    });

    it("counts the hooks that run and the ones that are paused", () => {
        const hooks = settingsGlance({ hooks: { properties: { a: {}, b: { enabled: false }, c: { enabled: true } } } })[3];
        expect([hooks.tone, read(hooks.value), read(hooks.detail)]).toEqual(["on", "2 active", "1 paused"]);
        expect(settingsGlance({})[3].tone).toBe("off");
    });
});
