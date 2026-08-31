# AI provider setup

The 🤖 **AI action category** (#156) is **optional and off by default**. ZettelFlow works fully with
AI disabled — every other feature is deterministic and offline. When you opt in, you bring your own
**OpenAI-compatible** provider; ZettelFlow ships no key and no default endpoint.

## Turning it on

**Settings → ZettelFlow → AI (optional):**

1. **Enable AI actions** — off by default. While off, no AI action ever makes a network request.
2. **Endpoint URL** — the full OpenAI-compatible chat-completions URL. Examples:
   - OpenAI — `https://api.openai.com/v1/chat/completions`
   - OpenRouter — `https://openrouter.ai/api/v1/chat/completions`
   - LM Studio (local) — `http://localhost:1234/v1/chat/completions`
   - Ollama (local, OpenAI-compat) — `http://localhost:11434/v1/chat/completions`
   The endpoint **must be `https`** (plain `http` is accepted only for `localhost`/`127.0.0.1`), so
   note content is never POSTed to an unexpected or insecure host (#301).
3. **Model** — the model name your provider expects (e.g. `gpt-4o-mini`).
4. **API key** — your provider key. Stored in this vault's plugin data (`.obsidian/plugins/zettelflow/data.json`),
   sent **only** as a `Bearer` header to the endpoint above, and **never logged**.

Any of endpoint / model / key left blank means the provider is not usable, and AI actions no-op with
a clear notice.

### Guardrails (#301)

- **Nothing is written without your verdict** (#337, [constitution §XII](constitution.md)). Every
  completion is shown to you as a **proposal** you can accept, edit or reject. Accepting unchanged
  text records `accepted`; accepting an edit records `modified`; rejecting writes nothing. Dismissing
  the dialog writes nothing *and* records nothing — a dismissal is not a verdict. See
  [cognitive agency](cognitive-agency.md).
- **AI never runs in automations.** It fires only on a build *you* drive — never during an
  on-creation pattern or the post-index re-run. There is no setting to change this: an automation has
  nobody to ask for a verdict, so a call there could only cost you money for something that can never
  be written. (This replaces the old *Allow AI in automations* toggle, removed in #337.)
- **Max input characters** — the note content sent per request is bounded (default 12000) and
  truncated if longer, so a huge note (or many linked notes) can't send an unbounded payload.
- **Max output tokens** — the requested completion length is bounded (default 800) via `max_tokens`.
- **Prompt-injection hardening** — the task is sent as a `system` message and the note content is
  wrapped in `<note-content>` tags labelled as data, so text like "ignore previous instructions"
  inside a note is treated as content, not a command.
- **Safe output** — a text completion is sanitised (template tokens neutralised, length bounded)
  before it is written into a note.

## What is sent, and where

When you run an AI action, ZettelFlow sends the **(bounded) content of the note being built** as the
prompt to the **single https endpoint you configured** — and nothing else. There is **no telemetry,
no bundled key, no default endpoint, and no second endpoint**. See
[Capabilities & privacy](capabilities-and-privacy.md).

## The actions

The category ships three actions, each a thin wrapper over one completion call:

- [Summarize](../actions/Summarize.md) — a short summary of the note.
- [Classify](../actions/Classify.md) — suggested topic tags.
- [Generate questions](../actions/GenerateQuestions.md) — the open questions the note raises.

If a request fails (network error, bad config, malformed response), the action degrades to a clear
notice and writes nothing — it never crashes the flow.

## Provider-agnostic by design

ZettelFlow depends on no specific vendor: a single `AiProvider` interface (`complete(prompt)`) with
one built-in OpenAI-compatible client (`src/architecture/ai/`). The OpenAI-compatible shape already
covers OpenAI, OpenRouter, LM Studio and Ollama. Native SDKs, embeddings/RAG, streaming and agentic
loops are intentionally out of scope.
