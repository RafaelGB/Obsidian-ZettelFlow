---
description: Your Library — the PDFs and EPUBs already in your vault and the reading paths you saved, on one shelf, with what came of each one. Local only; your files are never modified.
---

# Your Library

**The sources your ideas come from.** Ideas rarely start in a note: they start in what you read — a
paper, a book, a long article saved as a PDF. The Library puts those sources on one shelf, beside
the reading paths you saved across your own notes, and says what came of each one: how far you are,
what you marked, and the notes born from it.

![The Library: Continue reading, then the shelf of books, papers and reading paths with their progress, highlights and notes born — and a scanned PDF marked read only](../resources/library/shelf.svg)

## Open it

- **The ribbon menu → Library.** The door that is always there, whatever you have open.
- **Right-click a PDF or an EPUB → Show in the library** opens the Library on that source's detail.
- **Command palette → "Open the library"**, which you can bind to a hotkey.

The Library opens in the main area, like any tab. It is laid out to work as well in a narrow pane or
a sidebar: the shelf narrows, the cards get smaller and *Continue reading* stacks.

## The shelf

Three kinds of things share the shelf:

| Kind | What it is | Its cover |
|---|---|---|
| **Books** | the EPUBs in your vault, and any PDF longer than sixty pages | the book's own cover |
| **Papers** | the PDFs in your vault up to sixty pages | the PDF's first page |
| **Paths** | the [reading paths](reader.md) you saved at the end of one | a constellation of its notes |

**Nothing is imported.** A source is a file that is already in your vault, in any folder: drop a book
in and it is on the shelf; delete it and it is gone. Nothing is uploaded and nothing leaves the vault.

Until a cover has been read, a book is drawn with its title on one of your theme's colours, so a new
shelf is never a wall of grey boxes. Covers are read as they scroll into view.

Each card says **what came of it**:

- **how far you are** — a ring, and a percentage;
- **how many passages you highlighted** in it;
- **how many notes were born from it** — the notes that cite it as their source (see
  [From passage to note](#from-passage-to-note));
- **when you last read it**, or *Never opened*.

**Continue reading** leads the shelf: the two things you were last in and have not finished, with
where you are (*Page 8 of 12*, *Chapter 3 of 38*, *Note 2 of 7*) and **Resume**.

Above the shelf: **All · Books · Papers · Paths**, each with its count; a search over titles and
authors (*sonke* finds *Sönke*); and the order — **Recently read** (never-opened things come last,
by title), **Most highlighted** or **Title**. The Library remembers the filter and the order.

### A scanned PDF says so before you open it

Some PDFs are pictures of pages: a scan has no text, so there is nothing to select and nothing to
highlight. When the Library reads a PDF's cover it also looks for text on its first pages, and a PDF
without any is marked **Scanned · read only** on its card and in its detail. You can still open it
and read it.

## A source in detail

**⋯** on a card opens its detail, over the shelf: the cover, the title and author, the file, and three
facts — how far you have read and when, your highlights, and the notes born from it. Below them, the
**notes born from it**, each one a click away (Ctrl/Cmd-hover to preview), and **your highlights,
by chapter** — every passage with your note under it, each one opening the source at that passage.
**Esc** or **Close** puts the detail away.

## What it keeps, and where

**Your files are never modified.** Not a byte of a PDF or an EPUB is written: no annotation layer, no
sidecar file next to it. What the Library remembers about a source is kept in the plugin's settings:
the title, author and length the file declares, whether a PDF is only images, and where you are in
it — each with the size and date of the file it was read from, so a replaced file is read again.
Covers are kept for the session only, in memory: never in your vault, never in the settings.

What you *mark* — highlights and margin notes — is not kept by the Library at all: those are
[thoughts in Think](../architecture/thought-lab.md), files you can open.

## How to verify

| Command | Proves |
|---|---|
| `npx jest test/application/library` | the shelf (kinds, filters, accent-blind search, orders, *Continue reading*), what is remembered about a source, the notes born from it, the unzip and the EPUB package |
| `npx jest test/architecture/components/core/library` | the Library view: empty state, the shelf, filters with counts, search, sort, the detail and Esc, a rename; covers and what a source declares, a scan detected |
| `npm run test:perf -- library` | the shelf of 500 sources builds, orders and searches in budget |

In a vault (a test vault with a PDF paper, a scanned PDF and an EPUB):

1. **Empty state.** In a vault with no PDF, no EPUB and no saved path, open **ribbon menu → Library**.
   Expect *Your shelf is empty, for now* and, with a note open, **Read a path across your notes**.
2. **The shelf.** Add the three files to any folder. Expect them on the shelf at once; each cover is
   drawn, then replaced by the real one as it scrolls into view. The EPUB is a book, the short PDF a
   paper.
3. **A scan.** Expect **Scanned · read only** on the scanned PDF's card once its cover has been read,
   and in its detail.
4. **Filters and search.** Click **Papers**: only PDFs. Type an author's name without its accents:
   it is found. Change the order to **Title**; close and reopen the Library: the order is kept.
5. **Detail.** **⋯** on a card: the detail slides in. **Esc** closes it; a second **Esc** does nothing
   to the Library.
6. **From the file.** Right-click the EPUB in the file explorer → **Show in the library**: the Library
   opens on its detail.
7. **Negative.** Compare each source file before and after (size and modification date): unchanged.
   No file was created in the vault.
