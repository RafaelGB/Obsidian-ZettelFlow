# Methodology packages

The gallery ships single templates; the leverage is shipping whole **methodologies**. A **methodology
package** is an app-store-style bundle of a knowledge system — install "Zettelkasten" and get all its
flows (and their built-in patterns) in one go, remove them just as cleanly.

## What a package is (and isn't)

A package is a **named, atomic bundle of installable files** — the flows (canvas + step notes) that
*use* the built-in actions, patterns and dashboards. It **ships no code**: actions, views and
dashboards already live in the plugin. So the reference **Zettelkasten** package is simply a name over
the five [starter flows](zettelkasten-starter-flows.md) (fleeting · literature · permanent · structure
· Literature → Permanent), installed and removed as a unit.

## Install / uninstall

- **Install** — run **"Install Zettelkasten methodology package"** (or the **Install** button next to
  *Methodology packages* in **Settings → ZettelFlow → Zettelkasten toolkit**). It creates all the
  package's flow files (idempotently — existing files are kept) and records the package in settings.
- **Uninstall** — run **"Remove Zettelkasten methodology package"**. It **trashes only the package's
  own tracked files** (recoverable, via the system trash) and drops the settings record.

### Atomic and safe

- **Atomic install** — if a file fails to create mid-install, the package **rolls back** the files it
  created and records nothing, leaving the vault in its pre-install state.
- **Clean removal** — uninstall trashes **only** the package's tracked files. It **never** deletes the
  shared `_ZettelFlow/examples` / `steps` / `notes` folders, and never your notes — the tracked path
  list (stored in `settings.installedPackages`) is the exact source of truth.

> The Zettelkasten package's files are the same flow files as the standalone
> [starter flows](zettelkasten-starter-flows.md). If you installed those separately, uninstalling the
> package reclaims those shared files too (recoverable from the system trash) — they are the package's
> declared files.

## Out of scope (deferred)

- **The backend app store** — browsing/installing packages from the community backend is a follow-up.
  v1 ships the format and the one built-in reference package, fully **local, zero network**.
- **The other methodologies** — PARA, GTD, Research, Reading, Writing, Software-architecture KB are
  future packages built on this same format.
- No cross-package dependency resolution; no AI.

## Architecture

```
MethodologyPackage { id, name, description, version, flows }   ·   ZETTELKASTEN_PACKAGE
packageFilePaths(pkg) · planInstall(pkg, existing) · planRemove(tracked, existing)   (pure, tested)

installPackage(vault, pkg)   → reuses installStarterFlows; rolls back created files on failure
uninstallPackage(vault, tracked) → trashes only tracked files, never folders          (pure, tested)

MethodologyPackageComponent (install-/uninstall-methodology-package commands, no hotkey)
  wraps the vault (create + FileService.deleteFile→fileManager().trashFile) and tracks
  settings.installedPackages[id] = { paths, version }
```
