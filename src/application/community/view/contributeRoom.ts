import { TFile, setIcon } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { DISCUSSIONS_URL, bugReportFields, newIssueUrl } from "../githubContribute";
import { buildCanvasTemplate, downloadTemplate, shareCandidate, shareFlow } from "../shareSystem";
import { systemDrawing, type CanvasLike } from "../systemDrawing";
import { docUrl, type LearnCatalog } from "../learn/learnCatalog";
import { refresh } from "../learn/learnSource";
import type { CommunityRoomHost, RoomHandle, RoomRenderer } from "./communityRoomHost";
import { drawSystem } from "./systemDrawingView";
import { stepsText } from "./systemPanel";

type LocaleKey = Parameters<typeof t>[0];

/** The tutorial *How to contribute well* opens (#801 S4 FR-2). */
export const CONTRIBUTE_TUTORIAL = "contribute-a-system";
/** Where it goes when the catalog does not have that tutorial. */
export const CONTRIBUTE_DOC = "how-to-contribute/systems-gallery.md";

/** What the room reads from and does to the world, so a test can hand its own. */
export interface ContributeRoomDeps {
    /** A GitHub page, in the browser. */
    open(url: string): void;
    download(name: string, json: string): void;
    /** Learn's catalog — the session's one fetch, or the saved copy. */
    learnCatalog(pluginVersion: string): Promise<LearnCatalog | null>;
}

const DEFAULT_DEPS: ContributeRoomDeps = {
    open: (url) => void activeWindow.open(url),
    download: downloadTemplate,
    learnCatalog: async (pluginVersion) => (await refresh(pluginVersion)).catalog,
};

/** The bug form's environment fields, as the card names them. */
const ENV_LABEL: Record<string, LocaleKey> = {
    plugin_version: "community_contribute_bug_plugin",
    obsidian_version: "community_contribute_bug_obsidian",
    platform: "community_contribute_bug_platform",
};

/**
 * **The Contribute room** (#803, epic #797). Everything goes through GitHub, and nothing leaves the
 * vault until you publish it yourself.
 *
 * The contribution that matters most leads: *Share this canvas as a system*, with the canvas it
 * would share drawn in front of you — the one you last had open in this window, else the creation
 * flow — and, with none, a disabled button that says why rather than a toast after the click. The
 * bug card shows the environment the form will receive before you press it. *How to contribute
 * well* pans to Learn and then opens the contributing tutorial, in that order.
 */
export class ContributeRoom implements RoomHandle {
    private readonly root: HTMLElement;
    private readonly shareButton: HTMLButtonElement;
    private readonly shareStatus: HTMLElement;
    private readonly preview: HTMLElement;
    private candidate: string | null = null;
    /** Each redraw of the preview supersedes the one before it. */
    private drawing = 0;
    private disposed = false;

    constructor(roomEl: HTMLElement, private readonly host: CommunityRoomHost, private readonly deps: ContributeRoomDeps) {
        this.root = roomEl.createDiv({ cls: [c("community-room-body"), c("contribute")].join(" ") });
        this.root.createEl("p", { cls: c("contribute-lede"), text: t("community_contribute_lede") });
        const grid = this.root.createDiv({ cls: c("contribute-grid") });

        const lead = grid.createEl("section", { cls: [c("contribute-card"), "is-lead"].join(" ") });
        const text = lead.createDiv({ cls: c("contribute-lead-text") });
        this.title(text, "share-2", "community_contribute_share_title");
        text.createEl("p", { cls: c("contribute-desc"), text: t("community_contribute_share_desc") });
        text.createEl("p", { cls: c("contribute-fine"), text: t("community_contribute_share_travels") });
        const row = text.createDiv({ cls: c("contribute-actions") });
        this.shareButton = row.createEl("button", { cls: [c("contribute-share"), "mod-cta"].join(" "), text: t("community_contribute_share_button"), attr: { type: "button" } });
        this.shareButton.addEventListener("click", () => void this.share());
        this.shareStatus = text.createEl("p", { cls: c("contribute-status"), attr: { role: "status" } });
        this.preview = lead.createDiv({ cls: c("contribute-preview") });

        this.card(grid, "lightbulb", "community_contribute_idea_title", "community_contribute_idea_desc", "community_contribute_idea_button", () =>
            this.deps.open(newIssueUrl("feature_request.yaml"))
        );
        this.card(
            grid,
            "bug",
            "community_contribute_bug_title",
            "community_contribute_bug_desc",
            "community_contribute_bug_button",
            () => this.deps.open(newIssueUrl("bug_report.yaml", bugReportFields(this.host.plugin))),
            (card) => this.environment(card)
        );
        this.card(grid, "messages-square", "community_contribute_discuss_title", "community_contribute_discuss_desc", "community_contribute_discuss_button", () =>
            this.deps.open(DISCUSSIONS_URL)
        );
        this.card(grid, "graduation-cap", "community_contribute_well_title", "community_contribute_well_desc", "community_contribute_well_button", () => void this.learnHow());

        void this.drawCandidate();
    }

    private title(parent: HTMLElement, icon: string, key: LocaleKey): void {
        const h = parent.createEl("h3", { cls: c("contribute-title") });
        setIcon(h.createSpan({ cls: c("contribute-icon") }), icon);
        h.createSpan({ text: t(key) });
    }

