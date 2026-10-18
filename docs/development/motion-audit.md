# Motion audit: frames on the real device

The Reader and the Library move a lot: pages turn under a finger, a chapter turns like paper, a book
flies from its shelf into the Reader and back (§XVI, *one continuous shot*). Whether that motion is
smooth should be **a number**, not an impression. This page is how the number is taken, on a desktop
and on an iPad, and what the first audit found ([#826](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/826),
epic [#827](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/827)).

## The verdict

One pure function, `frameVerdict` (`src/architecture/monitoring/frameVerdict.ts`, which imports
nothing), judges a gesture from data a device supplies:
- when each frame was shown;
- when the input came;
- when the page laid out, or *not measurable* on a device that cannot say.

jest proves the verdict (`test/architecture/monitoring/frameVerdict.test.ts`). A device never has to.

| Criterion | How it is counted |
|---|---|
| Frames on time | At least **95 %** of the motion's intervals are one refresh. An interval is counted **in refreshes** (`Math.round(interval / refresh)`), so a vsync's jitter, 8.0 to 8.7 ms at 120 Hz, is one frame, not a drop. |
| No long frame | No interval is longer than **two** refreshes. |
| Start | A finger's gesture moves in the frame after the input. A motion the clock plays starts within **100 ms**. |
| No layout | The page does not lay out while the motion runs. Style recalculation is **reported, not gated**: a motion a script drives is one by definition. |
| Interrupt | A key or a tap stops a motion within **one** frame. |

The thresholds are one constant, `SMOOTH`. They were taken as the default (open question 2 of #826),
so changing them is one line.

The screen's refresh is **measured**, never assumed. It is the median of the lower half of the
motion's own intervals, which is what the screen does when nothing drops. A WKWebView can draw at
60 Hz on a 120 Hz iPad, and the meter then says so.

## The frame meter: one instrument, desktop and iPad

*Settings › Advanced › Frame meter* (`src/architecture/monitoring/frameMeter.ts`) times the plugin's
own gestures frame by frame and judges each one with `frameVerdict`:
- page drag, turning or springing back;
- chapter turn, in each motion (*leaf*, *flow*, *stack*), by the clock or held under a finger;
- shelf drag;
- the opening and closing shots, interrupted or not.

It shows one line per gesture. It is **off by default** and lasts the session only. **Off, it costs
nothing**: every gesture gets the same do-nothing handle, with no frame callback and no listener
(`frameMeter.test.ts`; the `reader.page.turn` budget holds with the hooks in).

On a device, the meter can only see the frames the **main thread** runs (`requestAnimationFrame`). A
motion the compositor plays, such as a chapter's sheet or the shot's camera (`transform` animations),
keeps moving while the main thread is busy. So a long main-thread frame during one of them is a
**pessimistic** reading. It means work landed during the motion, not that the motion stopped.

## On a desktop: the driver

`scripts/motion-trace.mjs` replays each gesture with trusted input over the Chrome DevTools
Protocol, five times:
- keys: `Input.dispatchKeyEvent`;
- mouse: `Input.dispatchMouseEvent`;
- touch: `Emulation.setTouchEmulationEnabled` + `Input.dispatchTouchEvent`.

Around each run it records a Chrome trace and reads only **the layouts, style recalculations and
paints between the gesture's two marks**. The frames are the meter's.

It drives a **separate** Obsidian, never your own:

```
Obsidian.exe --user-data-dir=<scratch>/obsdata --remote-debugging-port=9333
```

Use a throwaway vault holding the built plugin, a long technical book and 200 books on a shelf. The
traps it already met:
- **A window in the background throttles its timers** to about one a minute after a few minutes. The
  driver calls `Page.bringToFront` and `Emulation.setFocusEmulationEnabled` first.
- **The first-run welcome modal takes the keys.** Close it before anything else.
- **The Library opens on its desk of recently read books.** The book you click is the one whose first
  chapter opens, so a synthetic 1 MB chapter there makes any shot look slow. Click a real book.

## What the first audit found (2026-10-17)

Desktop, Intel Core Ultra 7 165H, Windows 11, a 120 Hz screen, Obsidian 1.14.4. The figures are
main-thread frames from the meter, and layout and style time from the trace, over five runs.

| Gesture | Before | After | Fix |
|---|---|---|---|
| Page drag | slowest frames 25 ms; per drag 18 layouts, 36 paints, **222–280 ms of style recalculation** | slowest frames **9 ms**; **0** layouts, **0** paints, 22–32 ms of style | `--zf-page-x` registered as **not inherited** (`@property … inherits: false`). A move restyled every block of the chapter; now only the page. |
| Opening a book (200 books) | **108 ms** frame, 117 ms to motion, slow to stop | slowest frames **17 ms**, **94 ms** to motion, stops at once | The Reader starts opening **after the camera's first frame is shown**, so the push runs on the compositor while the Reader opens underneath. A skipped shot ends where the camera jumps to its end. |
| Chapter turn (clock) | slowest frames 9 ms, one long frame of 33–42 ms | (unchanged) | The next chapter is drawn underneath while the sheet moves on the compositor: a pessimistic reading, see above. |
| Shelf drag | slowest frames 9–17 ms, 2 layouts | (unchanged) | Within budget. |
| Closing a book | ~120 ms before the camera moves | (unchanged) | It waits for the Library to draw the cover: [#829](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/829). |

The ways into the Reader that opened it with a **cut** were given their origin in
[#828](https://github.com/RafaelGB/Obsidian-ZettelFlow/issues/828): every door on screen now flies from
what was clicked. A menu or a command keeps the Reader's own entrance. The origin's flight is not
metered, on purpose: it is a compositor `transform` animation, and timing it would spend bundle space
on a number nobody needed yet.

## On an iPad

iPadOS has no developer protocol a script can drive, so the meter is the instrument there:
1. *Settings › ZettelFlow › Advanced › Frame meter*: turn it **on**, and note *Screen refresh*.
2. In the Library, tap a cover and close the Reader, five times. Then drag a page halfway and let go,
   five times, and a little, five times.
3. Hold-turn a chapter at its last page, five times in each *Changing chapter* motion. Then long-press
   a book and carry it across two shelves, five times.
4. Back in *Frame meter*, read each line. Turn it off, or restart Obsidian.

## What jest proves, and what only a device does

- **jest:** the verdict, the meter's off path and its traces, the hooks in each gesture, reduced
  motion and the interrupt (`test/architecture/monitoring/`).
- **A device:** the frame numbers themselves. A real compositor, real touch and a real screen's
  refresh exist only on one.
