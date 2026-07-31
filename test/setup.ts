// Polyfills for Obsidian's non-standard prototype augmentations used by code under test.
/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof (Array.prototype as any).contains !== "function") {
  (Array.prototype as any).contains = function <T>(this: T[], value: T): boolean {
    return this.indexOf(value) !== -1;
  };
}
export {};
