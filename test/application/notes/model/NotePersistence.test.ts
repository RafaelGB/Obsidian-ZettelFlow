import { describe, it, expect } from "@jest/globals";
import { NoteDTO } from "application/notes/model/NoteDTO";
import {
    notePersistenceForPath,
    type NotePersistence,
} from "application/notes/model/NotePersistence";

/**
 * #275 (S6) — `NotePersistence` is the persistence/representation view of the note under construction
 * (destination path + title + target folder) that the action/script boundary sees, instead of the
 * wizard-shaped `NoteDTO`. The domain (identity/model/write) flows through `KnowledgeContext`.
 */
describe("NotePersistence — the note's persistence/representation view (#275)", () => {
    it("a NoteDTO is a NotePersistence and its five methods behave", () => {
        const dto = new NoteDTO();
        const note: NotePersistence = dto; // assignability is the point (compile-time proof)
        note.setTargetFolder("Notes/Zettel").setTitle("My idea");
        expect(note.getTitle()).toBe("My idea");
        expect(note.getTargetFolder()).toBe("Notes/Zettel");
        expect(note.getFinalPath()).toBe("Notes/Zettel/My idea.md");
    });

    it("notePersistenceForPath yields the path with stub title/folder", () => {
        const note = notePersistenceForPath("Notes/Note.md");
        expect(note.getFinalPath()).toBe("Notes/Note.md");
        expect(note.getTitle()).toBe("");
        expect(note.getTargetFolder()).toBe("");
    });

    it("notePersistenceForPath setters are chainable no-ops (the path is fixed)", () => {
        const note = notePersistenceForPath("Notes/Note.md");
        expect(note.setTitle("x").setTargetFolder("y").getFinalPath()).toBe("Notes/Note.md");
    });
});
