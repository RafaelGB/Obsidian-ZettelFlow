const base = require("./jest.config");

/**
 * The **budget** suite (#457, epic #452) — separate from `npm test` on purpose.
 *
 * It builds vaults of fifty thousand notes, so it is far too slow to sit in the loop a developer
 * runs on every save. It is its own command (`npm run test:perf`) and its own CI step, and it
 * fails the build when a budget is exceeded.
 *
 * `--runInBand` (set in the script, not here) matters: parallel workers compete for the same cores
 * and turn every timing into a measurement of the other workers.
 *
 * @type {import('jest').Config}
 */
module.exports = {
    ...base,
    testMatch: ["**/*.perf.ts"],
    // Timings, not coverage — and collecting coverage would instrument the code being timed.
    collectCoverage: false,
    coverageThreshold: undefined,
    testTimeout: 300_000,
};
