import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// Every batch its own id, so taking one back never takes another.
let ids = 0;
jest.mock("uuid", () => ({ v4: () => `id-${++ids}` }));

import { fakeNoteVault, type FakeNoteVault } from "../../../../support/fakeNoteVault";
import { adoptNote, createBookNote, editArticle, editBookNote } from "architecture/components/core/library/bookNoteWriter";
import { bufferedWrites, replaceBufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { undoBatch } from "architecture/plugin/writes/undoNotice";

const BOOK = "Books/Thinking, Fast and Slow.epub";

describe("the book's note, written (#743)", () => {
    let fake: FakeNoteVault;
    beforeEach(() => {
        fake = fakeNoteVault();
        fake.folders.add("Books");
        replaceBufferedWrites([]);
    });

    const create = (folder = "Library", change = { status: "to-read" as const }) =>
        createBookNote({
            source: BOOK,
            folder,
            title: "Thinking, Fast and Slow",
            change,
            declared: async () => ({ author: ["Daniel Kahneman"], publisher: "Farrar, Straus and Giroux", year: 2011 }),
        });

    it("is created by the first change, in the Book notes folder, linking the book, filled from the file (AC-3)", async () => {
        expect(fake.folders.has("Library")).toBe(false);
        const { file, batch } = await create();
        expect(file.path).toBe("Library/Thinking, Fast and Slow.md");
        // The folder is made now, with the first note — and only now.
        expect(fake.calls.createFolder).toEqual(["Library"]);
        expect(fake.frontmatter(file.path)).toEqual({
            book: "[[Books/Thinking, Fast and Slow.epub]]",
            author: ["Daniel Kahneman"],
            publisher: "Farrar, Straus and Giroux",
            year: 2011,
            status: "to-read",
        });
        // One write, on the record, as one batch you can take back.
        expect(bufferedWrites().map((write) => [write.kind, write.path, write.batch === batch, write.origin.kind])).toEqual([
            ["note-created", "Library/Thinking, Fast and Slow.md", true, "manual"],
        ]);
        expect(fake.calls.create).toEqual(["Library/Thinking, Fast and Slow.md"]);
    });

    it("never lands over an existing file", async () => {
        fake.folders.add("Library");
        fake.put("Library/Thinking, Fast and Slow.md", "my own note\n");
        const { file } = await create();
        expect(file.path).toBe("Library/Thinking, Fast and Slow 1.md");
        expect(fake.contents.get("Library/Thinking, Fast and Slow.md")).toBe("my own note\n");
        expect(fake.calls.createFolder).toEqual([]);
    });

    it("names the note after a title you typed, and survives a file that declares nothing", async () => {
        const { file } = await createBookNote({
            source: BOOK,
            folder: "Library",
            title: "Thinking, Fast and Slow",
            change: { title: "Pensar rápido, pensar despacio" },
            declared: async () => {
                throw new Error("unreadable");
            },
        });
        expect(file.path).toBe("Library/Pensar rápido, pensar despacio.md");
        expect(fake.frontmatter(file.path)).toEqual({ book: "[[Books/Thinking, Fast and Slow.epub]]", title: "Pensar rápido, pensar despacio" });
    });

    it("edits only the keys that changed after that, through the frontmatter, and Undo takes each back (AC-3)", async () => {
        const created = await create();
        const before = fake.frontmatter(created.file.path);
        const edit = await editBookNote(created.file, { collections: ["Planning"], publisher: null });
        expect(fake.frontmatter(created.file.path)).toEqual({ ...before, collections: ["Planning"], publisher: undefined });
        expect(fake.frontmatter(created.file.path)).not.toHaveProperty("publisher");
        expect(fake.calls.create).toHaveLength(1);
        const record = bufferedWrites().filter((write) => write.batch === edit.batch);
        expect(record.map((write) => [write.kind, write.before, write.after])).toEqual([
            ["properties-set", { collections: undefined, publisher: "Farrar, Straus and Giroux" }, { collections: ["Planning"] }],
        ]);

        // The edit, taken back: the key you removed is back, the one you added is gone.
        expect((await undoBatch(edit.batch!)).failed).toEqual([]);
        expect(fake.frontmatter(created.file.path)).toEqual(before);
        // The creation, taken back: the note goes to the trash.
        expect((await undoBatch(created.batch!)).failed).toEqual([]);
        expect(fake.calls.trash).toEqual(["Library/Thinking, Fast and Slow.md"]);
        expect(fake.file("Library/Thinking, Fast and Slow.md")).toBeNull();
    });

    it("adopts a note you already keep by adding only the link: the body to the byte, every other key by value (AC-5)", async () => {
        const body = "\n# My reading of it\n\n- System 1 is *fast*.\n\n```js\nconst x = 1;\n```\n\nTrailing spaces stay.   \n";
        const mine = fake.put("Reading/Kahneman.md", `---\ntags: [psychology, decisions]\nrating: 5\nnested:\n  a: 1\n---\n${body}`);
        const keysBefore = fake.frontmatter(mine.path);
        const { batch } = await adoptNote(mine, BOOK);
        const after = fake.frontmatter(mine.path);
        expect(fake.body(mine.path)).toBe(body);
        expect(after).toEqual({ ...keysBefore, book: "[[Books/Thinking, Fast and Slow.epub]]" });
        expect(bufferedWrites().filter((write) => write.batch === batch).map((write) => write.after)).toEqual([{ book: "[[Books/Thinking, Fast and Slow.epub]]" }]);
        // And Undo takes only the link away again.
        await undoBatch(batch!);
        expect(fake.frontmatter(mine.path)).toEqual(keysBefore);
        expect(fake.body(mine.path)).toBe(body);
    });

    it("sends a new note to a new folder and leaves the one already made where it is, unwritten (AC-12)", async () => {
        const first = await create("Library");
        const writesBefore = fake.calls.process.length;
        const contentBefore = fake.contents.get(first.file.path);
        const second = await createBookNote({
            source: "Books/Dune.epub",
            folder: "Reading notes",
            title: "Dune",
            change: { status: "finished" },
            declared: async () => ({}),
        });
        expect(second.file.path).toBe("Reading notes/Dune.md");
        expect(fake.contents.get(first.file.path)).toBe(contentBefore);
        expect(fake.calls.process.length).toBe(writesBefore);
        expect(fake.file("Library/Thinking, Fast and Slow.md")).not.toBeNull();
    });
});

describe("an article's status, in its own frontmatter (#744 FR-4, AC-5)", () => {
    beforeEach(() => {
        fakeNoteVault();
        replaceBufferedWrites([]);
    });

    it("writes only the status — every other key by value, the body to the byte — as one recorded write, Undo takes it back", async () => {
        const fake = fakeNoteVault();
        const body = "\nSoftware got fast.[^1]\n\n## Speed\n\n> A quote, kept.   \n\n[^1]: Then slow.\n";
        const clip = fake.put(
            "Clippings/The case for slow software.md",
            `---\ntitle: "The case for slow software"\nsource: "https://example.com/slow-software"\nauthor:\n  - "[[Jane Doe]]"\npublished: 2025-03-02\ncreated: 2025-03-04\ndescription: "Why slow is good."\ntags:\n  - "clippings"\n---\n${body}`
        );
        const before = fake.frontmatter(clip.path);
        const write = await editArticle(clip, { status: "finished", title: "Something else", author: ["Nobody"] });
        expect(fake.frontmatter(clip.path)).toEqual({ ...before, status: "finished" });
        expect(fake.body(clip.path)).toBe(body);
        expect(fake.calls.process).toEqual([clip.path]);
        expect(fake.calls.create).toEqual([]);
        const record = bufferedWrites().filter((entry) => entry.batch === write.batch);
        expect(record.map((entry) => [entry.kind, entry.before, entry.after])).toEqual([["properties-set", { status: undefined }, { status: "finished" }]]);
        expect((await undoBatch(write.batch!)).failed).toEqual([]);
        expect(fake.frontmatter(clip.path)).toEqual(before);
    });

    it("writes collections too, and nothing at all for a change it does not take", async () => {
        const fake = fakeNoteVault();
        const clip = fake.put("Clippings/a.md", `---\nsource: "https://a.org"\n---\nText.\n`);
        await editArticle(clip, { collections: ["Software design"] });
        expect(fake.frontmatter(clip.path)).toEqual({ source: "https://a.org", collections: ["Software design"] });
        const none = await editArticle(clip, { title: "x" });
        expect(none.batch).toBeUndefined();
        expect(fake.calls.process).toHaveLength(1);
    });
});
