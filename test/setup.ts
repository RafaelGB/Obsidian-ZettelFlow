// Polyfills for Obsidian's non-standard prototype augmentations used by code under test.
/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof (Array.prototype as any).contains !== "function") {
  (Array.prototype as any).contains = function <T>(this: T[], value: T): boolean {
    return this.indexOf(value) !== -1;
  };
}

// Obsidian runs in a browser-like environment, so plugin code uses `window.setTimeout` /
// `window.clearTimeout` (the `preferWindowTimers` guideline). Jest's node test env has no `window`;
// alias it to `globalThis` so those calls resolve — and so `jest.useFakeTimers()` (which fakes the
// global timers) applies to them.
if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = globalThis;
}
export {};
