import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { stateTransition } from "architecture/knowledge/lifecycle/transition";
import { LIFECYCLE_STATES } from "architecture/knowledge/lifecycle/states";

// test/architecture/components/core/cultivate → 5 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const RENDERER = readFileSync(
    join(ROOT, "src/architecture/components/core/cultivate/CultivateModeRenderer.ts"),
    "utf8"
);

/** The body of one method, so a rule about it is not judged on the rest of the file. */
function method(source: string, signature: string): string {
    const start = source.indexOf(signature);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf("\n    }", start));
}

/**
 * A promotion is a fact about two states (#580).
 *
 * Cultivate showed it as a new emoji, which cannot say where you came from — and, worse, showed
 * nothing at all, because the card never learned that the note had changed.
 */
describe("a lifecycle change is an object before it is a sentence (#580)", () => {
    it("names both ends, from the locale layer", () => {
        const moved = stateTransition("fleeting", "literature");
        expect(moved).toEqual({
            from: "fleeting",
            to: "literature",
            fromKey: "lifecycle_state_fleeting",
            toKey: "lifecycle_state_literature",
        });
    });

    it("has nothing to say when nothing moved", () => {
        expect(stateTransition("literature", "literature")).toBeNull();
    });

    it("has nothing to say about a token it does not know", () => {
        // The state property can be edited by hand, and *is* in real vaults: the reference vault
        // carries `🔒 Closed` and `✅ Resolved` from another system entirely.
        expect(stateTransition("🔒 Closed", "literature")).toBeNull();
        expect(stateTransition("fleeting", "done")).toBeNull();
        expect(stateTransition(undefined, "fleeting")).toBeNull();
        expect(stateTransition("fleeting", null)).toBeNull();
    });

    it("describes every transition the machine allows, and some it does not", () => {
        // Deliberately wider than `canTransition`: this says what happened, not what may happen.
        for (const from of LIFECYCLE_STATES) {
            for (const to of LIFECYCLE_STATES) {
                expect(stateTransition(from, to) === null).toBe(from === to);
            }
        }
    });
});

/**
 * The move you just made redraws (#580).
 *
 * Asserted on the source because the defect is *when a pane redraws*, and there is no DOM here.
 * The rules are the two redraws the Lab already paid for: one because you acted, one because
 * something changed while you were writing, and never one guard for both.
 */
describe("every applied move asks for the redraw (#580)", () => {
    const appliers = [
        "private async linkNote(",
        "private async addQuestion(",
        "private async addCounterpoint(",
        "private async addSource(",
        "private async advanceState(",
    ];

    it("calls it from all five, and none of them waits for a debounce", () => {
        for (const signature of appliers) {
            const body = method(RENDERER, signature);
            expect({ signature, calls: body.includes("redrawAfterMove(") }).toEqual({
                signature,
                calls: true,
            });
            expect({ signature, debounced: body.includes("debounced") }).toEqual({
                signature,
                debounced: false,
            });
            expect({ signature, guarded: body.includes("refreshTarget(") }).toEqual({
                signature,
                guarded: false,
            });
        }
    });

    it("re-reads the note before it re-derives", () => {
        // The write, the index upsert and this are three steps across two event loops, and
        // Obsidian does not promise their order.
        const body = method(RENDERER, "private async redrawAfterMove(");
        expect(body).toContain("onModify(");
        expect(body.indexOf("onModify(")).toBeLessThan(body.indexOf("recompute("));
    });

    it("never refuses the redraw you asked for", () => {
        const body = method(RENDERER, "private async redrawAfterMove(");
        expect(body).not.toContain("activeElement");
    });

    it("refuses the other one while you are typing", () => {
        const body = method(RENDERER, "private refreshTarget(");
        expect(body).toContain("HTMLTextAreaElement");
        expect(body).toContain("HTMLInputElement");
        expect(body).toContain("return");
    });

    it("listens to the note's own change, not only the vault's", () => {
        expect(RENDERER).toContain('this.app.metadataCache.on("changed"');
        expect(RENDERER).toContain("file.path === this.targetPath");
        // Registered through the component, so it goes away with the mode.
        const listener = RENDERER.slice(RENDERER.indexOf('metadataCache.on("changed"') - 200);
        expect(listener).toContain("this.registerEvent(");
    });

    it("keeps the vault-wide debounce for the vault-wide events", () => {
        for (const event of ["resolved", "rename", "delete"]) {
            expect(RENDERER).toContain(`"${event}", debounced`);
        }
    });

    it("says what the state became, and reads the label it was given", () => {
        expect(RENDERER).toContain("stateTransition(");
        expect(RENDERER).toContain('"cultivate_state_transition"');
        expect(RENDERER).toContain("cultivate-state-changed");
        // The advance control's label is read on every render, never cached on the instance.
        expect(RENDERER).not.toMatch(/this\.(proposedState|advanceLabel)\b/);
    });

    it("writes nothing itself — the service owns the writes", () => {
        // The #493 rule, still true after this: `onModify` is a read of the note, not a write.
        expect(RENDERER).not.toMatch(/FrontmatterService|processFrontMatter|\.modify\(/);
    });
});
