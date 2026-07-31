---
name: release
description: Cut a compliant ZettelFlow plugin release — version bump, versions.json, build, tag, and GitHub Release with the correct artifacts. Use when the user asks to "release", "publish a new version", "cut a release", "bump the version", or "prepare a release".
---

# Release ZettelFlow

A release is driven by **pushing a git tag**: `.github/workflows/releases.yml` runs
`npm run release` and uploads `dist/main.js`, `manifest.json`, `dist/styles.css` to a GitHub
Release named after the tag. Obsidian's community directory then runs its automated review on the
new version. This skill makes that compliant.

> ⚠️ **Blocking prerequisites (currently broken in this repo):** `version-bump.mjs` and
> `versions.json` are referenced by the `npm version` script but **do not exist**. Restore them
> before relying on `npm version`. Until then, do the version bump manually as below.

## 0. Pre-flight quality gate

Run the **`obsidian-plugin-quality`** skill first and resolve blocking findings (missing
`versions.json`, manifest errors, `eslint-plugin-obsidianmd` errors). A release that fails
Obsidian's automated review lowers the plugin's score.

## 1. Choose the version

Follow semver. Decide `X.Y.Z` and confirm the **`minAppVersion`** the new build actually
requires (bump it only if you started using a newer Obsidian API).

## 2. Bump the manifests and versions map

- `manifest.json` → set `version` to `X.Y.Z` (and `minAppVersion` if it changed).
- `manifest-beta.json` → keep in sync if you use the BRAT beta channel.
- **`versions.json`** → add `"X.Y.Z": "<minAppVersion>"`. Create the file if missing:

  ```json
  { "X.Y.Z": "1.4.11" }
  ```

  This is what tells Obsidian which build to serve to each app version. **Required.**

*(If `version-bump.mjs` is restored, `npm version X.Y.Z` automates steps 2 and the `git add`.)*

## 3. Build & verify

```bash
npm run release   # tsc -noEmit type-check gate, then minified build to dist/
```

Confirm `dist/main.js` and `dist/styles.css` exist and load in a real vault
(`.obsidian/plugins/zettelflow/`). Smoke-test the primary flow (open a canvas flow, build a note).

## 4. Commit, tag, push

```bash
git add manifest.json manifest-beta.json versions.json
git commit -m "chore(release): vX.Y.Z"
git tag X.Y.Z          # tag == manifest.version, NO leading "v"
git push && git push --tags
```

Only tag/push when the user has asked to release. The tag push triggers the release workflow.

## 5. Verify the release

- The GitHub Release has exactly three assets: `main.js`, `manifest.json`, `styles.css`.
- The tag equals `manifest.json` `version`.
- For an existing directory plugin, no extra PR is needed — Obsidian picks up the new tag; the
  automated review runs and updates the scorecard.
- For a **first** submission, open a PR to `obsidianmd/obsidian-releases` adding the plugin to
  `community-plugins.json`.

## Notes

- The release workflow builds with `npm install` + `npm run release`; keep those green.
- Never hand-edit `dist/` — it's generated and git-ignored.
- Docs deploy separately (push to `main` → `documentation.yml`); a release tag does not deploy
  docs.
