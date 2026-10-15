/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from "@jest/globals";
import type { StaticTemplateOptions } from "config";
import type { ZfTemplate } from "application/template/zfTemplate";
import { systemsRoom, type SystemsRoom } from "application/community/view/systemsRoom";
import { DomNode, settle } from "./dashboardDom";
import { wireHarness } from "./harness";
import { branching, entry, parseYamlForTests, scripted, single } from "./systemsFixtures";

/**
 * The Systems room on its own (#799), over an in-memory vault: a catalog and templates the test
 * hands it, a leaf that records what it opened, and a call log of every vault read and write — so a
 * test can say "the walk touched nothing".
 *
 * A test file that mounts it mocks `architecture/settings/suggesters/FolderSuggest` (its import
 * chain is the whole plugin) and the loose pieces' modals.
 */
export const REFS = {
    zettelkasten: "/docs/systems/zettelkasten-v2.zftemplate",
    para: "/docs/systems/para-v2.zftemplate",
    meeting: "/docs/systems/meeting-notes.zftemplate",
    weekly: "/docs/systems/weekly-focus.zftemplate",
    broken: "/docs/systems/broken.zftemplate",
};

export function fixtureCatalog(): StaticTemplateOptions[] {
    return [
        entry({ title: "Add contact", template_type: "step", ref: "/docs/steps/community/add_contact.json" }),
        entry({ title: "Zettelkasten v2", ref: REFS.zettelkasten, steps: 4, branches: 1, difficulty: "medium", summary: { en: "The slip-box.", es: "La caja de notas." } }),
        entry({ title: "PARA v2", ref: REFS.para, steps: 5, branches: 2, difficulty: "hard" }),
        entry({ title: "Meeting notes", ref: REFS.meeting, steps: 1, branches: 0, difficulty: "easy" }),
        entry({ title: "Weekly focus", ref: REFS.weekly, steps: 1, branches: 0, difficulty: "hard" }),
        entry({ title: "Broken", ref: REFS.broken, steps: 1, branches: 0 }),
        entry({ title: "Daily Note Template", template_type: "markdown", ref: "/docs/steps/markdown/Daily Note Template.md" }),
        entry({ title: "New task", template_type: "step", ref: "/docs/steps/community/add_task.json" }),
    ];
}

export function fixtureTemplates(): Record<string, ZfTemplate> {
    return {
        [REFS.zettelkasten]: branching("Zettelkasten v2"),
        [REFS.para]: branching("PARA v2"),
        [REFS.meeting]: single("Meeting notes"),
        [REFS.weekly]: scripted("Weekly focus"),
    };
}

export interface MountedRoom {
    room: SystemsRoom;
    roomEl: DomNode;
    community: DomNode;
    harness: ReturnType<typeof wireHarness>;
    leaf: { openFile: jest.Mock<(file: unknown) => Promise<void>>; setViewState: jest.Mock<(state: unknown) => Promise<void>>; view: unknown };
    /** Every vault read and write, in order. */
    vaultCalls: string[];
    saves: jest.Mock<() => Promise<void>>;
    triggered: unknown[][];
}

export async function mountRoom(
    options: {
        settings?: Record<string, unknown>;
        catalog?: () => Promise<StaticTemplateOptions[]>;
        templates?: Record<string, ZfTemplate>;
        lang?: string;
        /** Wait for the cards to be drawn (the default), or hand the room back still loading. */
        wait?: boolean;
    } = {}
): Promise<MountedRoom> {
    const harness = wireHarness({ settings: { foldersFlowsPath: "ZettelFlow/Folders", ...(options.settings ?? {}) } });
    const vaultCalls: string[] = [];
    const vault = harness.vault as any;
    for (const name of ["read", "cachedRead", "create", "modify", "createFolder", "process"]) {
        const original = vault[name].bind(vault);
        vault[name] = (...args: any[]) => {
            vaultCalls.push(`${name}:${typeof args[0] === "string" ? args[0] : args[0]?.path}`);
            return original(...args);
        };
    }
    const saves = jest.fn(async () => undefined);
    (harness.plugin as any).saveSettings = saves;
    const triggered: unknown[][] = [];
    (harness.app as any).workspace = { ...(harness.app as any).workspace, trigger: (...args: unknown[]) => triggered.push(args) };
    const leaf = { openFile: jest.fn(async (_file: unknown) => undefined), setViewState: jest.fn(async (_state: unknown) => undefined), view: null };
    const community = new DomNode("div");
    community.addClass("zettelkasten-flow__community");
    const roomEl = community.createEl("section", { cls: "zettelkasten-flow__community-room" }) as DomNode;
    const templates = options.templates ?? fixtureTemplates();
    const host = { app: harness.app, plugin: harness.plugin, leaf, openRoom: () => undefined, refreshCounts: () => undefined };
    const room = systemsRoom({
        fetchCatalog: options.catalog ?? (async () => fixtureCatalog()),
        fetchTemplate: async (ref: string) => {
            const template = templates[ref];
            if (!template) throw new Error(`no template at ${ref}`);
            return template;
        },
        parseYaml: parseYamlForTests,
        lang: () => options.lang ?? "en",
    }).mount(roomEl as never, host as never) as SystemsRoom;
    if (options.wait !== false) {
        await settle(() => roomEl.byClass("system-card-title").length > 0 && !roomEl.byClass("system-card-thumb").some((thumb) => thumb.hasClass("is-loading")), 50, 200);
    }
    return { room, roomEl, community, harness, leaf: leaf as never, vaultCalls, saves, triggered };
}

/** The card for a system, by its title. */
export function cardOf(roomEl: DomNode, title: string): DomNode {
    const card = roomEl.byClass("system-card").find((el) => el.byClass("system-card-title")[0]?.text === title);
    if (!card) throw new Error(`no card for ${title}`);
    return card;
}

/** Open a system the way a click does, and wait for it to be in place. */
export async function openCard(mounted: MountedRoom, title: string): Promise<DomNode> {
    const ref = cardOf(mounted.roomEl, title).getAttribute("data-ref") as string;
    await mounted.room.open(ref);
    return mounted.roomEl.oneByClass("system-open");
}

/** Visible text of an element, its descendants included. */
export function textOf(el: DomNode): string {
    return el.textContent;
}
