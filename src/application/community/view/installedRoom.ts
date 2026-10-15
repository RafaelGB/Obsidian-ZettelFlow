import { TFile, moment as obsidianMoment, setIcon } from "obsidian";
import type MomentFn from "moment";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { FLOW_ROLE_LABEL_KEY } from "architecture/plugin/canvas/flowRole";
import type { CommunityAction, CommunityStepSettings } from "config";
import type ZettelFlow from "main";
import type { InstalledSystem } from "../installRecord";
import { forgetInstall, planRemove, removeFacts, takeBackInstall, type TakeBackResult } from "../removeInstall";
import { systemDrawing, type CanvasLike, type SystemDrawing } from "../systemDrawing";
import type { CommunityRoomHost, RoomHandle, RoomRenderer } from "./communityRoomHost";
import { drawSystem } from "./systemDrawingView";
import { SHOT, boxOf, collapseRow, flyDrawing } from "./systemShots";

type LocaleKey = Parameters<typeof t>[0];

// Obsidian re-exports moment typed as a namespace; the callable signature, type-only.
const moment = obsidianMoment as unknown as typeof MomentFn;

/** A system's row, and what it knows once its canvas has been read. */
interface Row {
    record: InstalledSystem;
    el: HTMLElement;
    thumb: HTMLElement;
    drawing?: SystemDrawing;
}

/** A loose piece, as `installedTemplates` holds it. */
type Piece = { kind: "step"; id: string; value: CommunityStepSettings } | { kind: "action"; id: string; value: CommunityAction };

const PIECE_KIND_KEY: Record<Piece["kind"], LocaleKey> = {
    step: "community_templates_type_step",
    action: "community_templates_type_action",
};

function roleLabel(record: InstalledSystem): string {
    if (record.role === "none") return t("community_system_role_none");
    return t(FLOW_ROLE_LABEL_KEY[record.role] as LocaleKey);
}

const nameOf = (path: string) => path.split("/").pop() ?? path;

/** What *Remove* did, in one line: two phrases, never one string with two counts (#546 D2). */
export function removedLine(result: Pick<TakeBackResult, "removed" | "kept" | "failed">): string {
    const parts = [tCount(result.removed.length, "community_installed_removed", String(result.removed.length))];
    if (result.kept.length > 0) {
        parts.push(tCount(result.kept.length, "community_installed_kept", String(result.kept.length), result.kept.map(nameOf).join(", ")));
    }
    if (result.failed.length > 0) parts.push(t("community_installed_failed", result.failed.map(nameOf).join(", ")));
    return parts.join(" ");
}

function piecesOf(plugin: ZettelFlow): Piece[] {
    const installed = plugin.settings?.installedTemplates;
    return [
        ...Object.entries(installed?.steps ?? {}).map(([id, value]): Piece => ({ kind: "step", id, value })),
        ...Object.entries(installed?.actions ?? {}).map(([id, value]): Piece => ({ kind: "action", id, value })),
    ];
}

/**
 * A button that asks once (#803 FR-11): the first press turns it into the confirmation, the second
 * does it. Panning away, or the room drawing itself again, turns it back.
 */
function twoStep(button: HTMLButtonElement, idle: string, arm: () => Promise<string | null>, confirm: () => void, resets: (() => void)[]): void {
    let armed = false;
    const reset = () => {
        armed = false;
        button.setText(idle);
        button.removeClass("mod-warning");
    };
    resets.push(reset);
    button.addEventListener("click", () => {
        if (armed) {
            reset();
            confirm();
            return;
        }
        void arm().then((label) => {
            if (label === null) return;
            armed = true;
            button.setText(label);
            button.addClass("mod-warning");
        });
    });
}

/**
 * **The Installed room** (#803, epic #797): what you brought from the gallery, and how to take it back.
 *
 * Systems come from the install record (#799 FR-14) — installs made before it existed are not
 * guessed at. Each row draws **its canvas as it is in your vault now**, read locally; *Open canvas*
 * grows that drawing to fill the tab, which becomes the canvas, and Obsidian's *Back* flies it home.
 * *Remove* asks once, then takes the install back without destroying your work: exactly, while the
 * write record still holds the batch; by content hash after that, keeping and naming what you
 * changed. A row whose canvas is gone offers *Forget it*, which touches nothing in the vault. The
 * loose pieces keep their editors.
 */
