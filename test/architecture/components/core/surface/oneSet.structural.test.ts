import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";

const SRC = join(__dirname, "..", "..", "..", "..", "..", "src");
const read = (...path: string[]) => readFileSync(join(SRC, ...path), "utf8");
const HOME = read("architecture", "components", "core", "home", "HomeModeRenderer.ts");
const LAB = read("architecture", "components", "core", "lab", "LabRenderer.ts");
const CULTIVATE = read("architecture", "components", "core", "cultivate", "CultivateModeRenderer.ts");

/** Home, Cultivate and Think as one set (#875) — the wiring the set's own test cannot see. */
describe("one set, and only Home's (#875 FR-1, FR-4)", () => {
    it("films Home's three modes in tab order, and no other surface", () => {
        const home = SURFACES.find((surface) => surface.viewType === "zettelflow-home");
        expect(home?.continuous).toBe(true);
        expect(home?.modes.map((mode) => mode.id)).toEqual(["home", "cultivate", "lab"]);
        for (const surface of SURFACES.filter((each) => each.viewType !== "zettelflow-home")) expect(surface.continuous).toBeUndefined();
    });
});

describe("Home's two doors open in this tab (#875 FR-7, FR-8)", () => {
    it("sends Last thought and One idea to tend through the door, each card marked so the way back finds it", () => {
        expect(HOME).toContain('this.door("lab", { ...subject, thought: thought.id }, "last-thought"');
        expect(HOME).toContain('card.setAttribute("data-zf-door", "last-thought")');
        expect(HOME).toContain('this.door("cultivate", { target: idea.path }, "idea-to-tend", invite)');
        expect(HOME).toContain('"data-zf-door": "idea-to-tend"');
    });

    it("leaves everything else exactly as it was: the note, the reading, Explore", () => {
        expect(HOME).toContain('void this.app.workspace.openLinkText(path, "", false)');
        expect(HOME).toContain("void this.openReading(reading, event.currentTarget as HTMLElement)");
        expect(HOME).toContain('activateSurface(this.app, "zettelflow-explore", "explore"');
    });

    it("is ready only once the last thought has had its read", () => {
        expect(HOME).toContain("void this.readLastThought().finally(() => this.settle());");
    });
});

describe("Think and Cultivate land the card, and offer the way back (#875 AC-5, AC-6, AC-7)", () => {
    it("lands Think on the thought, growing the window by appending", () => {
        const landing = LAB.slice(LAB.indexOf("landing(payload"), LAB.indexOf("landed(el"));
        expect(landing).toContain("this.growList()");
        expect(landing).not.toContain("this.render()");
        expect(landing).toContain("this.cards.get(id) ?? null");
        expect(LAB).toContain('el.addClass(c("lab-arrived"))');
    });

    it("lands Cultivate only on the idea it was sent", () => {
        expect(CULTIVATE).toContain('if (typeof target !== "string" || this.session?.path !== target) return null;');
        expect(CULTIVATE).toContain('`.${c("cultivate-target")}`');
    });

    it("draws the way back as navigation, keeping one primary", () => {
        for (const mode of [LAB, CULTIVATE]) {
            expect(mode).toContain("if (this.backTo) bar.nav(this.backTo);");
            expect(mode.match(/bar\.primary\(/g)).toHaveLength(1);
        }
    });

    it("lets Think keep Esc while it is taking a source away", () => {
        expect(LAB).toContain("return Boolean(this.picker?.isOpen()) || this.sources.picked.length > 0;");
    });
});

describe("no mode fades in any more (#875 AC-3, AC-M3)", () => {
    it("drops the whole-mode entrance from the family page and its stylesheet", () => {
        expect(read("architecture", "components", "core", "family", "family.ts")).not.toContain("family-view");
        const sheet = read("styles", "components", "family.scss");
        expect(sheet).not.toContain("family-view");
        expect(sheet).not.toContain("zf-family-enter");
    });

    it("puts the pan on the frame meter, as every other shot is", () => {
        expect(read("architecture", "components", "core", "surface", "ModeHostView.ts")).toContain('meter: "home-pan"');
        const pan = read("architecture", "components", "core", "surface", "cameraPan.ts");
        expect(pan).toContain('meterGesture(options.meter, "clock", win)');
        expect(pan).toContain("meter?.interrupted();");
        expect(pan).toContain("meter?.end();");
    });

    it("never moves the set sideways: the viewport clips, the landing scrolls by number", () => {
        expect(read("styles", "components", "surface.scss")).toContain("overflow: clip;");
        const host = read("architecture", "components", "core", "surface", "ModeHostView.ts");
        expect(host).toContain("centeredScrollTop(");
        expect(host).not.toContain("scrollIntoView");
    });
});
