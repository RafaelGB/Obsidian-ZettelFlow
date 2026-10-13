# Carry over tasks

Brings the unfinished tasks of earlier notes into this one.

*Called `task-management` in the step's YAML.*

It runs without asking anything in the wizard. It looks through the notes you point it at, takes
every unfinished task (`- [ ]`) after the heading you name (the whole note, when it has no such
heading), and adds them to the new note. The tasks
are **moved**: they are removed from the earlier notes.

## Settings

- **Initial folder** — the folder where the search starts. Empty searches the whole vault.
- **Allow recursive** — search the folders inside it too. On by default.
- **Regex** — only notes whose file name matches this regular expression are searched, e.g.
  `^\d{4}-\d{2}-\d{2}$` for daily notes.
- **Initial header** — the heading whose unfinished tasks are carried over, e.g. `## Tasks`. The
  same heading is written above the tasks in the new note, so fill it in.
- **Prefix title** — text added before each carried-over task line. Empty by default.
- **Suffix title** — text added after each carried-over task. Default: `!`.
- **Enable as content behaviour** — put the tasks where `{{key}}` is in the step's note body, instead
  of at the end of the note under the heading. Off by default.
- **Property key** — the `{{key}}` placeholder to replace, e.g. `tasks` for `{{tasks}}`. Shown only
  when **Enable as content behaviour** is on.

## What it writes

With **Initial header** `## Tasks` and the default **Suffix title**, the new note ends with:

```markdown
## Tasks
- [ ] Call the printer!
- [ ] Send the draft to Ana!
```

Nothing is written when there are no unfinished tasks to carry over.
