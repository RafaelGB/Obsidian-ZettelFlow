# Quick capture

The lowest-friction path from a thought into your vault (#285, #475). A single command opens one
prompt and keeps what you type as a **thought in your thinking space** (see
[Think](../architecture/thought-lab.md)) — no canvas, no wizard, no folder decision, no title to
invent. The point is speed: get the idea out of your head before it's gone, and develop it later.

A capture is not a note. It has no title, no lifecycle state and no Inbox to empty: it is not in the
knowledge model, it cannot be an orphan, and Health does not count it. A captured thought is the same
as one typed in Think.

## Using it

1. Run **`ZettelFlow: Capture a thought`** from the command palette (bind your own hotkey — there is
   no default, to avoid clashing with your setup).
2. Type the thought and press **Enter** (or click **Capture**).
3. ZettelFlow keeps it in the thinking space and says *Captured. It is in your thinking space.*

If no thinking-space folder is set, nothing is written: the notice sends you to **Settings → Thinking**
(*Thinking space folder*). Capture never falls back to creating a note.

It works on **mobile** (a plain modal, Enter to submit) as well as desktop.

## The capture → develop loop

A quick capture is deliberately raw. Open **Think** to find it among your other thoughts and develop
it there: connect it, question it, and when it has earned it, crystallize it into a note. Nothing becomes
knowledge until you decide it is an idea.

## Safe writing

Capture goes through the thinking space's own writer. The modal stays open with your text until the
write is confirmed; repeated submits are coalesced while busy, and a failed write keeps your text so
you can retry.

## Details

- **Where** — the thinking-space folder (*Settings → Thinking → Thinking space folder*, default
  `_ZettelFlow/lab`).
- **Recorded** — each capture is logged as the move *externalize · capture* in the
  [move record](../architecture/thought-lab.md#the-move-record-491).
- **Offline** — writes through the Vault API; no network, no AI.
