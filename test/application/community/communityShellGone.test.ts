import { describe, it, expect } from "@jest/globals";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * **The modal shells are gone** (#798 AC-5, FR-9; epic #797 AC-2). Community is a view now: no file
 * declares or imports the old shells, and the files themselves do not exist. S2, S5 and S6 add what
 * they delete to this list.
 */
const SRC = join(__dirname, "..", "..", "..", "src");

const GONE = [
    "CommunityTemplatesModal",
    "ManageInstalledTemplatesModal",
    "CommunityHub",
    // #799: the Systems room installs in place — no system modal, no React gallery, no preview fetch.
    "CommunitySystemModal",
    "StaticTemplatesGallery",
    "SystemRehearsalPanel",
    "systemPreviewUrls",
];
const FILES = [
    "application/community/CommunityTemplatesModal.tsx",
    "application/community/ManageInstalledTemplatesModal.tsx",
    "application/community/components/CommunityHub.tsx",
    "application/community/CommunitySystemModal.tsx",
    "application/community/components/StaticTemplatesGallery.tsx",
    "application/community/SystemRehearsalPanel.ts",
];

/** What the Systems room mounts: native DOM, every file of it (#799 AC-11). */
const SYSTEMS_ROOM = [
    "application/community/view/systemsRoom.ts",
    "application/community/view/systemPanel.ts",
    "application/community/view/systemDrawingView.ts",
    "application/community/view/systemShots.ts",
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

    it("installs a system without a confirmation dialog (#799 AC-11)", () => {
        // The loose pieces' own dialogs keep theirs (FR-5: unchanged); the system install has none.
        const install = ["application/community/installSystem.ts", "application/community/undoInstall.ts", ...SYSTEMS_ROOM];
        const offenders = install.filter((file) => /ConfirmModal/.test(readFileSync(join(SRC, file), "utf8")));
        expect(offenders).toEqual([]);
    });

    it("deletes today's Learn tab, and draws the Learn room natively, with no emoji (#802 AC-11, FR-15)", () => {
        expect(existsSync(join(SRC, "application/community/components/LearnTab.tsx"))).toBe(false);
        const learn = readdirSync(join(SRC, "application/community/view")).filter((name) => /^learn.*\.ts$/.test(name));
        expect(learn.sort()).toEqual(["learnLesson.ts", "learnRoom.ts", "learnShots.ts"]);
        for (const name of learn) {
            const source = readFileSync(join(SRC, "application/community/view", name), "utf8");
            expect({ name, react: /from\s+["']react(-dom)?(\/client)?["']/.test(source), emoji: /\p{Extended_Pictographic}/u.test(source) }).toEqual({ name, react: false, emoji: false });
        }
    });

    it("mounts the Systems room without React (#799 AC-11)", () => {
        for (const file of SYSTEMS_ROOM) {
            const source = readFileSync(join(SRC, file), "utf8");
            expect({ file, react: /from\s+["']react(-dom)?(\/client)?["']/.test(source) }).toEqual({ file, react: false });
        }
    });
});
