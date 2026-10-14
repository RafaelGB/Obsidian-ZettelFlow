import { getLanguage, moment as obsidianMoment } from "obsidian";
import type MomentFn from "moment";
import { c } from "architecture";
import { t } from "architecture/lang";
import { DOCS_SITE, docUrl, pick, type LearnCatalog, type Tutorial } from "../learn/learnCatalog";
import { markSeen, newIds, readSaved, refresh, seenIds, type Freshness, type LearnLoad } from "../learn/learnSource";
import { LearnImages } from "../learn/learnImages";
import type { CommunityRoomHost, RoomHandle, RoomRenderer } from "./communityRoomHost";

// Obsidian re-exports moment typed as a namespace; the callable signature, type-only.
const moment = obsidianMoment as unknown as typeof MomentFn;

/** What the room reads from the world, so a test can hand its own. */
export interface LearnRoomDeps {
    lang(): string;
    refresh(pluginVersion: string): Promise<LearnLoad>;
    images(): LearnImages;
}

const DEFAULT_DEPS: LearnRoomDeps = {
    lang: () => getLanguage(),
    refresh: (pluginVersion) => refresh(pluginVersion),
    images: () => new LearnImages(),
};

/**
 * **The Learn room, interim** (#801): the catalog, as a plain list of tracks and their tutorials —
 * enough to see the fetch, the saved copy, *New* and the language at work. S5 (#802) grows it into
 * the room the mockup draws, with search, lessons and progress.
 *
 * Nothing is read or fetched until the room is **shown**: mounting it, at the view's opening on
 * another room, costs nothing (FR-6). Everything the catalog says is drawn as text.
 */
export class LearnRoom implements RoomHandle {
    private readonly root: HTMLElement;
    private readonly line: HTMLElement;
    private readonly list: HTMLElement;
    private readonly images: LearnImages;
    private started = false;
    private disposed = false;
    private fresh = new Set<string>();

    constructor(roomEl: HTMLElement, private readonly host: CommunityRoomHost, private readonly deps: LearnRoomDeps) {
        this.root = roomEl.createDiv({ cls: [c("community-room-body"), c("learn")].join(" ") });
        this.line = this.root.createDiv({ cls: c("learn-line"), attr: { role: "status", "aria-live": "polite" } });
        this.list = this.root.createDiv({ cls: c("learn-tracks") });
        this.images = deps.images();
    }

    private get pluginVersion(): string {
        return this.host.plugin?.manifest?.version ?? "0.0.0";
    }

    shown(): void {
        if (this.started) return;
        this.started = true;
        // The saved copy first, at once; the network's answer replaces it in place (FR-8).
        const saved = readSaved(this.pluginVersion);
        if (saved) this.draw(saved.catalog);
        else this.say({ state: "fresh" }, true);
        void this.deps.refresh(this.pluginVersion).then((load) => {
            if (this.disposed) return;
            if (load.catalog) this.draw(load.catalog);
            this.say(load.freshness, false);
        });
    }

    count(): null {
        return null;
    }

    dispose(): void {
        this.disposed = true;
        this.images.dispose();
    }

    private get lang(): string {
        return this.deps.lang();
    }

    /** The one inline line (FR-9): offline, update, the empty state — never a toast. */
    private say(freshness: Freshness, loading: boolean): void {
        this.line.empty();
        this.line.removeClass("is-empty-state");
        if (loading) {
            this.line.setText(t("learn_loading"));
            return;
        }
        switch (freshness.state) {
            case "fresh":
                return;
            case "offline":
                this.line.setText(t("learn_fresh_offline", moment(freshness.savedAt).format("LL")));
                return;
            case "update-needed":
                this.line.setText(t("learn_update_needed"));
                return;
            case "empty": {
                this.line.addClass("is-empty-state");
                this.line.createEl("p", { text: t("learn_needs_connection") });
                this.line.createEl("a", { cls: c("learn-docs-link"), text: t("learn_open_docs"), href: DOCS_SITE, attr: { target: "_blank", rel: "noopener" } });
                return;
            }
        }
    }

