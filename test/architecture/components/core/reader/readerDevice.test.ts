import { describe, it, expect } from "@jest/globals";
import { withPlatform, IPAD } from "../../../../support/platform";
import { DEVICE_LIMITS, canFullscreen, isApple, panelShape, tooLarge, touchPointer } from "architecture/components/core/reader/readerDevice";

const doc = (fullscreenEnabled?: boolean) =>
    ({ fullscreenEnabled, body: { requestFullscreen: () => Promise.resolve() } }) as unknown as Document;

/** What this device is (#750 D1): the answers the touch, the sheet and deep reading read. */
describe("the device the Reader is on (#750)", () => {
    it("counts a finger and a pen as touch, never a mouse or a trackpad", () => {
        expect(touchPointer({ pointerType: "touch" })).toBe(true);
        expect(touchPointer({ pointerType: "pen" })).toBe(true);
        expect(touchPointer({ pointerType: "mouse" })).toBe(false);
        expect(touchPointer({ pointerType: "" })).toBe(false);
    });

    it("offers fullscreen only where the platform can go there", () => {
        expect(canFullscreen(doc())).toBe(true);
        expect(canFullscreen(doc(true))).toBe(true);
        expect(canFullscreen(doc(false))).toBe(false);
        expect(canFullscreen({ fullscreenEnabled: true, body: {} } as unknown as Document)).toBe(false);
        expect(canFullscreen(undefined)).toBe(false);
        withPlatform(IPAD, () => expect(canFullscreen(doc(true))).toBe(false));
    });

    it("is an Apple device on macOS and on iOS", () => {
        expect(isApple()).toBe(false);
        withPlatform({ isMacOS: true, isWin: false }, () => expect(isApple()).toBe(true));
        withPlatform(IPAD, () => expect(isApple()).toBe(true));
    });

    it("opens panels as a bottom sheet on a mobile reading taller than wide, a card otherwise", () => {
        expect(panelShape({ width: 820, height: 1180, mobile: true })).toBe("sheet"); // iPad portrait
        expect(panelShape({ width: 1180, height: 820, mobile: true })).toBe("card"); // iPad landscape
        expect(panelShape({ width: 1032, height: 1376, mobile: true })).toBe("sheet"); // 13" portrait
        expect(panelShape({ width: 390, height: 844, mobile: true })).toBe("sheet"); // a phone
        expect(panelShape({ width: 678, height: 820, mobile: true })).toBe("sheet"); // half a landscape Split View
        expect(panelShape({ width: 1000, height: 1600, mobile: false })).toBe("card"); // a tall desktop window
        expect(panelShape({ width: 0, height: 0, mobile: true })).toBe("card"); // not laid out yet
    });

    it("refuses a source past the device's limit, on mobile only", () => {
        const big = DEVICE_LIMITS.pdf + 1;
        expect(tooLarge(big * 100, "pdf")).toBe(false);
        withPlatform(IPAD, () => {
            expect(tooLarge(DEVICE_LIMITS.pdf, "pdf")).toBe(false);
            expect(tooLarge(big, "pdf")).toBe(true);
            expect(tooLarge(DEVICE_LIMITS.epub + 1, "epub")).toBe(true);
            expect(tooLarge(DEVICE_LIMITS.epub, "epub")).toBe(false);
            expect(tooLarge(undefined, "pdf")).toBe(false);
        });
    });
});
