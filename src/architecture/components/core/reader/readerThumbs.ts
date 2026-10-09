import type { Component } from "obsidian";
import { c } from "architecture";

/**
 * **The pages, at a glance** (#767 FR-10): the *Pages* tab of a paper's Contents in Page view — every
 * page as a small picture in a grid, the current one marked, each with the paper's own label. A
 * picture is drawn only once it comes into view (an `IntersectionObserver` from the panel's own
 * window), through the run's queue, after the pages on screen; one that leaves before it is drawn is
 * let go. Where the platform has no observer nothing is drawn, and the labels still say which page.
 */

/** A thumbnail's width, in CSS pixels: small enough for three in the panel's row. */
export const THUMB_WIDTH = 96;

export interface ThumbsOptions {
    count: number;
    current: number;
    label(page: number): string;
    /** The page's shape, height over width, so a blank thumbnail is already the page's size. */
    ratio(page: number): number;
    /** Draw `page` into `canvas`, saying when it is done; returns its cancel. */
    draw(page: number, canvas: HTMLCanvasElement, width: number, done: () => void): () => void;
    onPick(page: number, thumb: HTMLElement): void;
}

export interface Thumbs {
    setCurrent(page: number): void;
    dispose(): void;
}

export function renderThumbs(list: HTMLElement, options: ThumbsOptions, scope: Component): Thumbs {
    const grid = list.createDiv({ cls: c("reader-pv-thumbs"), attr: { role: "list" } });
    const items: HTMLElement[] = [];
    const cancels = new Map<number, () => void>();
    const drawn = new Set<number>();
    let current = options.current;

    const win = list.win as unknown as { IntersectionObserver?: typeof IntersectionObserver } | undefined;
    const Observer = win?.IntersectionObserver;
    const observer = Observer
        ? new Observer(
              (entries: IntersectionObserverEntry[]) => {
                  for (const entry of entries) {
                      const page = Number((entry.target as HTMLElement).getAttribute("data-page"));
                      if (!Number.isInteger(page)) continue;
                      if (entry.isIntersecting && !drawn.has(page) && !cancels.has(page)) {
                          const canvas = (entry.target as HTMLElement).querySelector("canvas");
                          if (!canvas) continue;
                          cancels.set(
                              page,
                              options.draw(page, canvas, THUMB_WIDTH, () => {
                                  drawn.add(page);
                                  cancels.delete(page);
                                  canvas.addClass(c("reader-pv-thumb-canvas--drawn"));
                              })
                          );
                      } else if (!entry.isIntersecting && cancels.has(page)) {
                          // Scrolled past before its turn came: let go, asked again if it comes back.
                          cancels.get(page)?.();
                          cancels.delete(page);
                      }
                  }
              },
              { root: list.closest?.(`.${c("reader-panel")}`) ?? null, rootMargin: "200px 0px" }
          )
        : null;

    for (let page = 0; page < options.count; page++) {
        const label = options.label(page);
        const item = grid.createEl("button", {
            cls: [c("reader-pv-thumb"), ...(page === current ? ["is-active"] : [])],
            attr: { type: "button", role: "listitem", "data-page": String(page), ...(page === current ? { "aria-current": "page" } : {}) },
        });
        const sheet = item.createDiv({ cls: c("reader-pv-thumb-sheet") });
        sheet.setCssProps({ "--zf-thumb-ratio": String(Math.round(options.ratio(page) * 10000) / 10000) });
        sheet.createEl("canvas", { cls: c("reader-pv-thumb-canvas") });
        item.createSpan({ cls: c("reader-pv-thumb-label"), text: label });
        scope.registerDomEvent(item, "click", () => options.onPick(page, sheet));
        items.push(item);
        observer?.observe(item);
    }

    return {
        setCurrent(page: number): void {
            if (page === current) return;
            items[current]?.removeClass("is-active");
            items[current]?.removeAttribute("aria-current");
            current = page;
            items[current]?.addClass("is-active");
            items[current]?.setAttribute("aria-current", "page");
        },
        dispose(): void {
            observer?.disconnect();
            for (const cancel of cancels.values()) cancel();
            cancels.clear();
            for (const canvas of Array.from(grid.querySelectorAll("canvas"))) {
                canvas.width = 0;
                canvas.height = 0;
            }
        },
    };
}
