import { describe, it, expect } from "@jest/globals";
import { useNoteBuilderStore } from "application/components/noteBuilder/state/NoteBuilderState";
import type { CrystallizeSeed } from "application/thinking/crystallize";

const SEED: CrystallizeSeed = { title: "Replay is the model", content: "My idea.\n", quote: "", source: "", frozen: 1 };

/** What the wizard's mount effect does for a crystallize run (#712). */
function seedStore(): void {
    const { actions } = useNoteBuilderStore.getState();
    actions.setCrystallizeSeed(SEED);
    actions.setTitle(SEED.title);
}

describe("crystallize through a flow — the wizard opens seeded (#712)", () => {
    it("starts with the accepted title, and the note carries the seed", () => {
        seedStore();
        const { builder, title } = useNoteBuilderStore.getState();
        expect(title).toBe(SEED.title);
        expect(builder.note.getTitle()).toBe(SEED.title);
        expect(builder.note.getCrystallizeSeed()).toBe(SEED);
    });

    it("survives the reset StrictMode's remount makes: the mount effect seeds again", () => {
        useNoteBuilderStore.getState().actions.reset();
        expect(useNoteBuilderStore.getState().builder.note.getCrystallizeSeed()).toBeUndefined();
        seedStore();
        expect(useNoteBuilderStore.getState().builder.note.getTitle()).toBe(SEED.title);
        expect(useNoteBuilderStore.getState().builder.note.getCrystallizeSeed()).toBe(SEED);
    });
});
