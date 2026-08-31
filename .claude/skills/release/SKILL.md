---
name: release
description: Cut a compliant ZettelFlow plugin release — version bump, versions.json, build, tag, and a GitHub Release whose notes follow the house format. Use when the user asks to "release", "publish a new version", "cut a release", "bump the version", or "prepare a release".
---

# Release ZettelFlow

A release is driven by **pushing a git tag**: `.github/workflows/releases.yml` runs `npm ci` +
`npm run release`, verifies the tag matches `manifest.version`, and creates a GitHub Release named
after the tag with `dist/main.js`, `manifest.json`, `dist/styles.css`. Obsidian's community
directory then runs its automated review on the new version.

> **Release notes live on the GitHub Release (the tag) — never in a file in the repo.** Do not commit
> a `RELEASE_NOTES.md`. The workflow publishes auto-generated notes; you then replace the body with
> the curated house-format notes via `gh release edit` (step 7).

## 0. Pre-flight quality gate

Run the **`obsidian-plugin-quality`** skill and resolve blocking findings. Then make sure the tree
is green and `main` is up to date:

```bash
git checkout main && git pull --ff-only origin main
npm run verify        # typecheck + oxlint + eslint-obsidianmd + jest (all blocking)
```

## 1. Choose the version

Follow semver. Confirm the **`minAppVersion`** the build actually requires (bump only if you started
using a newer Obsidian API). Work on a `release/X.Y.Z` branch, PR into `main` — never commit the
bump straight to `main`.

## 2. Bump the version

```bash
npm version X.Y.Z --no-git-tag-version
```

`--no-git-tag-version` is **required**: it must not create the tag or commit here (we tag `main`
after the PR merges). The `version` lifecycle script runs `version-bump.mjs`, which updates:

- `package.json` → `X.Y.Z` (npm itself)
- `manifest.json` → `version` (keeps its `minAppVersion`)
- `versions.json` → adds `"X.Y.Z": "<minAppVersion>"` (tells Obsidian which build to serve)

**`version-bump.mjs` does NOT touch `manifest-beta.json`** — sync it by hand (BRAT beta channel),
keeping `version`, `minAppVersion` and `description` in lockstep with `manifest.json`:

```bash
node -e 'const fs=require("fs");const m=require("./manifest.json");const b=require("./manifest-beta.json");
b.version=m.version;b.minAppVersion=m.minAppVersion;b.description=m.description;
fs.writeFileSync("manifest-beta.json",JSON.stringify(b,null,"\t")+"\n");'
```

Verify all four agree before continuing.

## 3. Build & smoke-test

```bash
npm run release   # tsc type-check gate, then minified build to dist/
```

Confirm `dist/main.js` and `dist/styles.css` exist, then load them in a real vault
(`.obsidian/plugins/zettelflow/`) and smoke-test the primary flow (open a canvas flow, build a note).

## 4. Commit, PR, merge

Only the version files — no notes file.

```bash
git add manifest.json manifest-beta.json versions.json package.json package-lock.json
git commit -m "chore(release): X.Y.Z"
git push -u origin release/X.Y.Z
gh pr create --base main --title "chore(release): X.Y.Z" --body "..."
gh pr merge <n> --merge --admin --delete-branch
```

## 5. Tag `main` and push

Only tag once the release commit is on `main`, and only when the user asked to release.

```bash
git checkout main && git pull --ff-only origin main
git tag X.Y.Z          # tag == manifest.version, NO leading "v"
git push origin X.Y.Z  # this triggers the release workflow
```

## 6. Wait for the workflow

```bash
gh run watch $(gh run list --workflow=releases.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

It builds, enforces the tag/version guard, and creates the Release with the three assets.

## 7. Write the release notes onto the Release (the house format)

Draft into a scratch file **outside the repo** (e.g. the session scratchpad or `$TMPDIR`), then:

```bash
gh release edit X.Y.Z --notes-file /path/outside/repo/notes-X.Y.Z.md
```

Keep this exact structure and voice; omit a section only when it has nothing in it:

```markdown
# Shinny new things

- **Feature name** — what it does for the user, in one or two sentences.

# Improvements

- **Area** — what got better.

# No longer broken

- What was broken, phrased from the user's side — now fixed.

# Under the hood

- Internal/infra change worth noting.
```

Rules that keep it consistent with previous releases:

- Level-1 `#` headings, in that order. Yes, **"Shinny"** — it is the house spelling, keep it.
- Bullets lead with a **bold subject**, then an em dash `—`, then plain prose.
- Write for users, not commits. Group many commits into one meaningful line; skip pure churn.
- Draft it from the real diff:

  ```bash
  git log <previous-tag>..HEAD --no-merges --pretty=format:'%s' | sed 's/ (#[0-9]*)$//' | sort -u
  ```

- Cross-check tone against the last release: `gh release view <previous-tag> --json body -q .body`.

## 8. Verify the release

```bash
gh release view X.Y.Z --json tagName,assets,body -q '.tagName, (.assets[].name)'
```

- Exactly three assets: `main.js`, `manifest.json`, `styles.css`.
- The tag equals `manifest.json` `version` (the workflow fails the build otherwise).
- The body is the curated house-format notes, not the auto-generated list.
- For an existing directory plugin no PR is needed — Obsidian picks up the new tag. For a **first**
  submission, open a PR to `obsidianmd/obsidian-releases` adding it to `community-plugins.json`.

## Notes

- Never hand-edit `dist/` — it is generated and git-ignored.
- Docs deploy separately (push to `main` → `documentation.yml`); a release tag does not deploy docs.
- If the workflow fails on the tag/version guard, fix `manifest.json`, delete the tag
  (`git push --delete origin X.Y.Z`), and re-tag.
