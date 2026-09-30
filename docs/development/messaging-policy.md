# Messaging policy — Notices, inline lines, and the log

*Where a message goes is decided by **where you are looking**, not by how the code happens to be
structured (#546 C). This is the rule; the audit that produced it counted **145 `Notice`s across 72
files** with no policy behind them.*

## The three rules

1. **Off-surface or asynchronous → a `Notice`.** A toast is the right tool for something that
   happened **somewhere you are not looking**: a background job finished, a vault event fired a hook,
   a command wrote a file you cannot see, an async reload completed. The toast is the *only* channel
   the user has for these, so it earns its interruption.

2. **On-surface → an inline line.** If the message is about **the thing in front of you** — the
   modal you are in, the note the view is showing, the button you just pressed — it belongs *on that
   surface*, as a line near what it refers to, not as a toast that floats over the whole app. An
   error you can read where it happened is better than one you have to catch before it fades.

3. **`log.error` always, for the detail.** Every failure logs, regardless of what the user sees. The
   `Logger` wires `error()` from construction so it surfaces even before settings load — an error is
   never silently swallowed. The user-facing message is the *headline*; the console is the *detail*.

## The fourth rule, which is the point: **no silent failure**

The worked example is #544: a save failed, the code did `if (!x) return;`, and **the thought
vanished with nothing said**. A user-triggered write that can bail out or throw must tell the user
*something* — an inline line if you are on the surface, a `Notice` if the surface is closing or
off-screen — and always `log.error`. A `catch` on a path the user explicitly triggered may **never**
contain only a `log.*`.

This is guarded. `test/architecture/components/noticesPolicy.test.ts`:

- **caps the toast budget** — a ratcheting ceiling on the total count of `new Notice(`. The number
  only goes down as on-surface toasts become inline lines; a new toast fails the build until the
  ceiling is raised **deliberately**, which is the moment to ask "is this really off-surface?";
- **pins the #544-class fixes** — the write paths that used to fail silently now surface a message,
  and the test asserts they still do.

## Which is which — the buckets from the audit

| Bucket | Count at the audit | Where it goes |
|---|---|---|
| **Error, off-surface** (a service, a command, a hook, a canvas patch) | 50 | `Notice` — correct, keep |
| **Error, on-surface** (a modal / view / renderer you are in) | 35 | should become an **inline line** — migrated per surface, held by the ceiling meanwhile |
| **Success, off-surface** (an effect you cannot see: a file written elsewhere, the clipboard) | 17 | `Notice` — keep; the effect is off-screen |
| **Success, on-surface** (something you just watched happen) | 22 | **remove** — a confirmation for a visible effect is noise (C2) |
| **Info / async** (a background reload, an undo offer, a computed summary) | 21 | `Notice` — correct, keep |

The clipboard is **off-surface**: you cannot see that a copy happened, so *"copied"* is a legitimate
`Notice`, not noise.

## When you add a message

- Ask **where the user is looking** when it fires. On the surface → inline. Elsewhere → `Notice`.
- A **success** toast has to justify itself: what did it confirm that the user could not already
  see? If the answer is "nothing", do not add it.
- A **failure** on a path the user triggered is never optional. Surface it, and `log.error` the
  detail.
- Adding a `new Notice(` raises the ceiling in `noticesPolicy.test.ts`. Raise it in the same change,
  with a one-line note saying why the message is off-surface — that note is the review gate.

## Not a wrapper

There is deliberately **no** `notify()` choke point. A wrapper would let a toast be added without
the one question that matters — *where is the user looking?* — being asked at the call site. The
policy is a habit and a guardrail, not an abstraction. (See
[design by subtraction](constitution.md).)
