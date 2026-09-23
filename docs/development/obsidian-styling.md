# Styling: the user's theme wins

ZettelFlow has no look of its own. It borrows Obsidian's, and the reason is not modesty — it is
that **the user chose a theme and we do not know which one**. A vault runs Minimal, or Things, or
AnuPpuccin, or a snippet the user wrote last Tuesday. Every colour we hardcode is a colour that
survives their choice, and every pixel we invent is one their theme cannot reach.

Obsidian says this plainly, and the quotes below are the rule rather than a paraphrase of it.

## What Obsidian says

> *"Don't do this \[inline styles\]… use CSS classes, as hardcoding the styling in the plugin code
> makes it impossible to modify with **themes and snippets**."*
> — [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

> *"To make the styling of your plugin consistent with Obsidian and other plugins you should use the
> CSS variables provided by Obsidian."*
> — [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

> *"If you use these variables for your styles, your plugin will look great even if the user has a
> different theme! 🌈"*
> — [HTML elements](https://docs.obsidian.md/Plugins/User+interface/HTML+elements)

> *"Any text in UI elements should be using Sentence case instead of Title Case."*
> *"Using the heading elements from HTML will result in inconsistent styling between different
> plugins"* — use `setHeading()`. And: *"Avoid including the word 'settings' to these headings."*
> — [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

## The variables to reach for

Obsidian groups them as **Foundations** (spacing, radiuses, colors, typography, borders, cursor,
icons, layers), **Components** (button, checkbox, text input, toggle, slider, multi-select, modal,
popover, dialog, tabs, navigation), **Editor**, **Plugins** and **Window**
([reference](https://docs.obsidian.md/Reference/CSS+variables/CSS+variables)).

**Spacing — a 4-pixel grid.** *"Obsidian uses a 4-pixel grid to structure UI elements."*

| | |
|---|---|
| `--size-4-1` … `--size-4-18` | 4, 8, 12, 16, 20, 24, 32, 36, 48, 64, 72 px — **padding and margin come from here** |
| `--size-2-1` · `--size-2-2` · `--size-2-3` | 2, 4, 6 px — *"sparingly and only when you need more fine-grained spacing"* |

[Spacing reference](https://docs.obsidian.md/Reference/CSS+variables/Foundations/Spacing)

**Colour — never a hex.**

| what you mean | what to write |
|---|---|
| the accent, and anything interactive | `--interactive-accent`, `--interactive-accent-hover`, `--interactive-normal`, `--interactive-hover`, `--color-accent` |
| surfaces | `--background-primary`, `--background-primary-alt`, `--background-secondary`, `--background-secondary-alt` |
| borders, hovers, form fields | `--background-modifier-border`, `--background-modifier-border-hover`, `--background-modifier-border-focus`, `--background-modifier-hover`, `--background-modifier-form-field` |
| text | `--text-normal`, `--text-muted`, `--text-faint`, `--text-on-accent`, `--text-accent` |
| something went well, or wrong | `--text-success`, `--text-warning`, `--text-error`, `--background-modifier-success`, `--background-modifier-error` |

[Colors reference](https://docs.obsidian.md/Reference/CSS+variables/Foundations/Colors)

**Shape.** `--radius-s`, `--radius-m`, `--radius-l`, and `--button-radius` for a button
([Button reference](https://docs.obsidian.md/Reference/CSS+variables/Components/Button)).

## The rules, as this repo applies them

1. **No hex, no `rgb()`, no named colour** in a stylesheet. There is exactly one exemption, and it
   is documented in the file that holds it: the 3D graph draws over a **fixed dark background** of
   its own, where a theme's `--text-faint` is near-black and invisible. That file says so at the
   palette.
2. **No pixel that the 4-grid can express.** `padding: 8px` is `var(--size-4-2)`. A genuine pixel —
   a hairline, a sprite size, a WebGL dimension — is allowed and says why in a comment.
3. **No styling from JavaScript.** No `el.style.*`, no `innerHTML`. A class, always — that is what
   a snippet can reach. Enforced by `lint:obsidian`.
4. **Reuse Obsidian's own classes before inventing one**: `mod-cta` for the primary action,
   `mod-warning` for a destructive one, `clickable-icon` for an icon button, `setting-item` and
   friends in settings, `is-active` for a selected state. A button that looks like Obsidian's
   button *is* Obsidian's button.
5. **Settings are built with the `Setting` API and `setHeading()`**, never with hand-rolled
   headings — and no heading says "settings".
6. **Sentence case**, everywhere, in both locales.
7. **A shape that exists twice is a mixin.** `src/styles/utils/mixins.scss` is where a chip, a card,
   a row, a hint and an empty state are defined once; a partial that redefines one is drift.

## Why this is a rule and not a preference

A theme is a promise the user made to themselves about how their vault looks. A plugin that
hardcodes `#f9a8d4` breaks that promise in a way the user cannot fix — not with a snippet, not with
a different theme, not at all. The cost of the rule is that we cannot have a look of our own. That
is the point: **the look belongs to the user**, and our job is to be legible inside it.

Recorded as [constitution §XV](constitution.md).
