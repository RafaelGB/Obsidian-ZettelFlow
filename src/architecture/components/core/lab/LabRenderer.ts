import { moment as obsidianMoment } from "obsidian";
import type MomentFn from "moment";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { linkThoughts, orderThoughts, type Thought } from "application/thinking/thought";

const moment = obsidianMoment as unknown as typeof MomentFn;

/** How long after you stop typing a thought is written. Short: a refuge must not lose a sentence. */
const SAVE_AFTER_MS = 600;

/**
 * **The Thought Lab** (#467, epic #465) — a mode of the Home surface.
 *
 * A place to think before it has to be knowledge. You write; you contradict yourself underneath;
 * you connect the two. Nothing here is a note, nothing has a state, nothing can be an orphan, and
 * nothing appears in Health — that guarantee is #466's, inherited from the scope exclusion.
 *
 * The design *is* the friction. One command puts a cursor here with no modal, no folder prompt,
 * no kind picker and no title, because the moment a thought matters most is the moment it is
 * most likely to be lost. And **leaving is free**: closing this mid-sentence saves what is there
 * and asks nothing.
 *
 * Four moves, and there will not be a fifth. Everything else — collision, constraints,
 * perspectives, question transformations — belongs to the operator engine in phase 2, and adding
 * one here would start the feature collection this epic exists to prevent.
 */
export class LabRenderer extends KnowledgeModeRenderer {
    private thoughts: Thought[] = [];
    private saveTimer: number | undefined;
    /** Set when connect is armed: the next thought you click joins this one. */
    private connecting: string | undefined;

    constructor(container: HTMLElement) {
        super(container);
    }

    onload(): void {
        void this.readLab();
    }

    onunload(): void {
        this.flush();
        this.container.empty();
    }

    private async readLab(): Promise<void> {
        try {
            this.thoughts = await ThoughtStore.getInstance().all();
        } catch (error) {
            log.warn("[lab] could not read the lab", error);
            this.thoughts = [];
        }
        this.render();
    }

    private render(): void {
        const host = this.container;
        host.empty();
        host.addClass(c("lab"));

        if (!ThoughtStore.getInstance().folder()) {
            // The one thing that can stop the Lab working, said plainly.
            host.createDiv({ cls: c("lab-empty"), text: t("lab_no_folder") });
            return;
        }

        host.createDiv({ cls: c("lab-intro"), text: t("lab_intro") });
        const list = host.createDiv({ cls: c("lab-list") });

        // A new thought, always first and always ready. No button to press to start one.
        this.renderComposer(list);
        for (const thought of orderThoughts(this.thoughts)) this.renderThought(list, thought);
    }

    /** The empty thought at the top. Typing in it is how a thought begins. */
    private renderComposer(list: HTMLElement): void {
        const box = list.createDiv({ cls: [c("lab-thought"), c("lab-composer")].join(" ") });
        const area = box.createEl("textarea", {
            cls: c("lab-text"),
            attr: { placeholder: t("lab_new_thought"), rows: "2" },
        });
        this.registerDomEvent(area, "input", () => this.scheduleNew(area));
        this.registerDomEvent(area, "blur", () => this.flush());
        // Deliberately focused on render: the command's whole promise is a blinking cursor.
        window.setTimeout(() => area.focus(), 0);
    }

    private renderThought(list: HTMLElement, thought: Thought): void {
        const box = list.createDiv({ cls: c("lab-thought") });
        if (this.connecting === thought.id) box.addClass(c("lab-connecting"));

        if (thought.challenges) {
            // What it is, not who is right: neither side is marked.
            box.createDiv({ cls: c("lab-relation"), text: t("lab_challenges") });
        } else if (thought.forkedFrom) {
            box.createDiv({ cls: c("lab-relation"), text: t("lab_forked") });
        }

        const area = box.createEl("textarea", { cls: c("lab-text"), attr: { rows: "2" } });
        area.value = thought.text;
        this.registerDomEvent(area, "input", () => this.scheduleEdit(thought, area));
        this.registerDomEvent(area, "blur", () => this.flush());

        const actions = box.createDiv({ cls: c("lab-actions") });
        this.action(actions, t("lab_fork"), () => void this.fork(thought));
        this.action(actions, t("lab_challenge"), () => void this.challenge(thought));
        this.action(actions, this.connecting ? t("lab_connect_to") : t("lab_connect"), () =>
            void this.connect(thought)
        );

        const meta = box.createDiv({ cls: c("lab-meta") });
        meta.createSpan({ text: moment(thought.at).fromNow() });
        if (thought.links.length > 0) {
            meta.createSpan({ text: t("lab_connected", String(thought.links.length)) });
        }
    }

    private action(host: HTMLElement, label: string, onClick: () => void): void {
        const button = host.createEl("button", { text: label, cls: c("lab-action"), attr: { type: "button" } });
        this.registerDomEvent(button, "click", onClick);
    }

    // ── the four moves ────────────────────────────────────────────────────────

    private async fork(origin: Thought): Promise<void> {
        const made = await ThoughtStore.getInstance().write("", { forkedFrom: origin.id });
        if (made) this.thoughts.push(made);
        this.render();
    }

    private async challenge(origin: Thought): Promise<void> {
        const made = await ThoughtStore.getInstance().write("", { challenges: origin.id });
        if (made) this.thoughts.push(made);
        this.render();
    }

    /** Two clicks: arm on the first thought, land on the second. */
    private async connect(thought: Thought): Promise<void> {
        if (!this.connecting) {
            this.connecting = thought.id;
            this.render();
            return;
        }
        const first = this.thoughts.find((entry) => entry.id === this.connecting);
        this.connecting = undefined;
        if (!first || first.id === thought.id) {
            this.render();
            return;
        }
        const [left, right] = linkThoughts(first, thought);
        this.replace(left);
        this.replace(right);
        const store = ThoughtStore.getInstance();
        await store.save(left);
        await store.save(right);
        this.render();
    }

    // ── saving, which must never lose a sentence ──────────────────────────────

    private pending: (() => Promise<void>) | undefined;

    private scheduleNew(area: HTMLTextAreaElement): void {
        this.pending = async () => {
            const text = area.value.trim();
            if (!text) return;
            const made = await ThoughtStore.getInstance().write(text);
            if (!made) return;
            this.thoughts.push(made);
            this.render();
        };
        this.debounce();
    }

    private scheduleEdit(thought: Thought, area: HTMLTextAreaElement): void {
        this.pending = async () => {
            const next = { ...thought, text: area.value };
            this.replace(next);
            await ThoughtStore.getInstance().save(next);
        };
        this.debounce();
    }

    private debounce(): void {
        if (this.saveTimer) window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => this.flush(), SAVE_AFTER_MS);
    }

    /** Write whatever is waiting, now. Called on blur and on close — leaving must cost nothing. */
    private flush(): void {
        if (this.saveTimer) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        const pending = this.pending;
        this.pending = undefined;
        if (pending) void pending().catch((error: unknown) => log.warn("[lab] could not save", error));
    }

    private replace(thought: Thought): void {
        const at = this.thoughts.findIndex((entry) => entry.id === thought.id);
        if (at === -1) this.thoughts.push(thought);
        else this.thoughts[at] = thought;
    }
}
