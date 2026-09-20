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
    // #492 fills this with the Lab's own actions; #493 with the note commands. Empty here on
    // purpose: M2 ships the door and its guarantees, and nothing yet walks through it.
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

/** Comments stripped: a rule about what the code does must be judged on code. */
function code(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
}

const files = sources(SRC).map((path) => ({
    rel: path.slice(SRC.length + 1).replace(/\\/g, "/"),
    code: code(readFileSync(path, "utf8")),
}));

const callers = files.filter(
    (file) => file.rel !== DOOR && /MoveLog\s*\.\s*getInstance\(\)[\s\S]{0,40}\.record\(/.test(file.code)
);

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
    it("no recorder also listens to the vault", () => {
        // The negative scan is the half that a name on a list cannot satisfy: a file that both
        // records a move and subscribes to a vault or metadata event is, by construction, capable
        // of writing down something you did not do.
        const listening = callers
            .filter((file) => /\b(vault|metadataCache|workspace)\s*\.\s*on\(/.test(file.code))
            .map((file) => file.rel);
        expect(listening).toEqual([]);
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
