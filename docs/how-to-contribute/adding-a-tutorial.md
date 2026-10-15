# Adding a tutorial

Community's **Learn** room teaches every feature in short tutorials. They are not code: they are one
data file on `main`, **`docs/learn/catalog.json`**, which the plugin reads from GitHub when Learn is
shown. So a tutorial merged to `main` **reaches every user on their next visit** to Learn — no plugin
release, no update — and the plugin's `main.js` does not grow with it.

The file's full shape, how the plugin reads it and how it is cached are in
[the Learn catalog](../architecture/community.md#the-learn-catalog-801) section of the architecture
page. This page is the contributor's checklist.

## The rules CI checks

`test/docs/learnCatalog.test.ts` validates the whole file on every push and names the entry that is
wrong (`tutorials.undo.steps: 2 steps (needs 3–6)`). A pull request that breaks one does not merge.

1. **`since` is never newer than `manifest.json`'s `version` at merge.** `since` is the oldest
   ZettelFlow the tutorial describes, and a plugin older than it hides the tutorial. A tutorial for a
   feature that ships in the next release therefore waits for that release's version bump: it cannot
   land before the feature it teaches.
2. **Every string is in two languages**, `en` and `es` — `{ "en": "…", "es": "…" }` — and neither
   may be empty.
3. **3–6 steps** per tutorial.
4. **Every picture exists.** An `image` (or a `hero`) is a path under `docs/resources/` ending in
   `.svg` or `.png`, and the file is there.
5. **Every page exists.** A `doc` is a page under `docs/` (`development/reader.md`), never a URL.
6. **Capability ids are real.** `tryIt.capability` and a reference row's `capability` are ids in
   `CAPABILITIES` (`src/architecture/components/core/surface/capabilities.ts`).
7. **Ids hold together.** Tutorial ids are unique, each tutorial is in exactly one track, and every
   `related` id resolves.
8. **Settings paths name real groups.** *Settings → ZettelFlow → Flows* is checked against the
   settings tab, in English; the Spanish strings must use the Spanish names.

**Coverage.** `test/docs/learnCoverage.test.ts` fails when a capability in `CAPABILITIES` is named by
no tutorial's `tryIt` and no reference row. A capability that genuinely cannot be covered in the same
change goes in its `UNCOVERED` register with the issue that will cover it (`"#123 — …"`). The register
only shrinks: once the capability is covered, the test fails until its line is removed. Adding a
capability to the plugin therefore means adding its line to Learn.

## Writing one

1. **Pick an id** (`kebab-case`, never renamed once shipped: progress and *New* are kept by id) and
   add the tutorial under `tutorials`. Add the id to **one** track's `tutorials`, where it belongs in
   reading order.
2. **Fill it in**: `title`, `summary`, `minutes`, `level` (`easy`, `medium`, `hard`), `door` (where
   the feature is, in the words the UI shows), the steps, a `tip`, the `doc` page it comes from and,
   if they help, `related` tutorials.
3. **Draw the pictures.** A step's `image` is an official, hand-drawn SVG in the house style of
   `docs/resources/readme/` — never a screenshot. A step with no image keeps the one before it on the
   stage. Reuse a picture a docs page already shows when it fits.
4. **Offer *Do it now*, if it can run.** `tryIt: { "capability": "<id>", "label": { … } }` gives the
   lesson a button that opens the feature. It only appears when the capability has a door Learn can run
   (a ribbon entry, a command, a surface or a settings section).
5. **Add a reference row** in `reference` when the feature deserves a line in *Look anything up*.

Everything in the file is drawn as text. It can name a page, a picture and a capability id — never a
command, a URL or code.

## Check it before you open the pull request

- Run `npx jest test/docs/learnCatalog test/docs/learnCoverage` to see exactly what CI will say.
- Run `mkdocs serve` and open every picture and page the tutorial names.

You cannot see an unmerged tutorial inside Obsidian: Learn reads `main` only, by design, and there is
no development override. Once merged, it is in Learn for everyone on their next visit.

## Linking to a tutorial from the plugin

Code that wants to teach a feature opens its lesson directly:

```ts
openCommunity(app, "learn", { tutorial: "contribute-a-system" });
```

Community pans to Learn and opens that lesson once the catalog is there (Contribute's *How to
contribute well* does exactly this). If the catalog has no such tutorial, nothing opens, so a caller
that must always land somewhere checks first and falls back to the docs page, as Contribute does.
