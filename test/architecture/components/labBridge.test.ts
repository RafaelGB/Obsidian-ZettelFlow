import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

/**
 * Source with its comments removed.
 *
 * A rule is judged on what runs, not on what explains it: these files document at length what
 * they deliberately no longer do, and a blunt substring scan flags the explanation.
 */
function code(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const BRIDGE = read("starters", "zcomponents", "ThinkAboutComponent.ts");
const BRIDGE_CODE = code(BRIDGE);
const CULTIVATE = read("architecture", "components", "core", "cultivate", "CultivateModeRenderer.ts");
const LAB = read("architecture", "components", "core", "lab", "LabRenderer.ts");
const HOME = read("architecture", "components", "core", "surface", "HomeSurfaceView.ts");
const CAPTURE = code(read("zettelkasten", "modals", "QuickCaptureModal.ts"));

/**
 * The door between Cultivate and the Lab (#473).
 *
 * Cultivate's subject is a note that exists; the Lab's subject is a thought that is not one yet.
 * That is a gap, not an overlap — so nothing is merged, and what has to be pinned is that the
 * door exists in both directions and that **crossing it writes nothing**.
 */
describe("you can arrive at the lab from somewhere (#473)", () => {
    it("opens the lab from a note, by command and from the file menu", () => {
        expect(BRIDGE).toContain('id: "think-about-this-note"');
        expect(BRIDGE).toContain('this.plugin.app.workspace.on("file-menu"');
        // Markdown only: there is nothing to think about in a canvas from here.
        expect(BRIDGE).toContain('file.extension !== "md"');
    });

    it("carries the note as the thread's subject, through the existing deep-link seam", () => {
        expect(BRIDGE).toContain('activateSurface(plugin.app, "zettelflow-home", "lab", { about: path })');
        expect(HOME).toContain('typeof state?.about === "string"');
    });

    it("gives Cultivate the exit it was missing", () => {
        // "Write the counterpoint" assumes you know it. When you do not, this is where you go.
        expect(CULTIVATE).toContain("thinkAbout(this.plugin, path)");
        expect(CULTIVATE).toContain('t("cultivate_think_instead")');
    });

    it("keeps every Cultivate move — nothing was absorbed", () => {
        // Rejected in #472: a shared verb is not a shared capability. Cultivate's subject is a
        // note that exists, and a counterpoint to it belongs in it.
        for (const move of ["connect", "challenge", "question", "advance", "source"]) {
            expect({ move, kept: CULTIVATE.includes(move) }).toEqual({ move, kept: true });
        }
    });
});

describe("crossing writes nothing (#473)", () => {
    it("has the bridge reach no writer at all", () => {
        // Leaving a question unanswered is not an edit, and a bridge that dirties your vault is
        // a bridge nobody crosses twice.
        for (const writer of ["FileService", "FrontmatterService", "ThoughtStore", "vault().create", "vault().modify"]) {
            expect({ writer, used: BRIDGE_CODE.includes(writer) }).toEqual({ writer, used: false });
        }
    });

    it("writes only when you write, and then only to the lab", () => {
        expect(LAB).toContain("ThoughtStore.getInstance()");
        for (const writer of ["FileService.", "FrontmatterService", "NoteBuilder"]) {
            expect({ writer, used: LAB.includes(writer) }).toEqual({ writer, used: false });
        }
    });
});

describe("a thread keeps the context you arrived with (#473)", () => {
    it("inherits the subject onto every thought written in the visit", () => {
        expect(LAB).toContain("const subject = relation ? this.subjectOf(relation.to) ?? this.about : this.about;");
    });

    it("names the subject on the thread's root, and not on every answer", () => {
        expect(LAB).toContain("if (thought.about && !thought.respondsTo) this.renderSubject(box, thought.about);");
    });

    it("names the note rather than showing it", () => {
        // Showing the note would make the Lab a reading surface, which puts the note back at the
        // centre of a place that exists for the thought.
        const subject = LAB.slice(LAB.indexOf("private renderSubject"), LAB.indexOf("private renderLinks"));
        expect(subject).toContain("openLinkText(path");
        expect(subject.includes("cachedRead")).toBe(false);
    });

    it("says when the note it was about is gone, and stays usable", () => {
        expect(LAB).toContain('t("lab_about_gone"');
    });
});

/**
 * Capture lands in the lab (#475).
 *
 * `Inbox/<title>.md` with `state: fleeting` was three commitments before you had decided
 * anything: that it is a note, that it has a title, and that it has a lifecycle state. An impulse
 * has no subject.
 */
describe("an impulse does not become a note (#475)", () => {
    it("writes a thought, and reaches no note writer at all", () => {
        expect(CAPTURE).toContain("ThoughtStore.getInstance()");
        for (const note of ["CreateOnlyWriter", "QuickCaptureService", "createFileOnce", "state: fleeting", "Inbox/"]) {
            expect({ note, used: CAPTURE.includes(note) }).toEqual({ note, used: false });
        }
    });

    it("asks for the text and nothing else — no title, no folder, no state", () => {
        for (const asking of ["FolderSuggest", "lifecycle", "addDropdown"]) {
            expect({ asking, used: CAPTURE.includes(asking) }).toEqual({ asking, used: false });
        }
    });

    it("says so rather than falling back to a note when there is no lab", () => {
        // Falling back is how you end up with the thing this change exists to stop.
        expect(CAPTURE).toContain("if (!store.folder())");
        expect(CAPTURE).toContain('t("quick_capture_no_lab")');
    });

    it("is still one command, not two", () => {
        const commands = read("starters", "zcomponents", "QuickCaptureComponent.ts");
        expect(commands).toContain('id: "quick-capture"');
        expect((commands.match(/addCommand\(/g) ?? []).length).toBe(1);
    });
});