    /** Draw the catalog, keeping the reader's place and any tutorial left open (FR-8). */
    private draw(catalog: LearnCatalog): void {
        const scroll = this.root.scrollTop;
        const open = new Set(Array.from(this.list.querySelectorAll('[aria-expanded="true"]')).map((el) => el.getAttribute("data-tutorial") ?? ""));
        this.fresh = newIds(catalog, seenIds());
        this.list.empty();
        for (const track of catalog.tracks) {
            const section = this.list.createEl("section", { cls: c("learn-track"), attr: { "data-track": track.id } });
            section.createEl("h3", { cls: c("learn-track-title"), text: pick(track.title, this.lang) });
            section.createEl("p", { cls: c("learn-track-blurb"), text: pick(track.blurb, this.lang) });
            const items = section.createEl("ul", { cls: c("learn-tutorials") });
            for (const id of track.tutorials) {
                const tutorial = catalog.tutorials[id];
                if (tutorial) this.drawTutorial(items.createEl("li", { cls: c("learn-tutorial") }), tutorial, open.has(id));
            }
        }
        this.root.scrollTop = scroll;
    }

    private drawTutorial(item: HTMLElement, tutorial: Tutorial, open: boolean): void {
        const head = item.createEl("button", {
            cls: c("learn-tutorial-head"),
            attr: { type: "button", "aria-expanded": "false", "data-tutorial": tutorial.id },
        });
        head.createSpan({ cls: c("learn-tutorial-title"), text: pick(tutorial.title, this.lang) });
        const badge = this.fresh.has(tutorial.id) ? head.createSpan({ cls: c("learn-new"), text: t("learn_new") }) : null;
        head.createSpan({ cls: c("learn-tutorial-minutes"), text: t("learn_minutes", String(tutorial.minutes)) });
        item.createEl("p", { cls: c("learn-tutorial-summary"), text: pick(tutorial.summary, this.lang) });
        const body = item.createDiv({ cls: c("learn-tutorial-body") });
        body.addClass("is-hidden");
        let drawn = false;
        const toggle = () => {
            const opening = head.getAttribute("aria-expanded") !== "true";
            head.setAttribute("aria-expanded", opening ? "true" : "false");
            body.toggleClass("is-hidden", !opening);
            if (!opening) return;
            if (!drawn) {
                drawn = true;
                this.drawLesson(body, tutorial);
            }
            if (this.fresh.delete(tutorial.id)) {
                markSeen(tutorial.id);
                badge?.remove();
            }
        };
        head.addEventListener("click", toggle);
        if (open) toggle();
    }

    private drawLesson(body: HTMLElement, tutorial: Tutorial): void {
        body.createEl("p", { cls: c("learn-tutorial-door"), text: pick(tutorial.door, this.lang) });
        const steps = body.createEl("ol", { cls: c("learn-steps") });
        for (const step of tutorial.steps) {
            const li = steps.createEl("li", { cls: c("learn-step") });
            li.createEl("strong", { cls: c("learn-step-title"), text: pick(step.title, this.lang) });
            li.createEl("p", { cls: c("learn-step-body"), text: pick(step.body, this.lang) });
            if (step.image) this.images.frame(li, step.image, pick(step.title, this.lang));
        }
        if (tutorial.tip) body.createEl("p", { cls: c("learn-tip"), text: pick(tutorial.tip, this.lang) });
        const url = tutorial.doc ? docUrl(tutorial.doc) : null;
        if (url) body.createEl("a", { cls: c("learn-docs-link"), text: t("learn_read_full_page"), href: url, attr: { target: "_blank", rel: "noopener" } });
    }
}

export function learnRoom(deps: Partial<LearnRoomDeps> = {}): RoomRenderer {
    return { mount: (el, host) => new LearnRoom(el, host, { ...DEFAULT_DEPS, ...deps }) };
}

export const LEARN_ROOM: RoomRenderer = learnRoom();
