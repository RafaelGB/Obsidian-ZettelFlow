import { Platform } from "obsidian";

type Flags = Partial<Record<keyof typeof Platform, boolean>>;

/**
 * Run `fn` as if on another platform (#750): an iPad is `{ isMobile: true, isTablet: true, isIosApp:
 * true }`. The mock's flags are put back afterwards, whatever `fn` does — sync or async.
 */
export function withPlatform<T>(overrides: Flags, fn: () => T): T {
    const flags = Platform as unknown as Record<string, boolean>;
    const saved = { ...flags };
    Object.assign(flags, overrides);
    const restore = () => {
        for (const key of Object.keys(flags)) delete flags[key];
        Object.assign(flags, saved);
    };
    let result: T;
    try {
        result = fn();
    } catch (error) {
        restore();
        throw error;
    }
    if (result instanceof Promise) return result.finally(restore) as T;
    restore();
    return result;
}

/** An iPad, as Obsidian's `Platform` describes one. */
export const IPAD: Flags = { isMobile: true, isTablet: true, isIosApp: true, isDesktop: false, isDesktopApp: false, isWin: false };
