# Map of content builder

The **map of content (MOC) builder** gathers a set of notes and writes — or updates — an index
note that links them together. It is exposed as a single command and is designed to be safe to
run again and again against the same note.

## The command

Open the command palette and run **"Build or update a map of content"**. This opens a modal where
you choose how the member notes are gathered, name the target map note, preview the result, and
confirm the write.

The command is available on desktop and mobile and ships without a default hotkey.

## Selection modes

The modal offers two ways to gather the notes that belong in the map:

- **By tag or folder** — the query mode. Provide a **tag** (with or without the leading `#`, matched
  case-insensitively) and/or a **folder** (matched as a path prefix). When both are given they are
  AND-combined: a note must carry the tag *and* live under the folder. Membership is resolved
  entirely from Obsidian's metadata cache — note bodies are never read to decide membership.
- **Manual selection** — paste a comma-separated list of note names. Each name is resolved against
  the vault's markdown files by basename (case-insensitive); unmatched names are silently skipped.

In both modes the target map note excludes itself from the member set, and members are sorted by
title.

## Preview and confirm

**Preview** resolves the member set and shows whether the map will be **created** or **updated**,
followed by the ordered list of member titles. The **Create / update map** button stays disabled
until a preview with at least one member has been generated. If no notes match, nothing is written
and a notice explains why.

## The machine-managed region

The linked list lives inside a **machine-managed region** delimited by HTML comment markers:

```markdown
<!-- zettelflow:moc:start -->
## Notes in this map

- [[notes/alpha|Alpha]]
- [[notes/beta|Beta]]
<!-- zettelflow:moc:end -->
```

Everything **between** the markers is owned by ZettelFlow and rewritten on every run. Everything
**outside** the markers is your territory: prose you write above or below the region is preserved
byte-for-byte across re-runs.

### Re-run and idempotence behaviour

- If the target note already contains a region, only the block between (and including) the markers
  is replaced — your surrounding prose is untouched.
- If the target note has no region yet, the region is appended after a single blank line and the
  file keeps a trailing newline.
- Running the command twice with the same member set produces the same file: the merge is
  **idempotent**.

## Structure-note frontmatter marker

After the body is written, the target note's frontmatter is stamped with:

```yaml
zettelflowStructureNote: true
```

This marks the note as a ZettelFlow-managed structure note so it can be recognised later (for
example by other tooling or queries).

## Single-write guarantee

Each run performs **exactly one body write** — a single file creation for a new map, or a single
`modify` for an existing one. The frontmatter marker is applied separately through Obsidian's
`processFrontMatter` API. On failure the error is logged and surfaced as a notice, leaving nothing
half-written where avoidable.
