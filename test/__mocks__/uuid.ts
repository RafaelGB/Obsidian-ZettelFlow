// Deterministic stub of the ESM-only `uuid` package for jest (node_modules are not transformed).
// Real uuids are irrelevant to logic tests; a fixed value keeps assertions stable.
export const v4 = (): string => "00000000-0000-0000-0000-000000000000";
