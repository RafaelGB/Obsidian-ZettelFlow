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
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  setupFiles: ["<rootDir>/test/setup.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    "^obsidian$": "<rootDir>/test/__mocks__/obsidian.ts",
    "^uuid$": "<rootDir>/test/__mocks__/uuid.ts",
    "^architecture$": "<rootDir>/test/__mocks__/architecture.ts",
    "^architecture/plugin$": "<rootDir>/test/__mocks__/architecture-plugin.ts",
    "^architecture/(.*)$": "<rootDir>/src/architecture/$1",
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
  coverageThreshold: {
    global: {
      statements: 83,
      branches: 75,
      functions: 74,
      lines: 83,
    },
  },
  clearMocks: true,
};