    private card(grid: HTMLElement, icon: string, titleKey: LocaleKey, descKey: LocaleKey, buttonKey: LocaleKey, press: () => void, extra?: (card: HTMLElement) => void): HTMLElement {
        const card = grid.createEl("section", { cls: c("contribute-card") });
        this.title(card, icon, titleKey);
        card.createEl("p", { cls: c("contribute-desc"), text: t(descKey) });
        extra?.(card);
        const row = card.createDiv({ cls: c("contribute-actions") });
        const button = row.createEl("button", { text: t(buttonKey), attr: { type: "button" } });
        button.addEventListener("click", press);
        return card;
    }

    /** What the bug form will be filled in with, shown before you press it (FR-5). */
    private environment(card: HTMLElement): void {
        const fields = bugReportFields(this.host.plugin);
        const box = card.createDiv({ cls: c("contribute-env") });
        box.createDiv({ cls: c("contribute-env-title"), text: t("community_contribute_bug_env") });
        const list = box.createEl("dl", { cls: c("contribute-env-list") });
        for (const [key, value] of Object.entries(fields)) {
            const label = ENV_LABEL[key];
            list.createEl("dt", { text: label ? t(label) : key });
            list.createEl("dd", { text: value, attr: { "data-field": key } });
        }
    }

    // ── the lead card: what would be shared ─────────────────────────────────────

    /** The candidate, drawn: its mini drawing, its name and its steps — or why there is none. */
    private async drawCandidate(): Promise<void> {
        const turn = ++this.drawing;
        const vault = this.host.app.vault;
        const path = shareCandidate(
            { focused: this.host.lastCanvas?.() ?? null, ribbon: this.host.plugin.settings?.ribbonCanvas },
            (candidate) => vault.getFileByPath(candidate) instanceof TFile
        );
        this.candidate = path;
        this.shareButton.disabled = !path;
        this.shareStatus.setText(path ? "" : t("community_contribute_share_no_canvas"));
        this.preview.empty();
        this.preview.toggleClass("is-hidden", !path);
        if (!path) return;
        const file = vault.getFileByPath(path);
        if (!(file instanceof TFile)) return;
        let canvas: CanvasLike | null = null;
        try {
            canvas = JSON.parse(await vault.cachedRead(file)) as CanvasLike;
        } catch (error) {
            log.debug("[contribute] the canvas could not be read for its preview", error);
        }
        if (turn !== this.drawing || this.disposed) return;
        const drawing = canvas ? systemDrawing(canvas) : null;
        const thumb = this.preview.createDiv({ cls: c("contribute-preview-thumb") });
        if (drawing) drawSystem(thumb, drawing, "thumb");
        else thumb.addClass("is-missing");
        const meta = this.preview.createDiv({ cls: c("contribute-preview-meta") });
        meta.createEl("b", { cls: c("contribute-preview-name"), text: file.name });
        meta.createSpan({ cls: c("contribute-preview-steps"), text: stepsText(drawing?.steps ?? 0, drawing?.branches ?? 0) });
    }

    /** *Prepare the system*: today's share flow — the prefilled form, or a download and the form. */
    private async share(): Promise<void> {
        const path = this.candidate;
        if (!path) return;
        const built = await buildCanvasTemplate(path);
        if (!built) {
            void this.drawCandidate();
            return;
        }
        const flow = shareFlow(built);
        if ("download" in flow) {
            this.deps.download(flow.download.name, flow.download.json);
            this.shareStatus.setText(t("community_contribute_share_downloaded"));
        } else {
            this.shareStatus.setText("");
        }
        this.deps.open(flow.open);
    }

    /** Learn first, then the tutorial — after the pan has settled. Without it in the catalog, the docs page. */
    private async learnHow(): Promise<void> {
        let catalog: LearnCatalog | null = null;
        try {
            catalog = await this.deps.learnCatalog(this.host.plugin.manifest.version);
        } catch (error) {
            log.debug("[contribute] Learn's catalog is not at hand", error);
        }
        if (this.disposed) return;
        if (catalog?.tutorials[CONTRIBUTE_TUTORIAL]) {
            this.host.openRoom("learn", undefined, { tutorial: CONTRIBUTE_TUTORIAL });
            return;
        }
        const url = docUrl(CONTRIBUTE_DOC);
        if (url) this.deps.open(url);
    }

    // ── the room's handle ───────────────────────────────────────────────────────

    /** Which canvas the lead card would share — for tests. */
    get sharing(): string | null {
        return this.candidate;
    }

    shown(): void {
        void this.drawCandidate();
    }

    canvasChanged(): void {
        void this.drawCandidate();
    }

    dispose(): void {
        this.disposed = true;
        this.root.remove();
    }
}

/** The Contribute room, as Community mounts it. */
export function contributeRoom(deps: Partial<ContributeRoomDeps> = {}): RoomRenderer {
    return {
        mount(el, host) {
            return new ContributeRoom(el, host, { ...DEFAULT_DEPS, ...deps });
        },
    };
}

export const CONTRIBUTE_ROOM = contributeRoom();