export class InstalledRoom implements RoomHandle {
    private readonly root: HTMLElement;
    private readonly rows = new Map<string, Row>();
    private resets: (() => void)[] = [];
    private drawn: Promise<void> = Promise.resolve();
    /** What was drawn, so arriving again redraws only when something changed. */
    private signature = "";
    private busy = false;
    /** The take-backs confirmed, run in order. */
    private removing: Promise<void> = Promise.resolve();
    /** Set the moment the tab becomes a canvas: the history entry *Back* returns to carries it. */
    private leaving: string | null = null;
    private disposed = false;

    constructor(private readonly roomEl: HTMLElement, private readonly host: CommunityRoomHost) {
        this.root = roomEl.createDiv({ cls: [c("community-room-body"), c("installed")].join(" ") });
        this.render();
    }

    private get plugin(): ZettelFlow {
        return this.host.plugin;
    }

    private records(): InstalledSystem[] {
        return [...(this.plugin.settings?.installedSystems ?? [])].sort((a, b) => b.at - a.at);
    }

    private currentSignature(): string {
        const clipboard = this.plugin.settings?.communitySettings?.clipboardTemplate ? 1 : 0;
        return JSON.stringify([this.records().map((record) => record.id), piecesOf(this.plugin).map((piece) => `${piece.kind}:${piece.id}`), clipboard]);
    }

    /** The whole room, from the settings as they are now. Any armed *Remove* is disarmed. */
    render(): void {
        this.resets = [];
        this.rows.clear();
        this.root.empty();
        this.signature = this.currentSignature();
        this.root.createEl("p", { cls: c("installed-lede"), text: t("community_installed_lede") });
        this.renderSystems(this.root.createEl("section", { cls: c("installed-section") }));
        this.renderPieces(this.root.createEl("section", { cls: [c("installed-section"), c("installed-pieces")].join(" ") }));
        this.host.refreshCounts?.();
    }

    // ── systems ─────────────────────────────────────────────────────────────────

    private renderSystems(section: HTMLElement): void {
        section.createEl("h3", { cls: c("installed-title"), text: t("community_installed_systems") });
        const records = this.records();
        if (records.length === 0) {
            this.drawNothing(section);
            return;
        }
        const list = section.createDiv({ cls: c("installed-list") });
        const reads: Promise<void>[] = [];
        for (const record of records) reads.push(this.drawRow(list, record));
        this.drawn = Promise.all(reads).then(() => undefined);
    }

    private drawNothing(parent: HTMLElement): void {
        const empty = parent.createDiv({ cls: c("installed-empty") });
        empty.createEl("p", { text: t("community_installed_nothing") });
        const browse = empty.createEl("button", { cls: "mod-cta", text: t("community_installed_browse"), attr: { type: "button" } });
        browse.addEventListener("click", () => this.host.openRoom("systems"));
    }

