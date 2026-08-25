# Quick capture

The lowest-friction path from a thought to a note (#285). A single command opens one title prompt and
writes a **fleeting note** straight to your `Inbox` — no canvas, no wizard, no folder decision. The
point is speed: get the idea out of your head before it's gone, and develop it later.

## Using it

1. Run **`ZettelFlow: Quick-capture a fleeting idea`** from the command palette (bind your own hotkey —
   there is no default, to avoid clashing with your setup).
2. Type a title and press **Enter** (or click **Capture**).
3. ZettelFlow creates `Inbox/<title>.md` with `state: fleeting` frontmatter and an `# <title>` heading,
   then shows a notice.

It works on **mobile** (a plain modal, Enter to submit) as well as desktop.

## The capture → develop loop

A quick capture is deliberately raw. [ZettelFlow Home](zettelflow-home.md) closes the loop: whenever
fleeting notes are waiting it shows a **growth nudge** — "N fleeting notes ready to develop" — with a
one-click jump to the latest capture, so nothing you dumped into the Inbox is forgotten. Promote a note
by advancing its [lifecycle state](../architecture/knowledge-lifecycle.md) as you flesh it out and
connect it.

## Details

- **Folder** — notes land in a top-level `Inbox/` folder, created on first use.
- **Filename** — the title, with characters unsafe for a filename replaced by spaces; a timestamp is
  appended if a note of that name already exists (captures never overwrite).
- **Offline** — writes a single Markdown file through the Vault API; no network, no AI.
