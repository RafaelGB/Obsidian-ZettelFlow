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