    private drawRow(list: HTMLElement, record: InstalledSystem): Promise<void> {
        const vault = this.host.app.vault;
        const el = list.createDiv({ cls: c("installed-row"), attr: { "data-install": record.id } });
        const thumb = el.createDiv({ cls: c("installed-thumb") });
        const text = el.createDiv({ cls: c("installed-text") });
        text.createEl("b", { cls: c("installed-name"), text: record.name });
        text.createSpan({ cls: c("installed-meta"), text: t("community_installed_meta", moment(record.at).format("LL"), record.folder, roleLabel(record)) });
        const actions = el.createDiv({ cls: c("installed-actions") });
        const row: Row = { record, el, thumb };
        this.rows.set(record.id, row);

        const canvas = vault.getFileByPath(record.canvas);
        if (!(canvas instanceof TFile)) {
            // FR-12: deleted or moved by you. The row stays, so the record can be let go of.
            el.addClass("is-missing");
            thumb.createSpan({ cls: c("installed-thumb-missing"), text: t("community_installed_canvas_missing") });
            const forget = actions.createEl("button", { text: t("community_installed_forget"), attr: { type: "button" } });
            forget.addEventListener("click", () => void this.forget(row));
            return Promise.resolve();
        }

        const open = actions.createEl("button", { text: t("community_installed_open_canvas"), attr: { type: "button" } });
        open.addEventListener("click", () => void this.openCanvas(row));
        const remove = actions.createEl("button", { cls: c("installed-remove"), text: t("community_installed_remove"), attr: { type: "button" } });
        twoStep(
            remove,
            t("community_installed_remove"),
            async () => {
                const plan = planRemove(record, await removeFacts(this.plugin, record));
                return this.disposed ? null : tCount(plan.trash.length, "community_installed_remove_confirm", String(plan.trash.length));
            },
            () => void this.remove(row),
            this.resets
        );

        return vault
            .cachedRead(canvas)
            .then((content) => {
                if (this.disposed) return;
                row.drawing = systemDrawing(JSON.parse(content) as CanvasLike);
                drawSystem(thumb, row.drawing, "thumb");
            })
            .catch((error) => {
                log.debug("[installed] the canvas could not be drawn", record.canvas, error);
                thumb.addClass("is-missing");
            });
    }

    /** *Open canvas*: the row's drawing fills the tab, and the tab becomes the canvas (FR-10). */
    async openCanvas(row: Row): Promise<void> {
        if (this.busy) return;
        const file = this.host.app.vault.getFileByPath(row.record.canvas);
        if (!(file instanceof TFile)) {
            this.render();
            return;
        }
        this.busy = true;
        try {
            await this.drawn;
            if (row.drawing) {
                row.thumb.addClass("is-travelling");
                await flyDrawing(this.shotHost(), row.drawing, boxOf(row.thumb), boxOf(this.shotHost()), SHOT.land, () => undefined);
            }
            this.leaving = row.record.id;
            await this.host.leaf.openFile(file);
        } catch (error) {
            log.error("[installed] could not open the installed canvas", error);
        } finally {
            row.thumb.removeClass("is-travelling");
            this.busy = false;
        }
    }

    /** *Back* from the canvas: the tab's drawing flies home onto its row. */
    async flyHome(id: string): Promise<void> {
        await this.drawn;
        const row = this.rows.get(id);
        if (!row?.drawing || this.disposed) return;
        row.el.scrollIntoView({ block: "nearest", inline: "nearest" });
        row.thumb.addClass("is-travelling");
        await flyDrawing(this.shotHost(), row.drawing, boxOf(this.shotHost()), boxOf(row.thumb), SHOT.home, () => row.thumb.removeClass("is-travelling"));
    }

    /** *Remove n files*, confirmed: the take-back, then one line where the row was (FR-11). */
    private remove(row: Row): Promise<void> {
        // One at a time, in the order confirmed: a second confirmation while the first is still
        // trashing (the system trash can take a second) waits its turn rather than being dropped.
        this.removing = this.removing.then(() => this.takeBack(row)).catch((error) => log.error("[installed] could not take the install back", error));
        return this.removing;
    }

    private async takeBack(row: Row): Promise<void> {
        if (this.disposed || !this.rows.has(row.record.id)) return;
        this.busy = true;
        try {
            const result = await takeBackInstall(this.plugin, row.record);
            // The line stays until you leave the room; coming back draws the list as it is now.
            this.rows.delete(row.record.id);
            const line = createDiv({ cls: c("installed-result"), text: removedLine(result), attr: { role: "status" } });
            await collapseRow(row.el, line);
            this.host.refreshCounts?.();
        } finally {
            this.busy = false;
        }
    }

    /** *Forget it*: the record goes; the vault is not touched (FR-12). */
    private async forget(row: Row): Promise<void> {
        await forgetInstall(this.plugin, row.record.id);
        this.render();
    }

    // ── loose pieces ────────────────────────────────────────────────────────────

