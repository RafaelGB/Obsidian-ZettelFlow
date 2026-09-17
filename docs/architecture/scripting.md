# Scripting

ZettelFlow runs JavaScript in five places: the **Script action**, a **dynamic selector**, a
**property hook**, an **event condition**, and a **library module** (loading one runs it). All
five build their function in one module — `architecture/api/lib/FnConstructor.ts` — which is the
single home the capability disclosure names and a guardrail test enforces.

## Every run leaves a fact (#444)

A script that fails while you are not watching used to leave a `Notice` and a console line, both
gone by morning. Hooks and event flows run unattended by definition, which is exactly when a
transient message is worth nothing.

Every run is now recorded:

| Recorded | Not recorded |
|---|---|
| when it ran, and how long it took | the note's content |
| which surface, and which script (a flow step, a hook, a library file) | the values a script was handed |
| the note it ran on, by path | anything about what it "should" have done |
| whether it threw, with the message and the line | a score, a ranking or advice |

The keys a script received are kept (`note`, `zf`, `app`) — their values are not. A run log must
not become a second copy of your vault.

### How long it is kept

By time, not by count: **7 days** by default, **up to 30**. Anything older is dropped the next
time a run is recorded. A safety cap keeps a vault that evaluates a condition on every keystroke
from bloating `data.json` between two prunes.

### Recording cannot break a run

The recorder is wrapped: if writing the log fails, it logs a warning and gives up. Observing
must not change what was observed — a script that works keeps working, and a script that throws
still throws the same error to the same caller.

## What a failure should do (#445)

Every failure used to do the same thing: a notice, and the surrounding work carried on. One policy
cannot be right for five surfaces and every script — a hook that tags a note has no business
interrupting you, and a step that computes the note's title has no business letting the note be
created without one.

Each script says which it is, in the form next to it:

| Policy | You see | What happens next |
|---|---|---|
| **Tell me and carry on** (default) | a notice | what ZettelFlow has always done |
| **Carry on quietly** | nothing | the run is **still recorded** |
| **Skip the rest of this step** | a notice | the note is created without what that step had left to do |
| **Stop building the note** | a notice naming the script | nothing is written |

*Silent* is about not interrupting you, never about hiding the fact: the record is written either
way, and the form itself states how often that script has failed and when — read from the log
rather than counted a second time.

A hook has one script and nothing after it, so *skip* and *stop* both mean "apply none of its
changes". An event condition that throws fails closed, as it always has: the flow does not run.

## Your library (#448)

Modules in your scripts folder become `zf.internal.user.<name>`. Three things changed:

**They reload when you save one.** Until 3.5 the `zf` cache was invalidated only when the folder
itself was renamed or deleted, so editing your own function changed nothing until Obsidian
restarted. A save now reloads (debounced, so a burst of saves reloads once) and says so.

**They can say what they are.** An optional JSDoc block on the exported function:

```js
/**
 * Title a note after its source.
 * @param {string} title The note's current title
 * @param source - where it came from
 * @returns {string} the new title
 * @zf-surface action
 */
module.exports = (title, source) => `${title} — ${source}`;
```

A documented function earns its parameters and description in the editor's completions and hover,
in the generated `zettelflow.d.ts`, and in the manager. An undocumented one keeps working exactly
as before; a malformed block degrades to "no documentation", never to an error, because a comment
must not break a module.

**There is a map.** The library manager (in the script workbench) lists every module: whether it
loaded, the error if it did not — remembered rather than announced once at startup — what it says
about itself, a *try it* that writes the call into the bench, and *find who uses it*, scanned on
demand across your hooks and canvases.

A module that reaches `require()` is marked **desktop only**: `window.require` does not exist on
mobile, where it used to return `undefined` in silence.
