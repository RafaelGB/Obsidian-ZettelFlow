import { describe, it, expect } from "@jest/globals";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * **The modal shells are gone** (#798 AC-5, FR-9; epic #797 AC-2). Community is a view now: no file
 * declares or imports the old shells, and the files themselves do not exist. S2, S5 and S6 add what
 * they delete to this list.
 */
const SRC = join(__dirname, "..", "..", "..", "src");

const GONE = ["CommunityTemplatesModal", "ManageInstalledTemplatesModal", "CommunityHub"];
const FILES = [
    "application/community/CommunityTemplatesModal.tsx",
    "application/community/ManageInstalledTemplatesModal.tsx",
    "application/community/components/CommunityHub.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
}

describe("the Community modal shells are gone (#798)", () => {
    it("deletes their files", () => {
        expect(FILES.filter((file) => existsSync(join(SRC, file)))).toEqual([]);
    });

    it("leaves no file that declares or imports one", () => {
        const pattern = new RegExp(`\\b(${GONE.join("|")})\\b`);
        const offenders = walk(SRC).filter((file) => pattern.test(readFileSync(file, "utf8")));
        expect(offenders).toEqual([]);
    });
});
