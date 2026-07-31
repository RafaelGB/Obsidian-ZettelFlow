# Tasks: lint burn-down (#85)

- **Spec:** [spec.md](spec.md)

Driven in parts, each a commit that keeps `verify` + CI green and drives eslint **errors** down
monotonically. Baseline at start: 273 errors / 78 warnings.

- [x] **Part 1 — safe/mechanical + obsidianmd/*** — prefer-create-el, prefer-file-manager-trash-file,
  no-unnecessary-type-assertion, restrict-template-expressions, await-thenable, no-empty,
  no-fallthrough marker, eslint-comments/*. **273e → 230e**.
- [ ] **Part 2 — promises** — `no-floating-promises` (66) + `no-misused-promises` (25): add
  `await`/`void`/handlers, per subtree.
- [ ] **Part 3 — typing** — `no-unsafe-*` (~130) + `no-explicit-any` (43) + `no-base-to-string`:
  proper types (canvas typings, FnConstructor, PatchHelper, VaultHooks, action settings).
- [ ] **Part 4 — tail + make blocking** — `no-eval` (script feature), `prefer-abstract-input-suggest`,
  `rule-custom-message`, `settings-tab/prefer-setting-definitions`, `prefer-get-language`
  (+ minAppVersion 1.8.7); then remove `continue-on-error` from `ci.yml`.

## Definition of done

- [ ] `npx eslint "src/**"` → 0 errors; CI `lint:obsidian` blocking; `verify` green; issue in PR `Closes`.
