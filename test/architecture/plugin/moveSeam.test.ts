import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// test/architecture/plugin → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");

/**
 * **Nothing records itself** (#491, epic #489).
 *
 * This is the promise that decides what the move log *is*. A log a vault event can append to is
 * not a record of your thinking — it is telemetry, and this project deleted its telemetry on
 * purpose (#360). Every move has to come from a gesture you made.
 *
 * Intent does not survive six months. So the rule is enforced the way the write seam is enforced:
 * the callers are **derived from the source**, and a new one fails the build until somebody puts
 * it on the list on purpose.
 */

/** Where the move log is defined — the door itself, not a caller. */
const DOOR = "architecture/plugin/thinking/MoveLog.ts";

/**
 * Every file permitted to record a move, and the gesture it serves. Adding a line here is the
 * decision this test exists to force — and the negative scan below is the part that cannot be
 * satisfied by adding one.
 */
const PERMITTED: Record<string, string> = {
    "architecture/components/core/lab/LabRenderer.ts":
        "the Lab's own gestures — fork, challenge, set aside, crystallize — each from a key or a button you pressed (#492)",
    "starters/zcomponents/MoveCommandsComponent.ts":
        "the right-click doors on a note, and the one helper Cultivate calls (#493, #496)",
    "zettelkasten/modals/QuickCaptureModal.ts":
        "externalize · capture — the one place that verb has ever meant something (#500)",
};

function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sources(full));
        else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
    }
    return out;
}

/**
 * Comments stripped: a rule about what the code does must be judged on code.
 *
 * Line-based on purpose. A block-comment regex is the obvious way and it is wrong here — an
 * opening block-comment marker inside a string or a regex literal makes it swallow real code up
 * to the next closing one, and the first version of this guardrail lost most of `LabRenderer`
 * that way, silently concluding the Lab records nothing.
 */
function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

const files = sources(SRC).map((path) => ({
    rel: path.slice(SRC.length + 1).replace(/\\/g, "/"),
    code: code(readFileSync(path, "utf8")),
}));

/**
 * A caller is any file that names the log and records through it — **however** it holds the
 * reference. The first version looked for `MoveLog.getInstance().record(` and missed the Lab
 * entirely, because the Lab keeps the instance in a local first. A seam guardrail that a local
 * variable defeats is decoration, and this one caught its own author.
 */
function records(file: { rel: string; code: string }): boolean {
    if (file.rel === DOOR) return false;
    return file.code.includes("MoveLog") && file.code.includes(".record(");
}

const callers = files.filter(records);

describe("the move log has one door (#491)", () => {
    it("is defined in exactly one place", () => {
        const definitions = files.filter((file) => /export class MoveLog\b/.test(file.code));
        expect(definitions.map((f) => f.rel)).toEqual([DOOR]);
    });

    it("is only walked through by a file that says why it may", () => {
        const unlisted = callers.map((file) => file.rel).filter((rel) => !(rel in PERMITTED));
        expect(unlisted).toEqual([]);
    });

    it("keeps the list honest — no permitted file that does not exist or does not record", () => {
        const recording = new Set(callers.map((file) => file.rel));
        expect(Object.keys(PERMITTED).filter((rel) => !recording.has(rel))).toEqual([]);
    });
});

describe("nothing records itself (#491)", () => {
    it("no recorder listens to a data event", () => {
        // The negative scan is the half that a name on a list cannot satisfy: a file that both
        // records a move and subscribes to a **vault or metadata** event is, by construction,
        // capable of writing down something you did not do.
        const listening = callers
            .filter((file) => /\b(vault|metadataCache)\s*\.\s*on\(/.test(file.code))
            .map((file) => file.rel);
        expect(listening).toEqual([]);
    });

    it("and a recorder that hooks the workspace only hooks a menu", () => {
        // `workspace.on("file-menu" | "editor-menu")` is deliberately allowed. It is a UI hook: it
        // fires to *offer* you something, and nothing is recorded until you click. The danger was
        // never the word `on` — it is a change in the vault causing a write (#496).
        for (const file of callers) {
            const hooks = [...file.code.matchAll(/workspace\s*\.\s*on\(\s*"([^"]+)"/g)].map((m) => m[1]);
            const offenders = hooks.filter((event) => event !== "file-menu" && event !== "editor-menu");
            expect({ file: file.rel, offenders }).toEqual({ file: file.rel, offenders: [] });
        }
    });

    it("no hook, no action and no index pass records one", () => {
        const forbidden = callers
            .map((file) => file.rel)
            .filter((rel) => rel.startsWith("hooks/") || rel.startsWith("actions/") || rel.includes("KnowledgeIndex"));
        expect(forbidden).toEqual([]);
    });

    it("the door itself subscribes to nothing", () => {
        const door = files.find((file) => file.rel === DOOR);
        expect(door).toBeDefined();
        expect(door?.code).not.toMatch(/\.on\(/);
        expect(door?.code).not.toMatch(/setInterval|registerEvent/);
    });

    it("and reaches no AI and no network", () => {
        const door = files.find((file) => file.rel === DOOR);
        expect(door?.code).not.toMatch(/\bfetch\(|requestUrl|ZfAi/);
    });
});
