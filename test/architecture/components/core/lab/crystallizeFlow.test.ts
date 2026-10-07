import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { TFile, Setting, __captureSettings } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";

const route = { path: "", result: "opened" as "opened" | "failed" };
const throughFlow = jest.fn(async () => route.result);
jest.mock("architecture/plugin/thinking/crystallizeThroughFlow", () => ({
    crystallizeFlowPath: () => route.path,
    crystallizeThroughFlow: (...args: unknown[]) => (throughFlow as (...a: unknown[]) => Promise<string>)(...args),
}));
const direct = jest.fn(async () => "Untitled.md");
jest.mock("architecture/plugin/thinking/crystallizeThought", () => ({
    crystallize: (...args: unknown[]) => (direct as (...a: unknown[]) => Promise<string>)(...args),
    crystallizeInto: jest.fn(async () => "Notes/a.md"),
}));

import { CrystallizeModal } from "architecture/components/core/lab/CrystallizeModal";

/**
 * **The preview says where the note goes** (#712). With a crystallize flow, a new note continues in
 * it — the line names the flow and the button says so; going back into a note, and no flow at all,
 * are exactly what they were.
 */
const keeps = (content: DomNode) => content.byClass("crystallize-keeps").map((el) => el.textContent);
let settings: Setting[] = [];
const buttons = (_content?: DomNode) =>
    settings.flatMap((setting) => (setting as unknown as { buttons: { text: string }[] }).buttons.map((b) => b.text));

afterEach(() => __captureSettings(null));

function open(subject?: string) {
    settings = [];
    __captureSettings((setting) => settings.push(setting));
    const file = new TFile();
    file.path = subject ?? "";
    const app = { vault: { getAbstractFileByPath: (path: string) => (subject && path === subject ? file : null) } };
    const plan = { title: "An idea", body: "Body", frozen: [{ quote: "q", at: 1 }], omitted: 0, bornFrom: [], sources: [] };
    const onDone = jest.fn();
    const modal = new CrystallizeModal(app as never, plan as never, onDone, subject);
    const content = new DomNode();
    (modal as unknown as { contentEl: DomNode }).contentEl = content;
    modal.onOpen();
    return { modal, content, onDone };
}

describe("crystallize through a flow — the preview (#712)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        route.path = "";
        route.result = "opened";
    });

    it("names the flow a new note continues in, and the button says where it goes", () => {
        route.path = "Flows/Crystallize flow.canvas";
        const { content } = open();
        expect(keeps(content)).toContain("This note continues in Crystallize flow, which decides its folder, template and properties.");
        expect(buttons(content)).toContain("Continue in Crystallize flow");
    });

    it("going back into the note it came from is an update, never a flow", () => {
        route.path = "Flows/Crystallize flow.canvas";
        const { modal, content } = open("Notes/a.md");
        (modal as unknown as { destination: string }).destination = "back";
        settings = [];
        modal.onOpen();
        expect(keeps(content).some((text) => text.includes("continues in"))).toBe(false);
        expect(buttons(content)).toContain("Update the note");
    });

    it("with no crystallize flow, it creates the note as it always did", async () => {
        const { modal, content, onDone } = open();
        expect(buttons(content)).toContain("Create the note");
        await (modal as unknown as { apply(): Promise<void> }).apply();
        expect(throughFlow).not.toHaveBeenCalled();
        expect(direct).toHaveBeenCalledTimes(1);
        expect(onDone).toHaveBeenCalledWith("Untitled.md");
    });

    it("a flow that cannot be opened says so, writes nothing and never falls back to the root", async () => {
        route.path = "Flows/Crystallize flow.canvas";
        route.result = "failed";
        const { modal, onDone } = open();
        await (modal as unknown as { apply(): Promise<void> }).apply();
        expect(throughFlow).toHaveBeenCalledTimes(1);
        expect(direct).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
        expect((modal as unknown as { lastNotice?: string }).lastNotice).toBe("Crystallize flow could not be opened. Nothing was written.");
    });
});
