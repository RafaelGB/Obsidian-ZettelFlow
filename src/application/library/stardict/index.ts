/**
 * **StarDict, read on the device** (#766, epic #741) — the open dictionary format of KOReader and
 * GoldenDict: `.ifo`, `.idx`, `.dict` or `.dict.dz`, and an optional `.syn`. Pure over bytes; no
 * module here reads a file or the network.
 */
export * from "./ifo";
export * from "./idx";
export * from "./syn";
export * from "./dictzip";
export * from "./entry";
export * from "./languages";
export * from "./lookup";
