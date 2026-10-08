import { describe, it, expect } from "@jest/globals";
import {
    STILL,
    beginCloseShot,
    beginOpenShot,
    camCss,
    compose,
    landOn,
    localCam,
    onto,
    pushIn,
    shotIncoming,
    type Box,
} from "architecture/components/core/reader/readerShot";

const close = (a: Box, b: Box) => {
    expect(a.left).toBeCloseTo(b.left, 6);
    expect(a.top).toBeCloseTo(b.top, 6);
    expect(a.width).toBeCloseTo(b.width, 6);
    expect(a.height).toBeCloseTo(b.height, 6);
};

/** A small shelf cover, the Library's frame, and the Reader's column on a wide window. */
const cover: Box = { left: 300, top: 260, width: 120, height: 180 };
const frame: Box = { left: 0, top: 40, width: 1400, height: 820 };
const column: Box = { left: 380, top: 88, width: 640, height: 700 };

/**
 * One continuous shot (#734, epic #729): the camera that carries the book from its slot on the shelf
 * to the reading column, and back. Pure arithmetic, so the shot lands exactly where the Reader is.
 */
describe("the camera of one continuous shot (#734)", () => {
    it("pushes into the book until it is most of the frame, centred, keeping its shape", () => {
        const push = pushIn(cover, frame);
        const book = onto(push, cover);
        expect(book.height).toBeCloseTo(frame.height * 0.78, 6);
        expect(book.width / book.height).toBeCloseTo(cover.width / cover.height, 6);
        expect(book.left + book.width / 2).toBeCloseTo(frame.left + frame.width / 2, 6);
        expect(book.top + book.height / 2).toBeCloseTo(frame.top + frame.height / 2, 6);
    });

    it("lands the page exactly on the reading column: its left edge, its width, the column's top", () => {
        const push = pushIn(cover, frame);
        const land = compose(landOn(onto(push, cover), column), push);
        const page = onto(land, cover);
        expect(page.left).toBeCloseTo(column.left, 6);
        expect(page.top).toBeCloseTo(column.top, 6);
        expect(page.width).toBeCloseTo(column.width, 6);
    });

    it("composes cameras in the order they film, and leaves a still camera still", () => {
        const a = { s: 2, x: 10, y: 20 };
        const b = { s: 3, x: -5, y: 7 };
        close(onto(compose(b, a), cover), onto(b, onto(a, cover)));
        close(onto(STILL, cover), cover);
        expect(camCss(STILL)).toBe("translate(0px, 0px) scale(1)");
    });

    it("films an element in the workspace the same as the rig, about its own corner", () => {
        // The Library's view sits at (L, T): turning about its own top-left must put every point
        // where the window's camera would.
        const cam = { s: 2.5, x: -300, y: -120 };
        const origin = { left: 260, top: 40 };
        const local = localCam(cam, origin);
        const point = { left: 400, top: 300, width: 0, height: 0 };
        const viaWindow = onto(cam, point);
        const viaOwnCorner = { left: origin.left + (point.left - origin.left) * local.s + local.x, top: origin.top + (point.top - origin.top) * local.s + local.y };
        expect(viaOwnCorner.left).toBeCloseTo(viaWindow.left, 6);
        expect(viaOwnCorner.top).toBeCloseTo(viaWindow.top, 6);
    });

    it("plays no shot where motion is not welcome: reduced motion, or no animation to play", () => {
        const still = { getBoundingClientRect: () => ({ ...cover }) } as unknown as HTMLElement;
        expect(beginOpenShot(still, still)).toBe(false);
        expect(shotIncoming()).toBe(false);
        let left = false;
        expect(beginCloseShot(still, still, still, "B/b.epub", () => (left = true))).toBe(false);
        // The caller leaves on its own when there is no shot: the shot never leaves for it.
        expect(left).toBe(false);
    });
});
