import { beforeEach, describe, it, expect, jest } from "@jest/globals";

jest.mock("architecture/settings/suggesters/FolderSuggest", () => ({ FolderSuggest: class { } }));
jest.mock("application/community/CommunityStepModal", () => ({ CommunityStepModal: class { } }));
jest.mock("application/community/CommunityActionModal", () => ({ CommunityActionModal: class { } }));
jest.mock("application/community/CommunityMarkdownModal", () => ({ CommunityMarkdownModal: class { } }));
// The confirmation dialog the install used to open: constructed, it would be counted (AC-8).
const confirmed = jest.fn();
jest.mock("architecture/components/settings", () => ({ ConfirmModal: class { constructor() { confirmed(); } open() { } } }));

import * as obsidian from "obsidian";
import { replaceBufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { DomNode, settle } from "../../support/dashboardDom";
import { REFS, mountRoom, openCard } from "../../support/systemsRoomHarness";
import { t, tCount } from "architecture/lang";
import { consequence, type ConsequencePart } from "application/community/installConsequence";
import { installDestination, type InstallRole } from "application/community/installDestination";

type LocaleKey = Parameters<typeof t>[0];

const RealNotice = obsidian.Notice;
/** Every notice, as the real (fake) one: a spy that still constructs it, so a test can read and click it. */
const noticeSpy = jest.spyOn(obsidian, "Notice").mockImplementation(function (message?: string) {
    return new RealNotice(message);
} as never);

/** The sentence the panel shows, from the parts the pure module returns. */
function say(parts: ConsequencePart[]): string {
    return parts
        .map((part) => (part.count === undefined ? t(part.key as LocaleKey, ...part.args) : tCount(part.count, part.key as LocaleKey, ...part.args)))
        .join(" ");
}

function sentence(role: InstallRole, folders: Record<string, string> = {}, folder?: string, fileCount = 4): string {
    const destination = installDestination({
        role,
        targetFolder: "ZettelFlow/Flows/Zettelkasten v2",
        canvasFilename: "Zettelkasten v2.canvas",
        folders: { foldersFlowsPath: "ZettelFlow/Folders", eventFlowsPath: "ZettelFlow/Events", ...folders },
        folder,
    });
    return say(consequence({ role, destination, fileCount, canvasFilename: "Zettelkasten v2.canvas" }));
}

describe("the consequence, said before anything is written (#799 FR-10, AC-6)", () => {
    it("names the canvas, counts the files and says where, for every role", () => {
        expect(sentence("none")).toContain("Zettelkasten v2.canvas");
        expect(sentence("none")).toContain("4 files");
        expect(sentence("none")).toContain("ZettelFlow/Flows/Zettelkasten v2");
        expect(sentence("none", {}, undefined, 1)).toContain("1 file)");
        expect(sentence("event")).toContain("ZettelFlow/Events");
        // A folder flow is named after its folder, so the sentence names that canvas.
        expect(sentence("folder", {}, "Projects")).toContain("ZettelFlow/Folders");
        expect(sentence("folder", {}, "Projects")).not.toContain("Zettelkasten v2.canvas");
    });

    it("says how each role runs, in the user's words", () => {
        expect(sentence("create")).toContain(t("community_system_runs_create"));
        expect(sentence("edit")).toContain(t("community_system_runs_edit"));
        expect(sentence("folder", {}, "Projects")).toContain(t("community_system_runs_folder"));
        expect(sentence("event")).toContain(t("community_system_runs_event"));
        expect(sentence("none")).toContain(t("community_system_runs_none"));
    });

    it("names the flow a held role displaces, and that it stays in your vault", () => {
        const held = sentence("create", { ribbonCanvas: "Flows/My flow.canvas" });
        expect(held).toContain("Flows/My flow.canvas");
        expect(held).toContain("stays in your vault");
        expect(sentence("create")).not.toContain("stays in your vault");
    });

    it("offers the undo in one go, and never mentions a Recent panel", () => {
        for (const role of ["create", "edit", "event", "none"] as InstallRole[]) {
            expect(sentence(role)).toContain(t("community_consequence_undo"));
            expect(sentence(role)).not.toMatch(/recent/i);
        }
    });

    it("says nothing about files when the role cannot be planned yet", () => {
        expect(sentence("folder")).toBe("");
    });
});

describe("how will you use it, and Install — in place (#799 AC-6 – AC-9, FR-9 – FR-13)", () => {
    beforeEach(() => {
        noticeSpy.mockClear();
        confirmed.mockClear();
        replaceBufferedWrites([]);
        (globalThis as { createFragment?: unknown }).createFragment = () => new DomNode("#fragment");
    });

    const radio = (panel: DomNode, index: number) => panel.byClass("system-use-choice")[index].children.find((el) => el.tag === "input") as DomNode;
    const choose = (panel: DomNode, index: number) => {
        panel.oneByClass("system-use-current").click();
        radio(panel, index).fire("change");
    };
    const field = (panel: DomNode) => panel.oneByClass("system-field").children.find((el) => el.tag === "input") as DomNode;

    it("recommends Create notes with no creation flow, and Just the files when one is set", async () => {
        const fresh = await openCard(await mountRoom(), "Zettelkasten v2");
        expect(fresh.oneByClass("system-use-current").textContent).toContain("Create notes");
        const held = await openCard(await mountRoom({ settings: { ribbonCanvas: "Flows/Mine.canvas" } }), "Zettelkasten v2");
        expect(held.oneByClass("system-use-current").textContent).toContain("Just the files");
    });

    it("reveals the five choices, each with its one line, on Change", async () => {
        const panel = await openCard(await mountRoom(), "Zettelkasten v2");
        panel.oneByClass("system-use-current").click();
        const choices = panel.byClass("system-use-choice");
        expect(choices.map((choice) => choice.find((el) => el.tag === "b")!.text)).toEqual([
            "Create notes",
            "Edit the open note",
            "For a folder",
            "When something happens",
            "Just the files",
        ]);
        for (const choice of choices) expect(choice.find((el) => el.tag === "small")!.text.length).toBeGreaterThan(0);
    });

    it("asks for the folder on For a folder, and rewrites the sentence on every change", async () => {
        const panel = await openCard(await mountRoom({ settings: { ribbonCanvas: "Flows/Mine.canvas" } }), "Zettelkasten v2");
        const first = panel.oneByClass("system-consequence").text;
        choose(panel, 2);
        expect(panel.oneByClass("system-field-label").text).toBe(t("assign_role_folder"));
        field(panel).value = "Projects";
        field(panel).fire("input");
        expect(panel.oneByClass("system-consequence").text).not.toBe(first);
        expect(panel.oneByClass("system-consequence").text).toContain(t("community_system_runs_folder"));
        choose(panel, 0);
        const displacing = panel.oneByClass("system-consequence").text;
        expect(displacing).toContain("Flows/Mine.canvas");
        expect(displacing).toContain("stays in your vault");
    });

    it("keeps Install shut until the code it brings is acknowledged, naming each site (AC-7)", async () => {
        const panel = await openCard(await mountRoom(), "Weekly focus");
        const code = panel.oneByClass("system-code");
        expect(code.textContent).toContain("It brings code that will run in your vault.");
        expect(code.byClass("system-code-sites")[0].children.map((li) => li.text)).toEqual(["Weekly focus.md — script"]);
        const install = panel.oneByClass("system-install");
        expect(install.disabled).toBe(true);
        const box = code.oneByClass("system-code-ack").children.find((el) => el.tag === "input") as DomNode;
        box.checked = true;
        box.fire("change");
        expect(install.disabled).toBe(false);
        // A system with no code says nothing about code.
        const plain = await openCard(await mountRoom(), "Zettelkasten v2");
        expect(plain.byClass("system-code")).toHaveLength(0);
        expect(plain.oneByClass("system-install").disabled).toBe(false);
    });

    it("says Install another copy for a system already here, somewhere the first copy is not", async () => {
        const copy = { id: "i", ref: REFS.zettelkasten, name: "Zettelkasten v2", at: 1, folder: "ZettelFlow/Folders/Zettelkasten v2", canvas: "x", role: "none", files: [], folders: [] };
        const panel = await openCard(await mountRoom({ settings: { installedSystems: [copy] } }), "Zettelkasten v2");
        expect(panel.oneByClass("system-install").text).toBe("Install another copy");
        expect(field(panel).value).toBe("ZettelFlow/Folders/Zettelkasten v2 2");
    });

    it("says a missing folder next to the field, and writes nothing (AC-9)", async () => {
        const mounted = await mountRoom();
        const panel = await openCard(mounted, "Zettelkasten v2");
        choose(panel, 2);
        await (mounted.room.opened as unknown as { install(): Promise<void> }).install();
        expect(panel.oneByClass("system-field-problem").text).toBe(t("assign_role_problem_folder_required"));
        expect(mounted.vaultCalls.filter((call) => !call.startsWith("read"))).toEqual([]);
        expect(mounted.saves).not.toHaveBeenCalled();
        expect(noticeSpy).not.toHaveBeenCalled();
    });

    it("says a conflict inline, and the button offers to try again", async () => {
        const mounted = await mountRoom();
        mounted.harness.vault.add("Flows/Zettelkasten v2/Zettelkasten v2.canvas", { body: "mine" });
        const panel = await openCard(mounted, "Zettelkasten v2");
        field(panel).value = "Flows/Zettelkasten v2";
        field(panel).fire("input");
        panel.oneByClass("system-install").click();
        await settle(() => panel.oneByClass("system-install").text === "Try again");
        expect(panel.oneByClass("system-install-status").text).toBe(t("community_system_install_conflict"));
        expect(noticeSpy).not.toHaveBeenCalled();
    });

    it("installs with no dialog: the tab opens the canvas, and the notice offers a note and Undo (AC-8)", async () => {
        const mounted = await mountRoom();
        const panel = await openCard(mounted, "Zettelkasten v2");
        panel.oneByClass("system-install").click();
        await settle(() => mounted.leaf.openFile.mock.calls.length > 0);
        expect(confirmed).not.toHaveBeenCalled();
        const canvas = "ZettelFlow/Folders/Zettelkasten v2/Zettelkasten v2.canvas";
        expect((mounted.leaf.openFile.mock.calls[0][0] as { path: string }).path).toBe(canvas);
        expect(mounted.harness.settings.ribbonCanvas).toBe(canvas);
        // The history entry Back returns to names the card the drawing flies home to.
        expect(mounted.room.viewState()).toEqual({ flyHome: REFS.zettelkasten });
        expect(noticeSpy).toHaveBeenCalledTimes(1);
        const notice = noticeSpy.mock.results[0].value as unknown as { message: DomNode };
        expect(notice.message.textContent).toContain("Zettelkasten v2 is in your vault");
        notice.message.byText("Create a note")!.click();
        expect(mounted.triggered).toEqual([["zettelflow-open-flow", canvas]]);
    });

    it("takes it all back from the notice's Undo", async () => {
        const mounted = await mountRoom({ settings: { ribbonCanvas: "" } });
        const panel = await openCard(mounted, "Zettelkasten v2");
        panel.oneByClass("system-install").click();
        await settle(() => noticeSpy.mock.results.length > 0);
        const notice = noticeSpy.mock.results[0].value as unknown as { message: DomNode };
        notice.message.byText("Undo")!.click();
        await settle(() => noticeSpy.mock.results.length > 1);
        expect(mounted.harness.vault.entries.size).toBe(0);
        expect(mounted.harness.settings.ribbonCanvas).toBe("");
        expect(mounted.harness.settings.installedSystems).toEqual([]);
        expect((noticeSpy.mock.results[1].value as unknown as { message: string }).message).toBe(t("changes_undo_done", "2"));
    });
});
