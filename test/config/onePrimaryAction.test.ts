import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * **A mode's header carries one primary action** (#577, epic #574).
 *
 * #509 found eleven identically weighted buttons offering the cognitive moves — *"the thing the
 * picker exists to avoid, put back by hand"*. #542 found twenty-two controls in the 3D view and
 * answered *subtract, then a gear*. The same shape was one level down, in the headers, and it is
 * the reason the epic's motivating feature was unfindable: nothing on screen said which of the
 * Lab's controls mattered, because they were drawn by one helper with one class and one weight.
 *
 * The rule: **a header may carry one control that opens a capability.** A refresh, a filter and
 * moving around inside the mode are not that, and `ModeHeader.nav()` is where they go.
 *
 * What this scan can and cannot do, said plainly: it cannot tell a capability from navigation —
 * that is a judgement. What it can do is make the judgement **visible and singular**, because
 * `primary()` is called once per header and a second call is a diff someone reads. `ModeHeader`
 * also throws at runtime on the second call, so the two halves cover each other.
 */
const CORE = join(__dirname, "..", "..", "src", "architecture", "components", "core");

function renderers(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) renderers(full, out);
        else if (entry.endsWith("Renderer.ts")) out.push(full);
    }
    return out;
}

const name = (file: string) => file.split(/[\\/]/).pop() as string;

/** A comment mentioning `primary(` is documentation, and documentation draws nothing. */
function code(source: string): string {
    let block = false;
    return source
        .split("\n")
        .filter((raw) => {
            const line = raw.trim();
            if (block) {
                if (line.includes("*/")) block = false;
                return false;
            }
            if (line.startsWith("/*")) {
                if (!line.includes("*/")) block = true;
                return false;
            }
            return !line.startsWith("//") && !line.startsWith("*");
        })
        .join("\n");
}

const primaries = (source: string) => (code(source).match(/\.primary\(/g) ?? []).length;

describe("one primary action per mode header (#577)", () => {
    const files = renderers(CORE);

    it("reads every renderer, not a corner of them", () => {
        expect(files.length).toBeGreaterThan(8);
    });

    it("lets no renderer declare a second one", () => {
        const over = files
            .map((file) => ({ file: name(file), found: primaries(readFileSync(file, "utf8")) }))
            .filter((row) => row.found > 1);
        expect(over).toEqual([]);
    });

    it("has migrated the headers this epic is about", () => {
        // A rule nothing uses is a rule nobody follows. These three are the ones #577 re-ranked;
        // a fourth header arriving without `ModeHeader` is not caught here, and is caught in review.
        for (const file of ["LabRenderer.ts", "CultivateModeRenderer.ts", "EvolutionTimelineRenderer.ts"]) {
            const source = readFileSync(files.find((f) => name(f) === file) as string, "utf8");
            expect({ file, uses: source.includes("new ModeHeader(") }).toEqual({ file, uses: true });
            expect({ file, declares: primaries(source) }).toEqual({ file, declares: 1 });
        }
    });

    it("keeps the Lab's contextual controls out of the header rule (#577 FR-3)", () => {
        const lab = readFileSync(files.find((f) => name(f) === "LabRenderer.ts") as string, "utf8");
        // A cancel while arming, an undo where the card was, a clear beside the filter: these are
        // controls on the thing they act upon, two of them placed deliberately against a toast.
        for (const contextual of ["lab_arming_cancel", "lab_discard_undo", "lab_filter_clear", "lab_about_leave"]) {
            expect({ contextual, present: lab.includes(contextual) }).toEqual({ contextual, present: true });
        }
        // And crystallize stays in the picked bar, where the selection is — not promoted to a
        // header button that would be inert whenever nothing is picked.
        expect(lab).toContain('this.ghostAction(bar, t("lab_crystallize")');
    });

    it("reports a second primary rather than trusting anyone to notice one", () => {
        const planted = "bar.primary({ label: a });\n        bar.primary({ label: b });";
        expect(primaries(planted)).toBe(2);
    });

    it("does not count a primary that only appears in a comment", () => {
        expect(primaries("// bar.primary({});\n/* bar.primary({}); */")).toBe(0);
    });
});
