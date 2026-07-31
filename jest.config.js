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
  clearMocks: true,
};
