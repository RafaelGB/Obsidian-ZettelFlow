import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// Today's React panels are not what these tests are about: each room is an empty stand-in.
jest.mock("application/community/view/legacyRooms", () => {
    const room = { mount: () => ({ dispose: () => undefined }) };
    return { LEGACY_ROOMS: { learn: room, contribute: room, installed: room } };
});
// Learn is native since #801, and fetches when shown: here it is a stand-in, the shell is what is tested.
jest.mock("application/community/view/learnRoom", () => ({ LEARN_ROOM: { mount: () => ({ dispose: () => undefined }) } }));
jest.mock("application/community/view/systemsRoom", () => ({ SYSTEMS_ROOM: { mount: () => ({ dispose: () => undefined }) } }));
jest.mock("config", () => ({ ZettelFlowSettingsTab: class {} }));
// What the doors' modules reach beyond the door: the canvas patcher, the event engine.
jest.mock("monkey-around", () => ({ around: () => () => undefined }));
jest.mock("tiny-jsonc", () => ({ parse: JSON.parse }));
jest.mock("architecture/plugin/events/WorkflowEventEngine", () => ({
    WorkflowEventEngine: { getInstance: () => ({ scanTriggers: async () => [] }) },
}));

import { readFileSync } from "fs";
import { join } from "path";
import { Setting, WorkspaceLeaf, __captureSettings } from "obsidian";
import { __resetLocal, ObsidianApi } from "architecture";
import { COMMUNITY_VIEW, LAST_ROOM_KEY, isRoom, roomToOpen } from "application/community/view/communityRooms";
import { openCommunity } from "application/community/view/openCommunity";
import { CommunityView } from "application/community/view/CommunityView";
import { ZettelFlowMenuComponent } from "starters/zcomponents/ZettelFlowMenuComponent";
import { SettingsTab } from "starters/zcomponents/SettingsTab";
import { WelcomeModal } from "starters/zcomponents/WelcomeModal";
import { flowsSettingsGroup } from "config/modals/handlers/flowsSettingsGroup";
import { DomNode, flush } from "../../support/dashboardDom";
import { communityWorkspace } from "../../support/communityWorkspace";

async function mountView(state: Record<string, unknown>) {
    const content = new DomNode();
    const app = { workspace: { requestSaveLayout: () => undefined, on: () => ({}) } };
    const view = new CommunityView(new WorkspaceLeaf(app, content) as never, {} as never);
    await view.setState(state, {} as never);
    await view.onOpen();
    return { view, content };
}

beforeEach(() => __resetLocal());

describe("the rooms of Community (#798)", () => {
    it("opens the room asked for, else the last one used here, else Learn", () => {
        expect(roomToOpen(undefined, null)).toBe("learn");
        expect(roomToOpen(undefined, "installed")).toBe("installed");
        expect(roomToOpen("systems", "installed")).toBe("systems");
        expect(roomToOpen("nowhere", "also-nowhere")).toBe("learn");
    });

    it("knows a room from anything else", () => {
        expect(isRoom("x")).toBe(false);
        expect(isRoom(3)).toBe(false);
        expect(isRoom("contribute")).toBe(true);
    });
});

describe("opening Community: one leaf, at the room that answers (#798 AC-1, AC-2)", () => {
    it("opens one leaf at the room asked for when none is open", async () => {
        const ws = communityWorkspace();
        await openCommunity(ws.app, "systems");
        const leaves = ws.app.workspace.getLeavesOfType(COMMUNITY_VIEW);
        expect(leaves).toHaveLength(1);
        expect(leaves[0].state).toEqual({ room: "systems" });
        expect(leaves[0].active).toBe(true);
        expect(ws.revealed).toEqual([leaves[0]]);
    });

    it("reuses the open leaf and pans it, never opening a second one", async () => {
        const ws = communityWorkspace();
        const existing = ws.open(COMMUNITY_VIEW, { room: "learn" });
        await openCommunity(ws.app, "installed");
        expect(ws.app.workspace.getLeavesOfType(COMMUNITY_VIEW)).toHaveLength(1);
        expect(existing.state).toEqual({ room: "installed" });
        expect(ws.revealed).toEqual([existing]);
    });

    it("remembers the room it opened, so the ribbon comes back to it", async () => {
        const ws = communityWorkspace();
        await openCommunity(ws.app);
        expect(ws.leaves[0].state).toEqual({ room: "learn" });
        await openCommunity(ws.app, "contribute");
        expect(ObsidianApi.loadLocal(LAST_ROOM_KEY)).toBe("contribute");
        await openCommunity(ws.app);
        expect(ws.leaves[0].state).toEqual({ room: "contribute" });
    });
});

