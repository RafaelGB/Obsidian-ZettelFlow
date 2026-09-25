import { CAPABILITIES, CAPABILITY_DOORS, DOORLESS, Door, depthOf } from "./capabilities";

/**
 * The audit table, generated from {@link CAPABILITY_DOORS} (#575, epic #574).
 *
 * Generated rather than written, and checked in rather than built on demand, for the same reason
 * `docs/api/reference.md` is: a table somebody maintains by hand is a table that is wrong by the
 * second release. `capabilityAudit.test.ts` compares the checked-in page against this function, so
 * a door that moves without the page being regenerated fails the build.
 *
 * No `obsidian`, no locale lookup — a `t()` here would put the audit in whichever language the test
 * runner happened to be in. The key is the stable name; the page is for contributors.
 */

const MARK = "<!-- generated: capabilityAudit -->";

function describeDoor(door: Door): string {
    switch (door.kind) {
        case "object":
            if (door.via === "ribbon") return `ribbon → \`${door.at}\``;
            if (door.via === "menu") return `note menu (\`${short(door.at)}\`)`;
            return `control in ${door.host} (\`${short(door.at)}\`)`;
        case "surface":
            return `surface \`${door.at}\``;
        case "recommendation":
            return `recommended on \`${door.at}\``;
        case "settings":
            return `settings → \`${door.at}\``;
        case "command":
            return `\`${door.at}\``;
    }
}

const short = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** The markdown table: capability · owner · depth · doors, in declaration order. */
export function capabilityAuditTable(): string {
    const rows = CAPABILITIES.map((id) => {
        const capability = CAPABILITY_DOORS[id];
        const doors = capability.doors.map(describeDoor).join(" · ");
        const depth = depthOf(id);
        const flag = DOORLESS[id] ? ` ⚠️ ${DOORLESS[id]}` : "";
        return `| \`${id}\` | ${capability.owner} | ${depth} | ${doors}${flag} |`;
    });
    return [
        MARK,
        "",
        "| capability | owner | depth | doors, best first |",
        "|---|---|---|---|",
        ...rows,
        "",
        MARK,
    ].join("\n");
}

/** The marker the checked-in page wraps the generated block in. */
export const AUDIT_MARK = MARK;
