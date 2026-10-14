import { describe, it, expect, jest } from "@jest/globals";

jest.mock("monkey-around", () => ({ around: () => () => undefined }));
jest.mock("tiny-jsonc", () => ({ parse: JSON.parse }));

import { ZettelFlowMenuComponent } from "starters/zcomponents/ZettelFlowMenuComponent";
import { registeredCommands } from "../helpers/registeredCommands";

type Entry = { command: string; labelKey: string; icon: string };
const GROUPS = (ZettelFlowMenuComponent as unknown as { GROUPS: Entry[][] }).GROUPS;
const entries = GROUPS.flat();

/** The ribbon menu's systems group (#798 AC-4, FR-7): one Community entry, a view of four rooms. */
describe("the ribbon menu leads to Community once (#798)", () => {
    it("holds exactly one Community entry, with its own name", () => {
        const community = entries.filter((entry) => entry.command === "open-community");
        expect(community).toEqual([{ command: "open-community", labelKey: "community_view_title", icon: "users" }]);
    });

    it("no longer lists the installed templates on their own: that is a room of Community", () => {
        expect(entries.map((entry) => entry.command)).not.toContain("open-manage-templates");
        expect(entries.map((entry) => entry.command)).not.toContain("browse-systems");
    });

    it("keeps every command id a hotkey may be bound to (§XI)", () => {
        for (const id of ["browse-systems", "open-community-templates", "open-manage-templates", "open-community"]) {
            expect({ id, registered: registeredCommands().includes(id) }).toEqual({ id, registered: true });
        }
    });
});
