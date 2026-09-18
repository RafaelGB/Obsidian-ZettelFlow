import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const LAB = readFileSync(join(SRC, "architecture", "components", "core", "lab", "LabRenderer.ts"), "utf8");
const COMMANDS = readFileSync(join(SRC, "starters", "zcomponents", "SurfaceCommandsComponent.ts"), "utf8");
const EN = readFileSync(join(SRC, "architecture", "lang", "locale", "en.ts"), "utf8");
const STORE = readFileSync(join(SRC, "architecture", "plugin", "thinking", "ThoughtStore.ts"), "utf8");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

/**
 * The space, and the two properties that decide whether anyone uses it (#467).
 *
 * The four moves are behaviour and are covered by the pure model (#466). What has to be pinned
 * here is what a renderer can lose silently: that the way in costs nothing, and that this surface
 * never becomes a place that counts.
 */
describe("the way in costs nothing (#467)", () => {
    it("has one command that opens the lab mode directly", () => {
        expect(COMMANDS).toContain('id: "think"');
        expect(COMMANDS).toContain('activateSurface(this.plugin.app, "zettelflow-home", "lab")');
    });

    it("puts no modal, prompt or picker in the command's path", () => {
        // The whole promise is a blinking cursor. Anything that asks a question first breaks it.
        for (const asking of ["Modal", "prompt(", "Suggest"]) {
            expect(COMMANDS.includes(asking)).toBe(false);
        }
        // The Lab may open a modal — crystallization (#468) is a decision and deserves one — but
        // never on the way *in*. The path from the command to a cursor is onload → readLab →
        // render → renderComposer, and none of it may ask anything.
        const entry = LAB.slice(LAB.indexOf("onload()"), LAB.indexOf("private renderThought"));
        for (const asking of ["Modal", "prompt(", "Suggest", "confirm("]) {
            expect({ asking, onTheWayIn: entry.includes(asking) }).toEqual({ asking, onTheWayIn: false });
        }
    });

    it("opens a modal only for crystallizing, which is a decision and not an entrance", () => {
        const modals = [...LAB.matchAll(/new (\w*Modal)\(/g)].map((match) => match[1]);
        expect([...new Set(modals)]).toEqual(["CrystallizeModal"]);
    });

    it("focuses an empty thought as soon as it renders", () => {
        expect(LAB).toContain("area.focus()");
        expect(LAB).toContain("renderComposer");
    });

    it("saves on blur and on close — leaving must never cost a sentence", () => {
        expect(LAB).toContain('registerDomEvent(area, "blur", () => this.flush())');
        expect(LAB).toMatch(/onunload\(\): void \{\s*this\.flush\(\);/);
    });
});

/**
 * A pause while writing is thinking, not a boundary.
 *
 * The first version committed a new thought on a debounce and it was unusable: stopping to think
 * for half a second turned half a sentence into a card, the surface rebuilt itself, and the
 * cursor was gone. These pin the fix so it cannot come back.
 */
describe("typing, by itself, creates nothing (#467 regression)", () => {
    it("has the composer's keystrokes do nothing but remember the draft", () => {
        expect(LAB).toContain("this.registerDomEvent(area, \"input\", () => (this.draft = area.value));");
        // No timer anywhere near the composer: the only debounce left is for editing a thought
        // that already exists, where nothing moves on screen.
        const composer = LAB.slice(LAB.indexOf("private renderComposer"), LAB.indexOf("private async commit"));
        expect(composer.includes("setTimeout(() => this.flush")).toBe(false);
        expect(composer.includes("scheduleEdit")).toBe(false);
    });

    it("commits at a real boundary: the shortcut, or leaving the box", () => {
        expect(LAB).toContain('event.key === "Enter" && (event.metaKey || event.ctrlKey)');
        expect(LAB).toContain('registerDomEvent(area, "blur", () => this.flush())');
    });

    it("inserts a new top-level thought instead of rebuilding the surface under you", () => {
        const commit = LAB.slice(LAB.indexOf("private async commit"), LAB.indexOf("private renderNode"));
        expect(commit).toContain("this.listEl.prepend(card)");
    });

    it("redraws for a response, because only a redraw knows where it belongs — and gives the cursor back", () => {
        // A response has to land under what it answers. That redraw is safe: it happens on an
        // explicit commit, never on a timer, and the composer is refocused immediately.
        const commit = LAB.slice(LAB.indexOf("private async commit"), LAB.indexOf("private renderNode"));
        expect(commit).toMatch(/if \(relation\) \{[\s\S]*this\.render\(\);[\s\S]*this\.composerEl\?\.focus\(\);/);
    });

    it("keeps the draft outside the DOM, so a redraw cannot lose it", () => {
        expect(LAB).toContain("private draft = \"\";");
        expect(LAB).toContain("area.value = this.draft;");
    });

    it("never redraws while a text box has focus, and says so in one place", () => {
        expect(LAB).toContain("private refresh(): void {");
        expect(LAB).toContain("if (active instanceof HTMLTextAreaElement && this.container.contains(active)) return;");
    });

    it("arms the composer for a fork or a challenge, rather than creating an empty card", () => {
        // An empty file you have to go back and fill is worse than no file.
        const arm = LAB.slice(LAB.indexOf("private arm("), LAB.indexOf("private async connect"));
        expect(arm).toContain("this.relation = { to: origin.id, as: kind }");
        expect(arm.includes("ThoughtStore")).toBe(false);
    });

    it("acts on mousedown, so a click is not lost to the blur it causes", () => {
        expect(LAB).toContain('this.registerDomEvent(button, "mousedown"');
    });
});

describe("the lab reaches no writer but its own (#467)", () => {
    it("writes only through ThoughtStore", () => {
        // The shape of #446's workbenchWritesNothing: a surface that could write elsewhere would
        // make a thought into knowledge by accident.
        for (const writer of ["FileService.", "FrontmatterService", "NoteBuilder", "vault().create", "vault().modify"]) {
            expect({ writer, used: LAB.includes(writer) }).toEqual({ writer, used: false });
        }
        expect(LAB).toContain("ThoughtStore.getInstance()");
    });

    it("offers four moves, and not a fifth", () => {
        // Everything else belongs to the operator engine in phase 2. A fifth here would start
        // the feature collection this epic exists to prevent.
        const moves = ["lab_fork", "lab_challenge", "lab_connect"];
        for (const move of moves) expect(LAB).toContain(move);
        // `leave` is not a button: it is what closing does, which is the point of it being free.
        expect(LAB.includes("lab_leave")).toBe(false);
    });
});

describe("the lab never counts (#467)", () => {
    it("renders no total, badge or pending list of thoughts", () => {
        const counting = /\b(thoughts|pending|unprocessed)\.length\b(?![^\n]*links)/;
        const rendered = LAB.split("\n").filter((line) => /createSpan|createDiv|setText|text:/.test(line));
        expect(rendered.filter((line) => counting.test(line))).toEqual([]);
    });

    it("uses no urgency or judgement word in any string it shows", () => {
        const keys = [
            "lab_intro",
            "lab_new_thought",
            "lab_no_folder",
            "lab_fork",
            "lab_challenge",
            "lab_connect",
            "lab_forked",
            "lab_challenges",
            "surface_mode_lab",
            "command_think",
        ];
        const forbidden = /\b(pending|overdue|waiting|remaining|unprocessed|should|must|promising|important|productive)\b/i;
        for (const key of keys) {
            const match = new RegExp(`${key}: '([^']*)'`).exec(EN);
            expect({ key, found: match !== null }).toEqual({ key, found: true });
            expect({ key, urgent: forbidden.test(match?.[1] ?? "") }).toEqual({ key, urgent: false });
        }
    });

    it("has no other surface counting thoughts either", () => {
        // A counter anywhere — a ribbon, a status bar, Home — would destroy the thing the Lab is
        // for, and it would not be in this file when it happened.
        const offenders = sources(SRC)
            .filter((path) => !path.includes(join("core", "lab")))
            .filter((path) => {
                const text = readFileSync(path, "utf8");
                return /thoughts\.length|thoughtCount|pendingThoughts/.test(text);
            })
            .map((path) => relative(SRC, path));
        expect(offenders).toEqual([]);
    });
});

/**
 * You can tidy the lab, and nothing you remove is gone (#467 follow-up).
 *
 * A refuge you cannot tidy becomes a junk drawer — but "delete" in a place you were told is safe
 * has to mean the same thing it means everywhere else in the plugin: Obsidian's trash.
 */
describe("throwing a thought away (#467 follow-up)", () => {
    it("goes to the trash, never to a delete", () => {
        expect(STORE).toContain("public async discard(");
        expect(STORE).toContain("FileService.deleteFile(file)");
        // FileService.deleteFile is trashFile underneath (#453); nothing here reaches a raw delete.
        expect(STORE).not.toContain("vault().delete(");
    });

    it("can be put back, from memory, without a trip to the trash folder", () => {
        expect(STORE).toContain("public async restore(");
        expect(LAB).toContain("private async undoDiscard(");
        expect(LAB).toContain("ThoughtStore.getInstance().restore(thought)");
    });

    it("offers the undo where the card was, never as a toast that interrupts", () => {
        expect(LAB).toContain('c("lab-discarded")');
        expect(LAB).toContain('t("lab_discard_undo")');
        // `Notice(` is already forbidden on this surface by noDebt.test.ts, which is what makes
        // an inline strip the only option — and it is the better one anyway.
        expect(LAB.includes("new Notice")).toBe(false);
    });
});

describe("the moves explain themselves (#467 follow-up)", () => {
    it("gives every icon a tooltip, because an icon is opaque until you know it", () => {
        expect(LAB).toContain("setTooltip(button, label);");
    });

    it("has a legend that says what each move does, closed by default", () => {
        expect(LAB).toContain("private showingLegend = false;");
        expect(LAB).toContain("private renderLegend(");
        for (const key of [
            "lab_legend_fork",
            "lab_legend_challenge",
            "lab_legend_connect",
            "lab_legend_set_aside",
            "lab_legend_decided_against",
            "lab_legend_crystallize",
            "lab_legend_discard",
        ]) {
            expect({ key, explained: EN.includes(`${key}:`) }).toEqual({ key, explained: true });
        }
    });

    it("explains each move in a sentence, not in a word", () => {
        const sentence = /lab_legend_(fork|challenge|connect): '([^']{30,})'/g;
        expect([...EN.matchAll(sentence)]).toHaveLength(3);
    });
});
