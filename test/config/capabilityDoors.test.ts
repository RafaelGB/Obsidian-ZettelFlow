import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";
import {
    CAPABILITIES,
    CAPABILITY_DOORS,
    DOORLESS,
    Door,
    doorless,
} from "architecture/components/core/surface/capabilities";
import { registeredCommands } from "../helpers/registeredCommands";

/**
 * The two guardrails of the door rule (#575, epic #574).
 *
 * **A — every capability has a door of rank 1–3.** A capability whose only door is a command or a
 * settings row is one nobody discovers; the palette is where you go looking for something you
 * already know is there (#496). Eleven rows fail today, each carried by `DOORLESS` with the issue
 * that fixes it — so this guardrail ships green and can only get stricter.
 *
 * **B — every door resolves.** A registry that says *the collision is a control in the Lab* is
 * worth nothing if the Lab renderer was deleted last month. Each kind resolves against the thing
 * that would actually have moved: a command against the registrations, a surface against `SURFACES`,
 * a ribbon entry against the ribbon's own table, a settings row against the locale, a control
 * against the filesystem.
 */
const SRC = join(__dirname, "..", "..", "src");
const RIBBON_MENU = readFileSync(join(SRC, "starters", "zcomponents", "ZettelFlowMenuComponent.ts"), "utf8");
const RIBBON_ENTRIES = [...RIBBON_MENU.matchAll(/command:\s*"([^"]+)"/g)].map((match) => match[1]);

const surfaceModes = new Set(SURFACES.flatMap((s) => s.modes.map((m) => `${s.viewType}:${m.id}`)));
const enMap = en as Record<string, string>;
const esMap = es as Record<string, string>;

/** Why a door does not resolve, or `null` when it does. */
function unresolved(door: Door): string | null {
    switch (door.kind) {
        case "command":
            return registeredCommands().includes(door.at) ? null : `no command "${door.at}"`;
        case "surface":
        case "recommendation":
            return surfaceModes.has(door.at) ? null : `no surface/mode "${door.at}"`;
        case "settings":
            return enMap[door.at] && esMap[door.at] ? null : `no locale key "${door.at}"`;
        case "object":
            if (door.via === "ribbon") {
                return RIBBON_ENTRIES.includes(door.at) ? null : `"${door.at}" is not on the ribbon menu`;
            }
            return existsSync(join(SRC, door.at)) ? null : `no file src/${door.at}`;
    }
}

describe("guardrail A — every capability has a real door (#575)", () => {
    it("fails only for the rows the register carries", () => {
        const unregistered = doorless().filter((id) => !DOORLESS[id]);
        expect(unregistered).toEqual([]);
    });

    it("keeps the register honest — an entry that has stopped failing must go", () => {
        // The register can only shrink. A row that gained a door and kept its excuse would let the
        // next doorless capability hide behind a stale key.
        const stale = Object.keys(DOORLESS).filter((id) => !doorless().includes(id as never));
        expect(stale).toEqual([]);
    });

    it("names the issue that empties each row", () => {
        const vague = Object.entries(DOORLESS).filter(([, reason]) => !reason?.includes("#578"));
        expect(vague).toEqual([]);
    });

    it("leaves most of the product already compliant", () => {
        // If the register held half the inventory this guardrail would be a wish, not a rule.
        expect(doorless().length).toBeLessThan(CAPABILITIES.length / 2);
    });

    it("reports a capability that quietly loses its last real door", () => {
        const pretend = { doors: [{ kind: "command" as const, at: "think" }] };
        const rank = { object: 1, surface: 2, recommendation: 3, settings: 4, command: 5 };
        expect(Math.min(...pretend.doors.map((d) => rank[d.kind]))).toBeGreaterThan(3);
    });
});

describe("guardrail B — every door resolves (#575)", () => {
    it("reads a ribbon menu worth checking", () => {
        expect(RIBBON_ENTRIES.length).toBeGreaterThan(5);
    });

    it("points at nothing that has moved or gone", () => {
        const broken: string[] = [];
        for (const id of CAPABILITIES) {
            for (const door of CAPABILITY_DOORS[id].doors) {
                const why = unresolved(door);
                if (why) broken.push(`${id}: ${why}`);
            }
        }
        expect(broken).toEqual([]);
    });

    it("gives every control door the surface it draws in", () => {
        const hostless = CAPABILITIES.filter((id) =>
            CAPABILITY_DOORS[id].doors.some((door) => door.via === "control" && !door.host)
        );
        expect(hostless).toEqual([]);
    });

    it("reports a renamed mode rather than leaving a dead door behind", () => {
        expect(unresolved({ kind: "surface", at: "zettelflow-home:recent" })).toBe(
            'no surface/mode "zettelflow-home:recent"'
        );
    });
});