describe("the room is the view's state (#798 AC-3, FR-4)", () => {
    it("renders the room a restored workspace names, and gives it back", async () => {
        const { view, content } = await mountView({ room: "contribute" });
        const active = content.byClass("community-nav-tab").filter((tab) => tab.getAttribute("aria-selected") === "true");
        expect(active.map((tab) => tab.getAttribute("data-room"))).toEqual(["contribute"]);
        expect(content.byClass("community-strip")[0].cssProps["--zf-community-room"]).toBe("2");
        expect(view.getState()).toMatchObject({ room: "contribute" });
    });

    it("opens on Learn for a room it does not know", async () => {
        const { view } = await mountView({ room: "lobby" });
        expect(view.getState()).toMatchObject({ room: "learn" });
    });

    it("pans an open view when the opener names another room, through the same leaf", async () => {
        const ws = communityWorkspace();
        const leaf = ws.open(COMMUNITY_VIEW, { room: "learn" });
        const content = new DomNode();
        const view = new CommunityView(Object.assign(leaf, { app: ws.app, contentEl: content }) as never, {} as never);
        leaf.view = view;
        await view.onOpen();
        await openCommunity(ws.app, "installed");
        await view.whenSettled();
        expect(view.getState()).toMatchObject({ room: "installed" });
        expect(ws.app.workspace.getLeavesOfType(COMMUNITY_VIEW)).toHaveLength(1);
    });
});

describe("every door opens Community at the room that answers it (#798 AC-1, FR-6)", () => {
    /** A plugin that only records what it registers. */
    function fakePlugin(ws = communityWorkspace()) {
        const commands: Record<string, { callback: () => void }> = {};
        const plugin = {
            app: ws.app,
            manifest: { id: "zettelflow" },
            settings: {},
            addCommand: (command: { id: string; callback: () => void }) => (commands[command.id] = command),
            addRibbonIcon: () => undefined,
            addSettingTab: () => undefined,
            saveSettings: async () => undefined,
        };
        return { plugin, commands, ws };
    }
    const roomOpened = (ws: ReturnType<typeof communityWorkspace>) =>
        ws.app.workspace.getLeavesOfType(COMMUNITY_VIEW).map((leaf: { state: unknown }) => leaf.state);

    it.each([
        ["browse-systems", "systems"],
        ["open-community-templates", "systems"],
        ["open-manage-templates", "installed"],
    ])("command %s opens %s", async (id, room) => {
        const { plugin, commands, ws } = fakePlugin();
        new ZettelFlowMenuComponent(plugin as never).onLoad();
        new SettingsTab(plugin as never).onLoad();
        commands[id].callback();
        await flush();
        expect(roomOpened(ws)).toEqual([{ room }]);
    });

    it("the ribbon's Community opens Learn the first time, then the room you were last in", async () => {
        const { plugin, commands, ws } = fakePlugin();
        new ZettelFlowMenuComponent(plugin as never).onLoad();
        commands["open-community"].callback();
        await flush();
        expect(roomOpened(ws)).toEqual([{ room: "learn" }]);
        ObsidianApi.saveLocal(LAST_ROOM_KEY, "installed");
        commands["open-community"].callback();
        await flush();
        expect(roomOpened(ws)).toEqual([{ room: "installed" }]);
    });

    it("the settings rows open Systems and Installed, the settings window stepping aside", async () => {
        const ws = communityWorkspace();
        const close = jest.fn();
        ws.app.setting = { close };
        __captureSettings(() => undefined);
        try {
            type Item = { name?: string; render?: (s: Setting) => void };
            const groups = flowsSettingsGroup({ app: ws.app, settings: {} } as never, () => undefined) as unknown as { items?: Item[] }[];
            const items = groups.flatMap((group) => group.items ?? []);
            const press = async (name: string) => {
                const setting = new Setting(new DomNode()) as Setting & { buttons: { click(): void }[] };
                items.find((item) => item.name === name)?.render?.(setting);
                setting.buttons[0].click();
                await flush();
            };
            await press("Community systems");
            expect(roomOpened(ws)).toEqual([{ room: "systems" }]);
            await press("Manage installed templates");
            expect(roomOpened(ws)).toEqual([{ room: "installed" }]);
            expect(close).toHaveBeenCalledTimes(2);
        } finally {
            __captureSettings(null);
        }
    });

    it("the welcome's Browse systems opens Systems", async () => {
        const { plugin, ws } = fakePlugin();
        const settings: Setting[] = [];
        __captureSettings((setting) => settings.push(setting));
        try {
            const modal = new WelcomeModal(plugin as never);
            Object.assign(modal, { contentEl: new DomNode(), modalEl: new DomNode() });
            modal.onOpen();
            const buttons = settings.flatMap((s) => (s as unknown as { buttons: { text: string; click(): void }[] }).buttons);
            buttons.find((b) => b.text === "Browse systems to get started")?.click();
            await flush();
            expect(roomOpened(ws)).toEqual([{ room: "systems" }]);
        } finally {
            __captureSettings(null);
        }
    });

    it("the wizard's and the canvas's empty states open Systems", () => {
        // Both are drawn inside surfaces too big to stand up here (a React wizard, a live canvas);
        // what each button calls is read from the source instead.
        for (const file of ["application/components/noteBuilder/WelcomeTutorial.tsx", "architecture/plugin/canvas/extensions/EmptyStateExtension.ts"]) {
            const source = readFileSync(join(__dirname, "..", "..", "..", "src", file), "utf8");
            expect({ file, opens: /openCommunity\([^,]+, "systems"\)/.test(source) }).toEqual({ file, opens: true });
        }
    });
});