    private renderPieces(section: HTMLElement): void {
        const head = section.createDiv({ cls: c("installed-head") });
        head.createEl("h3", { cls: c("installed-title"), text: t("community_installed_pieces") });
        const saved = this.plugin.settings?.communitySettings?.clipboardTemplate;
        if (saved) {
            const button = head.createEl("button", { cls: c("installed-clipboard"), attr: { type: "button" } });
            setIcon(button.createSpan({ cls: c("installed-clipboard-icon") }), "clipboard-paste");
            button.createSpan({ text: t("community_installed_from_clipboard") });
            button.addEventListener("click", () => {
                const { installedTemplates, communitySettings } = this.plugin.settings;
                if (saved.template_type === "step") installedTemplates.steps[saved.id] = saved as CommunityStepSettings;
                else if (saved.template_type === "action") installedTemplates.actions[saved.id] = saved as CommunityAction;
                delete communitySettings.clipboardTemplate;
                void this.plugin.saveSettings();
                this.render();
            });
        }
        const pieces = piecesOf(this.plugin);
        if (pieces.length === 0) {
            section.createEl("p", { cls: c("installed-empty"), text: t("community_installed_no_pieces") });
            return;
        }
        const list = section.createDiv({ cls: c("installed-list") });
        for (const piece of pieces) {
            const el = list.createDiv({ cls: c("installed-piece"), attr: { "data-piece": `${piece.kind}:${piece.id}` } });
            el.createSpan({ cls: c("installed-piece-kind"), text: t(PIECE_KIND_KEY[piece.kind]) });
            el.createEl("b", { cls: c("installed-piece-name"), text: piece.value.title });
            const actions = el.createDiv({ cls: c("installed-actions") });
            const edit = actions.createEl("button", { text: t("community_installed_edit"), attr: { type: "button" } });
            edit.addEventListener("click", () => void this.edit(piece));
            const remove = actions.createEl("button", { text: t("community_installed_remove"), attr: { type: "button" } });
            twoStep(remove, t("community_installed_remove"), async () => t("community_installed_remove_piece_confirm"), () => void this.removePiece(piece), this.resets);
        }
    }

    /**
     * The piece's own editor, unchanged (FR-13). Loaded when asked for: it brings the step editor
     * with it, and the room should not wait on that to draw.
     */
    private async edit(piece: Piece): Promise<void> {
        const redraw = () => this.render();
        try {
            if (piece.kind === "step") {
                const { InstalledStepEditorModal } = await import("zettelkasten/modals/InstalledStepEditorModal");
                new InstalledStepEditorModal(this.plugin, piece.value, redraw).open();
            } else {
                const { InstalledActionEditorModal } = await import("zettelkasten/modals/InstalledActionEditorModal");
                new InstalledActionEditorModal(this.plugin, piece.value, redraw).open();
            }
        } catch (error) {
            log.error(`[installed] could not open the ${piece.kind} editor`, error);
        }
    }

    /** As the editor's own *Remove* does it: the entry goes, and the settings are saved. */
    private async removePiece(piece: Piece): Promise<void> {
        const installed = this.plugin.settings.installedTemplates;
        if (piece.kind === "step") delete installed.steps[piece.id];
        else delete installed.actions[piece.id];
        await this.plugin.saveSettings();
        this.render();
    }

    /** What the shots fly over: the whole Community view, so a ghost can cross from a row to the tab. */
    private shotHost(): HTMLElement {
        return this.roomEl.closest<HTMLElement>(`.${c("community")}`) ?? this.root;
    }

    // ── the room's handle ───────────────────────────────────────────────────────

    /** Systems and loose pieces; the nav draws no zero (FR-15). */
    count(): number {
        return (this.plugin.settings?.installedSystems?.length ?? 0) + piecesOf(this.plugin).length;
    }

    shown(): void {
        if (this.currentSignature() !== this.signature) this.render();
    }

    hidden(): void {
        for (const reset of this.resets) reset();
    }

    viewState(): Record<string, unknown> {
        return this.leaving ? { installedHome: this.leaving } : {};
    }

    applyState(state: Record<string, unknown>): void {
        if (typeof state.installedHome === "string") void this.flyHome(state.installedHome);
    }

    dispose(): void {
        this.disposed = true;
        this.root.remove();
    }
}

/** The Installed room, as Community mounts it. */
export const INSTALLED_ROOM: RoomRenderer = {
    mount(el, host) {
        return new InstalledRoom(el, host);
    },
};
