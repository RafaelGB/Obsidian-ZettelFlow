import { afterEach, describe, it, expect } from "@jest/globals";
import { Platform } from "obsidian";
import { DISCUSSIONS_URL, REPO_URL, bugReportFields, detectPlatformOption, newIssueUrl } from "application/community/githubContribute";

const plugin = { manifest: { version: "3.7.0" } };

/** The bug report arrives diagnosable (#803 AC-3): what the card shows is what the form receives. */
describe("the bug report's environment (#803 AC-3)", () => {
    const before = { ...Platform };
    afterEach(() => Object.assign(Platform, before));

    it("is the plugin version, the Obsidian version and the platform", () => {
        expect(bugReportFields(plugin as never)).toEqual({ plugin_version: "3.7.0", obsidian_version: "1.13.1", platform: "Desktop — Windows" });
    });

    it("leaves the platform out when it is none the form offers", () => {
        Object.assign(Platform, { isWin: false, isMacOS: false, isLinux: false, isAndroidApp: false, isIosApp: false });
        expect(detectPlatformOption()).toBeUndefined();
        expect(bugReportFields(plugin as never)).toEqual({ plugin_version: "3.7.0", obsidian_version: "1.13.1" });
    });

    it("opens the bug form carrying exactly those fields", () => {
        const fields = bugReportFields(plugin as never);
        const url = new URL(newIssueUrl("bug_report.yaml", fields));
        expect(`${url.origin}${url.pathname}`).toBe(`${REPO_URL}/issues/new`);
        expect(Object.fromEntries(url.searchParams)).toEqual({ template: "bug_report.yaml", ...fields });
    });

    it("points Discussions at the repository", () => {
        expect(DISCUSSIONS_URL).toBe(`${REPO_URL}/discussions`);
    });
});
