/**
 * A module bundled into a string by esbuild (`esbuild.config.mjs`, the inline-worker plugin) and started
 * as a Web Worker from a Blob (#694): Obsidian loads one `main.js`, so a worker cannot be a second file.
 */
declare module "*?worker" {
    const source: string;
    export default source;
}
