---
description: ZettelFlow FAQ — installing, mobile, offline use, AI, privacy, what it writes to your vault and how to undo it, whether you need a Canvas or Bases, big vaults, sharing a system and reporting bugs.
---

# FAQ

??? question "How do I install it?"

    In Obsidian: **Settings → Community plugins → Browse**, search for **ZettelFlow**, then **Install**
    and **Enable**. It needs Obsidian 1.13.1 or newer. → [Get started](get-started.md)

??? question "Does it work on mobile?"

    Yes. The same plugin runs on iOS and Android. A few desktop-only extras (such as loading Node
    modules in your own library scripts) are hidden on mobile instead of failing.
    → [Mobile support](development/mobile-support.md)

??? question "Does it work offline? Does it send anything anywhere?"

    Everything works offline, with no account, no server and no telemetry. The only network calls are
    the ones you opt into: the AI provider you configure, and read-only fetches when you open the
    community gallery. → [Capabilities & privacy](development/capabilities-and-privacy.md)

??? question "Do I need AI? Which provider?"

    No. AI is **off by default**, and everything except the AI actions works without it. If you turn it
    on, you point it at one OpenAI-compatible **https** endpoint of your choice, and every AI output is a
    proposal you accept, edit or reject. AI never runs inside automations.
    → [AI provider setup](development/ai-provider-setup.md)

??? question "What does ZettelFlow write to my vault?"

    Only what you set it up to write: the notes your flows create, the properties your hooks set, the
    links and sources you add from [This note](development/this-note.md), and the systems you install
    from the gallery. Tend and Practice only read your notes; Explore writes a map of content only when you
    ask it to.
    → [What ZettelFlow wrote](architecture/reversibility.md)

??? question "Can I undo something ZettelFlow did?"

    Yes. Every write is recorded. A flow, a hook or a change you make from This note offers an undo in
    the moment, and it takes back exactly what was written.
    → [What ZettelFlow wrote](architecture/reversibility.md)

??? question "Do I have to draw a Canvas?"

    No. You can start from your own idea, use [This note](development/this-note.md), Tend, Explore and
    Cultivate, or install a ready-made system from the gallery, without drawing anything. A Canvas is
    only needed when you want to design your own note flow.
    → [Get started](get-started.md)

??? question "What are Base dashboards, and do I need Bases?"

    Dashboards are a view inside Obsidian's core **Bases** plugin: they chart, tabulate and calendar the
    notes a Base selects. You need Bases only for dashboards; nothing else depends on it.
    → [Base dashboards](development/base-dashboards.md)

??? question "Will it slow down a big vault?"

    It is measured against performance budgets in CI: building the knowledge index over 50,000 notes
    takes about 0.1 s on the reference runner. You can also leave folders out of everything with the
    knowledge scope. → [Performance budgets](development/performance-budgets.md) ·
    [Knowledge scope](development/knowledge-scope.md)

??? question "How do I share a system I built?"

    Export it as a `.zftemplate` from your canvas and open a pull request. The gallery is fully static,
    so there is no account or upload: once merged it appears in everyone's in-app browser.
    → [Share a system](how-to-contribute/systems-gallery.md)

??? question "I found a bug, or I have an idea."

    Open an [issue on GitHub](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues) for bugs, or start a
    [discussion](https://github.com/RafaelGB/Obsidian-ZettelFlow/discussions) for questions and ideas.
    Including the Obsidian version and, for a bug, the steps to reproduce it helps a lot.
