import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const draft = { save: jest.fn(), clear: jest.fn(), offer: jest.fn() };
jest.mock("architecture/plugin/noteBuilder/DraftStore", () => ({ draftStore: draft }));
jest.mock("react-dom/client", () => ({ createRoot: () => ({ render: jest.fn(), unmount: jest.fn() }) }));
jest.mock("application/components/noteBuilder", () => ({
    buildSelectorMenu: jest.fn(),
    useNoteBuilderStore: { getState: () => ({ actions: { snapshotDraft: (canvasPath: string) => ({ canvasPath }) } }) },
}));
jest.mock("application/components/noteBuilder/SelectorMenu", () => ({ buildTutorial: jest.fn() }));
jest.mock("architecture/components/settings", () => ({ ConfirmModal: class {} }));

import { SelectorMenuModal } from "zettelkasten/modals/SelectorMenuModal";
import type { CrystallizeSeed } from "application/thinking/crystallize";

const SEED: CrystallizeSeed = { title: "Replay is the model", content: "My idea.\n", quote: "", source: "", frozen: 1 };
const flow = { canvasPath: "Flows/Think.canvas" };

function modal(): SelectorMenuModal {
    const m = new SelectorMenuModal({} as never, {} as never, flow as never);
    (m as unknown as { root: { unmount(): void } }).root = { unmount: jest.fn() };
    return m;
}

describe("crystallize through a flow — the seeded wizard (#712)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("never keeps a draft of a seeded run: closing it leaves the thoughts on the bench, nothing else", () => {
        const onBuilt = jest.fn();
        const seeded = modal().seedCrystallization(SEED, onBuilt);
        expect(seeded.isSeeded()).toBe(true);
        expect(seeded.getCrystallizeSeed()).toBe(SEED);
        seeded.onClose();
        expect(draft.save).not.toHaveBeenCalled();
        expect(onBuilt).not.toHaveBeenCalled();
    });

    it("built, it reports the note once and leaves the canvas's own draft alone", () => {
        const onBuilt = jest.fn();
        const seeded = modal().seedCrystallization(SEED, onBuilt);
        seeded.markBuilt("Crystallized/Replay is the model.md");
        expect(onBuilt).toHaveBeenCalledTimes(1);
        expect(onBuilt).toHaveBeenCalledWith("Crystallized/Replay is the model.md");
        expect(draft.clear).not.toHaveBeenCalled();
    });

    it("an ordinary run is unchanged: its draft is cleared on build and kept on close", () => {
        const plain = modal();
        expect(plain.isSeeded()).toBe(false);
        plain.markBuilt("a.md");
        expect(draft.clear).toHaveBeenCalledWith("Flows/Think.canvas");
        const other = modal();
        other.onClose();
        expect(draft.save).toHaveBeenCalledTimes(1);
    });
});
