/**
 * Jest configuration for ZettelFlow.
 *
 * Tests live under `test/`, mirroring `src/`. Source is imported through the same
 * bare-specifier aliases used in the app (resolved here via `moduleNameMapper`, mirroring
 * `tsconfig.json`'s `baseUrl: "src"`). The Obsidian runtime is stubbed by a manual mock so
 * pure logic can be tested without a running app.
 *
 * See docs/development/testing-and-guardrails.md.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/test", "<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  setupFiles: ["<rootDir>/test/setup.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    // A worker esbuild inlines as a string (#694); jest has no worker to start, so it gets none.
    "^(.+)\\?worker$": "<rootDir>/test/__mocks__/workerSource.ts",
    "^obsidian$": "<rootDir>/test/__mocks__/obsidian.ts",
    "^uuid$": "<rootDir>/test/__mocks__/uuid.ts",
    "^architecture$": "<rootDir>/test/__mocks__/architecture.ts",
    "^architecture/plugin$": "<rootDir>/test/__mocks__/architecture-plugin.ts",
    "^architecture/(.*)$": "<rootDir>/src/architecture/$1",
    "^dashboards$": "<rootDir>/src/dashboards",
    "^dashboards/(.*)$": "<rootDir>/src/dashboards/$1",
    "^echarts$": "<rootDir>/test/__mocks__/echarts.ts",
    "^echarts/(.*)$": "<rootDir>/test/__mocks__/echarts.ts",
    "^config$": "<rootDir>/src/config",
    "^config/(.*)$": "<rootDir>/src/config/$1",
    "^actions$": "<rootDir>/src/actions",
    "^actions/(.*)$": "<rootDir>/src/actions/$1",
    "^application$": "<rootDir>/src/application",
    "^application/(.*)$": "<rootDir>/src/application/$1",
    "^hooks$": "<rootDir>/src/hooks",
    "^hooks/(.*)$": "<rootDir>/src/hooks/$1",
    "^starters$": "<rootDir>/src/starters",
    "^starters/(.*)$": "<rootDir>/src/starters/$1",
    "^zettelkasten$": "<rootDir>/src/zettelkasten",
    "^zettelkasten/(.*)$": "<rootDir>/src/zettelkasten/$1",
    "^main$": "<rootDir>/src/main.ts",
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
  // A ratcheting coverage FLOOR (#317 E2, S8) — set just below the measured level so a regression
  // fails CI (`npm run test:coverage`). Raise these as more behavioral tests land; never a target to
  // game, only a floor that must not drop under normal work. Re-baselined 2026-09-07 after #320 retired
  // 74 unrendered strings *and the mirror tests that guarded them* — deleting tested code shrank the
  // covered surface, so functions fell 80→74.18 and lines 86→83.72. The floor is lowered to match that
  // leaner reality (not a regression to fix), and climbs again as epic #360 (D1–D5) adds tests.
  // Measured 2026-09-07: stmts 83.34 / branch 76.32 / func 74.18 / lines 83.72.
  // Re-measured 2026-10-06 over ALL of src (#690): `roots` now includes src, so a file no test loads
  // counts as uncovered instead of vanishing from the denominator. Before, the floor measured only
  // the files some test happened to import (84%), so a new test importing a wide graph "dropped"
  // coverage by 11 points without one line losing a test. Honest figure: stmts 56.73 / branch 55.25
  // / func 50.15 / lines 56.59. Same ratchet as before — floor just below, raise it as tests land.
  coverageThreshold: {
    global: {
      statements: 56,
      branches: 54,
      functions: 49,
      lines: 56,
    },
  },
  clearMocks: true,
};
