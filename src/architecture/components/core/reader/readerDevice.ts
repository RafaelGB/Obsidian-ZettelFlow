import { Platform } from "obsidian";
import type { SourceFormat } from "application/library/sourceMeta";

/**
 * **What this device is** (#750, epic #739): the few answers the Reader's touch, its panels and its
 * fullscreen depend on. Asked of Obsidian's `Platform` and of the pointer itself — never of the user
 * agent. Deep reading (#764) reads `canFullscreen`; the trail's back-swipe (#761) reads `touchPointer`.
 */

/** A finger or a pen. A mouse or a trackpad never turns a page (FR-1). */
export function touchPointer(event: { pointerType?: string }): boolean {
    return event.pointerType === "touch" || event.pointerType === "pen";
}

/** macOS or iOS: the shortcuts sheet names ⌘ and ⌥ there (FR-12). */
export function isApple(): boolean {
    return Platform.isMacOS || Platform.isIosApp;
}

/**
 * Whether the platform can put the window in fullscreen. Never on mobile, where the app's web view
 * does not grant it (P6), nor where the document says it cannot. A control that does nothing is
 * worse than none (FR-10).
 */
export function canFullscreen(doc: Document | undefined): boolean {
    if (Platform.isMobile || !doc) return false;
    return doc.fullscreenEnabled !== false && typeof (doc.body as Partial<HTMLElement> | null)?.requestFullscreen === "function";
}

/**
 * How a side panel opens: as a **bottom sheet** on a mobile reading taller than it is wide (an iPad in
 * portrait, a phone, a narrow Split View window), as the floating **card** everywhere else (FR-7).
 */
export function panelShape(size: { width: number; height: number; mobile: boolean }): "sheet" | "card" {
    if (!size.mobile || !(size.width > 0) || !(size.height > 0)) return "card";
    return size.height > size.width ? "sheet" : "card";
}

const MB = 1024 * 1024;

/**
 * The largest source a mobile device opens (FR-13), in bytes. A whole book is held in memory while it
 * is read, and WebKit reloads the app when it runs out. **Provisional and conservative**: these are
 * the values the device walk confirms or raises — see the *Device walk* record on issue #750 (P11).
 * Below them a book opens; past them the page says why not, and nothing is read.
 */
export const DEVICE_LIMITS: Record<SourceFormat, number> = {
    pdf: 100 * MB,
    epub: 50 * MB,
};

/** A source this device should not try to open: mobile only, and only past the limit. */
export function tooLarge(size: number | undefined, format: SourceFormat): boolean {
    if (!Platform.isMobile || typeof size !== "number") return false;
    return size > DEVICE_LIMITS[format];
}
