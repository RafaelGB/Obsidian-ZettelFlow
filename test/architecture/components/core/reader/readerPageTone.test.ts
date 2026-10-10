/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "@jest/globals";
import { pageTone } from "architecture/components/core/reader/readerPageTone";

type RGBA = [number, number, number, number];

/** A canvas the sampler draws on: what it "draws" is the colour of the source it is given. */
function sampler(colourOf: (source: any) => RGBA | "taint") {
    const drawn: any[] = [];
    const createEl = (_tag: string, options: any) => {
        const size = options.attr.width * options.attr.height;
        let last: any = null;
        return {
            remove() {},
            getContext: () => ({
                drawImage(source: any) {
                    last = source;
                    drawn.push(source);
                },
                getImageData() {
                    const colour = colourOf(last);
                    if (colour === "taint") throw new Error("SecurityError");
                    return { data: Array.from({ length: size }, () => colour).flat() };
                },
            }),
        };
    };
    return { createEl, drawn };
}

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });

function canvas(colour: RGBA) {
    const s = sampler(() => colour);
    return { el: { localName: "canvas", createEl: s.createEl, colour } as any, s };
}

/** A designed page: its shadow root's elements, in paint order — a box, a background, a picture. */
interface Painted {
    box: ReturnType<typeof rect>;
    bg?: string;
    bgImage?: string;
    img?: RGBA | "taint";
    hidden?: boolean;
}
function designed(elements: Painted[], pictures: Record<string, RGBA> = {}) {
    const els = elements.map((e) => ({ localName: e.img ? "img" : "div", getBoundingClientRect: () => e.box, decode: async () => undefined, colour: e.img, painted: e }));
    const root = { querySelectorAll: () => els };
    const s = sampler((source) => source.colour);
    const host = { shadowRoot: root, getBoundingClientRect: () => rect(0, 0, 400, 600) };
    const picture: any = {
        localName: "div",
        createEl: (tag: string, options: any) => {
            if (tag === "img") {
                const colour = pictures[options.attr.src];
                return { remove() {}, decode: async () => (colour ? undefined : Promise.reject(new Error("EncodingError"))), colour };
            }
            return s.createEl(tag, options);
        },
        querySelector: (sel: string) => (sel === ".zettelkasten-flow__reader-designed-host" ? host : null),
        doc: {
            defaultView: {
                getComputedStyle: (el: any) => ({
                    backgroundColor: el.painted.bg ?? "rgba(0, 0, 0, 0)",
                    backgroundImage: el.painted.bgImage ?? "none",
                    visibility: el.painted.hidden ? "hidden" : "visible",
                    opacity: "1",
                }),
            },
        },
    };
    return { picture, s };
}

const PAGE = rect(0, 0, 400, 600);

describe("what a printed page looks like under its ink (ink that reads on dark pages)", () => {
    it("samples a PDF page's canvas: paper is light, a page printed black is dark", async () => {
        expect(await pageTone(canvas([255, 255, 255, 255]).el)).toBe("light");
        expect(await pageTone(canvas([18, 18, 22, 255]).el)).toBe("dark");
    });

    it("says nothing of a canvas it cannot draw or read", async () => {
        const s = sampler(() => "taint");
        expect(await pageTone({ localName: "canvas", createEl: s.createEl } as any)).toBeNull();
        expect(await pageTone({ localName: "canvas", createEl: () => ({ remove() {}, getContext: () => null }) } as any)).toBeNull();
    });

    it("reads a designed page from what it paints: its html, its body, the panels on top", async () => {
        expect(await pageTone(designed([{ box: PAGE, bg: "rgb(255, 255, 255)" }, { box: PAGE, bg: "rgb(10, 10, 10)" }]).picture)).toBe("dark");
        expect(await pageTone(designed([{ box: PAGE, bg: "rgb(0, 0, 0)" }]).picture)).toBe("dark");
        expect(await pageTone(designed([{ box: PAGE, bg: "rgb(255, 250, 240)" }]).picture)).toBe("light");
        // A comic's title page: a light body, under a dark panel over all of it — a dark page.
        expect(await pageTone(designed([{ box: PAGE, bg: "rgb(255, 250, 240)" }, { box: rect(0, 0, 392, 592), bg: "rgb(38, 50, 56)" }]).picture)).toBe("dark");
        // A hidden panel paints nothing; a small dark one does not make a light page dark.
        expect(await pageTone(designed([{ box: PAGE, bg: "rgb(255, 255, 255)" }, { box: PAGE, bg: "rgb(0, 0, 0)", hidden: true }]).picture)).toBe("light");
        expect(await pageTone(designed([{ box: PAGE, bg: "rgb(255, 255, 255)" }, { box: rect(0, 0, 100, 100), bg: "rgb(0, 0, 0)" }]).picture)).toBe("light");
    });

    it("reads a page's pictures and background pictures, and passes over one it cannot read", async () => {
        const art = designed([{ box: PAGE, bg: "rgb(255, 255, 255)" }, { box: rect(0, 0, 400, 560), img: [5, 5, 5, 255] }]);
        expect(await pageTone(art.picture)).toBe("dark");
        expect(art.s.drawn).toHaveLength(1);
        const panels = designed([{ box: PAGE, bg: "rgb(255, 255, 255)" }, { box: PAGE, bgImage: 'url("blob:app://x/1")' }], { "blob:app://x/1": [20, 20, 30, 255] });
        expect(await pageTone(panels.picture)).toBe("dark");
        // A picture that will not be read: what is under it still answers.
        const tainted = designed([{ box: PAGE, bg: "rgb(0, 0, 0)" }, { box: PAGE, img: "taint" }, { box: PAGE, bgImage: 'url("blob:app://x/gone")' }]);
        expect(await pageTone(tainted.picture)).toBe("dark");
        // Nothing painted at all: the page cannot say.
        expect(await pageTone(designed([]).picture)).toBeNull();
    });

    it("says nothing of a picture that is neither a canvas nor a designed page", async () => {
        expect(await pageTone({ localName: "div", querySelector: () => null } as any)).toBeNull();
    });
});
