# Mobile & accessibility

A second brain must work **everywhere and for everyone** (epic #319, launch sequence #315). ZettelFlow is
`isDesktopOnly: false`; this page is the standard the plugin holds itself to for the **core thinking loop**
— *capture → cultivate → advance state → view health → browse/install a system* — plus the accessibility
baseline for our custom UI, and the manual matrix a contributor walks before a release.

## What the code guarantees

- **Segmented surface tabs** are a real WAI-ARIA tablist: `role="tablist"` / `role="tab"` /
  `role="tabpanel"`, `aria-selected`, `aria-controls`/`aria-labelledby`, **roving `tabindex`**, and
  **arrow / Home / End** keyboard navigation (`ModeHostView`).
- **Clickable note names** across the core loop (Home, Cultivate, Ask-your-graph, Reasoning paths) are
  keyboard-operable through `makeActivatable` — focusable, `role="link"`, activated by click **and**
  Enter/Space (`architecture/components/core/a11y.ts`).
- **The 3D graph degrades gracefully** on mobile / when WebGL is unavailable: instead of a dead-end
  message it renders a **navigable list** of the same model (hubs first, live connection counts, each row
  a 44px button that opens the note). It never blanks or crashes.
- **Reduced motion** — when the OS sets `prefers-reduced-motion: reduce`, the graph settles almost
  instantly (no long animated warmup, no directional particles) and our CSS transitions/animations are
  disabled globally.
- **Focus is visible** (a `:focus-visible` ring on every namespaced widget) and **touch targets** on the
  tabs and fallback rows meet ~44px.
- **Modals** extend Obsidian's `Modal`, which traps focus and restores it to the prior element on close.

These are guarded by `test/architecture/components/core/a11y.test.ts` so they can't silently regress.

## Manual release matrix

Automated tests can't stand in for a device. Before a release, walk this on a phone (or the mobile
emulator) and with the keyboard only:

| Check | Pass when |
|---|---|
| Quick capture | The title prompt opens, is comfortable to type in, writes to the Inbox. |
| Home | Greeting, nudge, teasers and lists render; every note name opens on tap and on Enter. |
| Cultivate | Target + moves render; connect/question/source inputs are usable; buttons are tappable. |
| Advance state | The lifecycle command runs and writes the new state. |
| Health | Bars and lists render without overflow; drill-downs open. |
| Systems | Browse + one-click install writes the canvas + step notes. |
| Graph on mobile | The navigable list fallback shows, hubs first, and rows open notes. |
| Keyboard only | Tab reaches every control; arrow keys move between surface tabs; focus is always visible. |
| Reduced motion | With the OS setting on, the graph does not animate for long and transitions are off. |

## Contributor expectations

When you add UI:

- Prefer a real `<button>` for anything clickable. If you must use a `<span>`/`<div>`, wrap it with
  `makeActivatable(el, onActivate)` — never a bare `el.addEventListener("click", …)`.
- Give icons/emoji that carry meaning a text alternative (`aria-label`), or mark them `aria-hidden` when
  decorative.
- Don't rely on hover for anything essential — hover doesn't exist on touch.
- Keep tap targets ≥ 44px for primary actions; respect `prefers-reduced-motion` for any new animation.
- Add or extend a guardrail in `a11y.test.ts` when you add an interactive surface.

## Known follow-ups

The exhaustive keyboard-operability sweep of the *remaining* read-only lenses (Discovery, Open questions,
Evidence map, Concept navigation, Knowledge dashboard) and the recorded device walkthrough are tracked in
**#325** (follow-up to epic #319).
