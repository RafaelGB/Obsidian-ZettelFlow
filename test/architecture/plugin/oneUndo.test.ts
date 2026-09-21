import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { basename, join } from "path";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";
import { migrateSettings } from "config/settingsMigration";

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * **One undo, in the moment it is useful** (#511, epic #504).
 *
 * *What ZettelFlow changed* was a panel of batches, kinds and origins — metainformation about
 * metainformation, and nobody opened it. Worse: every thought typed in the Lab landed in the
 * record it read, so an afternoon of thinking could evict the flow writes you would actually
 * want to take back.
 *
 * Deleting it alone would have been wrong, and that is the interesting part. The thirty-second
 * undo notice was offered from `VaultHooks` **only**, so for a flow — a note, a satellite, and
 * properties set on a third note you were not looking at — the panel was the *only* way back.
 * So the offer moved to the flow, and then the record no longer had to outlive it.
 */

function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sources(full));
        else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
    }
    return out;
}

function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

describe("the panel is gone (#511)", () => {
    it("has no Recent mode and no renderer for it", () => {
        const home = SURFACES.find((surface) => surface.viewType === "zettelflow-home");
        expect(home?.modes.map((mode) => mode.id)).not.toContain("recent");
        expect(sources(SRC).map((file) => basename(file))).not.toContain("ChangeRenderer.ts");
    });

    it("leaves no string behind that only the panel read", () => {
        // The `changes_` prefix survives on the five strings the **undo offer** uses; it was
        // named for the panel and now means the offer. Renaming five keys across two locales
        // would be churn for nothing, so the rule names the panel's own instead.
        const panelOnly = ["changes_title", "changes_intro", "changes_empty", "changes_by", "changes_kind_"];
        for (const locale of ["en", "es"]) {
            const source = read(`src/architecture/lang/locale/${locale}.ts`);
            for (const key of panelOnly) {
                expect({ locale, key, present: source.includes(key) }).toEqual({ locale, key, present: false });
            }
        }
    });
});

describe("one undo, offered from one place (#511)", () => {
    it("is offered by exactly one module", () => {
        const offering = sources(SRC)
            .map((file) => ({ rel: file.slice(SRC.length + 1).replace(/\\/g, "/"), code: code(readFileSync(file, "utf8")) }))
            .filter((file) => file.code.includes("export function offerUndo"))
            .map((file) => file.rel);
        expect(offering).toEqual(["architecture/plugin/writes/undoNotice.ts"]);
    });

    it("and both the flow and the hook reach it", () => {
        // A flow was the case with no undo at all once the panel went: it writes a note, a
        // satellite, and properties on a third note you were not looking at.
        expect(code(read("src/application/notes/NoteBuilder.ts"))).toContain("offerUndo(batch, path)");
        expect(code(read("src/hooks/VaultHooks.ts"))).toContain("offerUndo(batch, file.path)");
    });
});

describe("and the record stopped being a file (#511)", () => {
    it("lives in memory, so a reload empties it", () => {
        const recorder = code(read("src/architecture/plugin/writes/recordVaultWrite.ts"));
        expect(recorder).toContain("let buffered: VaultWrite[] = []");
        expect(recorder).not.toContain("settings.writeLog");
        expect(recorder).not.toContain("saveSettings");
    });

    it("outlives an offer and nothing more", () => {
        const log = code(read("src/application/writes/vaultWriteLog.ts"));
        expect(log).toContain("export const WRITE_WINDOW_MS = 2 * 60_000;");
        expect(log).not.toContain("RETENTION_DAYS");
        // The panel's own helpers went with it.
        expect(log).not.toContain("batchesOf");
        expect(log).not.toContain("markBatchUndone");
    });

    it("is smaller for it", () => {
        // 715 → 518 code lines across the reversibility layer, and `data.json` stops carrying a
        // week of write records on every vault. Counted, because "it feels lighter" is not a
        // measure and this epic said so up front.
        const now = [
            "src/application/writes/vaultWriteLog.ts",
            "src/application/writes/undoPlan.ts",
            "src/application/writes/undoOffer.ts",
            "src/application/writes/frontmatterDiff.ts",
            "src/application/writes/writeAttribution.ts",
            "src/architecture/plugin/writes/applyUndo.ts",
            "src/architecture/plugin/writes/recordVaultWrite.ts",
            "src/architecture/plugin/writes/undoNotice.ts",
        ].reduce((total, file) => total + code(read(file)).split("\n").filter((l) => l.trim() !== "").length, 0);
        expect({ now, ceiling: 560, over: now > 560 }).toEqual({ now, ceiling: 560, over: false });
    });

    it("drops the settings key on load, like the list it replaced", () => {
        const { settings, changed } = migrateSettings({ writeLog: { writes: [{ id: "x" }] } } as never);
        expect(changed).toBe(true);
        expect("writeLog" in settings).toBe(false);
    });
});
